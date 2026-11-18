"""F2 – Đặt lịch giữ chỗ 5 phút, chống đặt trùng, webhook thanh toán idempotent, xử lý bác sĩ nghỉ."""
import re
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import emailer
from .config import settings
from .models import Appointment, Payment, Staff, StaffLeave, SystemSetting
from .state import audit, transition
from .utils import SLOTS, gen_code, is_working_day, leave_covers, now, slot_start, today, working_days

# Trạng thái chiếm chỗ (QĐ02: tính cả HOLD chưa hết hạn)
OCCUPYING = ("CONFIRMED", "CHECKED_IN", "IN_CONSULTATION", "WAITING_LAB", "COMPLETED", "PAID")


def get_setting(db: Session, key: str, default: str = "") -> str:
    s = db.get(SystemSetting, key)
    return s.value if s else default


def get_int_setting(db: Session, key: str, default: int) -> int:
    try:
        return int(get_setting(db, key, str(default)))
    except ValueError:
        return default


def occupied_filter(at=None):
    at = at or now()
    return (Appointment.status.in_(OCCUPYING)) | (
        (Appointment.status == "HOLD") & (Appointment.hold_expires_at > at))


def count_in_slot(db: Session, doctor_id: int, d: date, slot: str, exclude_id: int | None = None) -> int:
    q = select(func.count()).select_from(Appointment).where(
        Appointment.doctor_id == doctor_id, Appointment.date == d, Appointment.slot == slot, occupied_filter())
    if exclude_id:
        q = q.where(Appointment.id != exclude_id)
    return db.scalar(q) or 0


def doctors_of(db: Session, specialty_id: int) -> list[Staff]:
    return db.query(Staff).filter(Staff.role == "DOCTOR", Staff.is_active, Staff.specialty_id == specialty_id) \
        .order_by(Staff.id).all()


def _leaves(db: Session, staff_ids: list[int], start: date, end: date) -> dict:
    out: dict = {}
    for lv in db.query(StaffLeave).filter(StaffLeave.staff_id.in_(staff_ids), StaffLeave.date >= start,
                                          StaffLeave.date <= end):
        out.setdefault((lv.staff_id, lv.date), []).append(lv.session)
    return out


def _counts(db: Session, staff_ids: list[int], start: date, end: date) -> dict:
    rows = db.execute(
        select(Appointment.doctor_id, Appointment.date, Appointment.slot, func.count())
        .where(Appointment.doctor_id.in_(staff_ids), Appointment.date >= start, Appointment.date <= end,
               occupied_filter())
        .group_by(Appointment.doctor_id, Appointment.date, Appointment.slot)).all()
    return {(r[0], r[1], r[2]): r[3] for r in rows}


def availability(db: Session, specialty_id: int, days: int | None = None) -> list[dict]:
    """Lịch các ngày làm việc sắp tới: chỉ khung còn chỗ, đã loại khung bác sĩ nghỉ và khung đủ 3 người."""
    docs = doctors_of(db, specialty_id)
    if not docs:
        return []
    dates = working_days(today(), days or settings.booking_days_ahead)
    ids = [d.id for d in docs]
    leaves = _leaves(db, ids, dates[0], dates[-1])
    counts = _counts(db, ids, dates[0], dates[-1])
    cap = settings.slot_capacity
    cutoff = now()
    result = []
    for d in dates:
        day_load = {doc.id: sum(v for (did, dd, _), v in counts.items() if did == doc.id and dd == d) for doc in docs}
        slots = []
        for slot in SLOTS:
            if slot_start(d, slot) <= cutoff:
                continue
            free_docs = []
            for doc in docs:
                if any(leave_covers(s, slot) for s in leaves.get((doc.id, d), [])):
                    continue
                left = cap - counts.get((doc.id, d, slot), 0)
                if left > 0:
                    free_docs.append({"id": doc.id, "name": doc.full_name, "room": doc.room, "left": left,
                                      "day_load": day_load[doc.id]})
            if free_docs:
                # Gợi ý bác sĩ ít lịch hẹn nhất trong ngày để cân tải
                free_docs.sort(key=lambda x: (x["day_load"], x["id"]))
                slots.append({"slot": slot, "left": sum(f["left"] for f in free_docs), "doctors": free_docs,
                              "suggested_doctor_id": free_docs[0]["id"]})
        result.append({"date": d.isoformat(), "slots": slots})
    return result


def suggest(db: Session, specialty_id: int) -> dict | None:
    for day in availability(db, specialty_id):
        if day["slots"]:
            s = day["slots"][0]
            doc = s["doctors"][0]
            return {"date": day["date"], "slot": s["slot"], "doctor": doc, "alternatives": s["doctors"][1:]}
    return None


def _on_leave(db: Session, doctor_id: int, d: date, slot: str) -> bool:
    return any(leave_covers(lv.session, slot) for lv in
               db.query(StaffLeave).filter(StaffLeave.staff_id == doctor_id, StaffLeave.date == d))


def validate_slot(d: date, slot: str):
    if slot not in SLOTS:
        raise HTTPException(400, "Khung giờ không hợp lệ")
    if not is_working_day(d):
        raise HTTPException(400, "Phòng khám không làm việc Chủ Nhật")
    if slot_start(d, slot) <= now():
        raise HTTPException(400, "Khung giờ đã qua")
    if d > today() + timedelta(days=settings.booking_days_ahead + 7):
        raise HTTPException(400, "Chỉ đặt được lịch trong 2 tuần tới")


def lock_doctor_slot(db: Session, doctor_id: int, specialty_id: int, d: date, slot: str,
                     exclude_id: int | None = None) -> Staff:
    """Khóa dòng bác sĩ (SELECT ... FOR UPDATE) rồi đếm chỗ trong cùng transaction.
    Mọi giao dịch giữ chỗ cho cùng bác sĩ phải xếp hàng ở đây, nên không thể có 2 người cùng lấy chỗ thứ 3."""
    doc = db.execute(select(Staff).where(Staff.id == doctor_id).with_for_update()).scalar_one_or_none()
    if not doc or doc.role != "DOCTOR" or not doc.is_active or doc.specialty_id != specialty_id:
        raise HTTPException(400, "Bác sĩ không thuộc chuyên khoa đã chọn")
    if _on_leave(db, doctor_id, d, slot):
        raise HTTPException(409, "Bác sĩ nghỉ vào khung giờ này, vui lòng chọn khung khác")
    if count_in_slot(db, doctor_id, d, slot, exclude_id) >= settings.slot_capacity:
        raise HTTPException(409, "Khung giờ vừa hết chỗ, vui lòng chọn khung khác")
    return doc


def create_hold(db: Session, patient_id: int, specialty_id: int, doctor_id: int, d: date, slot: str,
                triage_session_id: str | None, urgency: str | None, is_general: bool) -> Appointment:
    validate_slot(d, slot)
    try:
        lock_doctor_slot(db, doctor_id, specialty_id, d, slot)
        dup = db.scalar(select(func.count()).select_from(Appointment).where(
            Appointment.patient_id == patient_id, Appointment.date == d, Appointment.slot == slot, occupied_filter()))
        if dup:
            raise HTTPException(409, "Bạn đã có lịch hẹn ở khung giờ này")
        code = gen_code()
        while db.scalar(select(func.count()).select_from(Appointment).where(Appointment.code == code)):
            code = gen_code()
        appt = Appointment(
            code=code, patient_id=patient_id, doctor_id=doctor_id, specialty_id=specialty_id, date=d, slot=slot,
            status="HOLD", hold_expires_at=now() + timedelta(minutes=settings.hold_minutes),
            triage_session_id=triage_session_id, urgency=urgency, is_general=is_general,
            deposit_amount=get_int_setting(db, "deposit_amount", 100000),
            consultation_fee=get_int_setting(db, "consultation_fee", 150000),
        )
        db.add(appt)
        db.flush()
        audit(db, "APPOINTMENT", appt.id, "STATUS_CHANGE", "PATIENT", patient_id, to_status="HOLD",
              reason=f"Giữ chỗ {slot} {d.isoformat()}")
        db.commit()
        return appt
    except Exception:
        db.rollback()
        raise


# ───────────────────────── Thanh toán ─────────────────────────

CODE_RE = re.compile(r"[A-Z0-9]{12}")


def find_code(content: str, db: Session) -> Appointment | None:
    for m in CODE_RE.finditer((content or "").upper()):
        # Khóa dòng lịch hẹn để job hết hạn (skip_locked) không chen vào giữa
        appt = db.query(Appointment).filter(Appointment.code == m.group(0)).with_for_update().first()
        if appt:
            return appt
    return None


def process_bank_transfer(db: Session, gateway: str, txn_id: str, amount: int, content: str, raw: dict) -> dict:
    """Xử lý tiền về. Idempotent nhờ ràng buộc duy nhất trên gateway_txn_id."""
    from .billing import invoice  # tránh import vòng
    pay = Payment(kind="DEPOSIT", amount=amount, method="VIETQR", gateway=gateway,
                  gateway_txn_id=f"{gateway}:{txn_id}", status="UNMATCHED", content=content[:255], raw_payload=raw)
    db.add(pay)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return {"result": "duplicate", "message": "Giao dịch đã được ghi nhận trước đó, bỏ qua"}

    appt = find_code(content, db)
    if not appt:
        db.commit()
        return {"result": "unmatched", "message": "Không tìm thấy mã khám trong nội dung chuyển khoản"}
    pay.appointment_id = appt.id

    # Thanh toán cuối ca bằng VietQR tại quầy thuốc
    if appt.status == "COMPLETED":
        pay.kind, pay.status = "FINAL", "SUCCESS"
        db.commit()
        return {"result": "final_received", "appointment_id": appt.id, "due_after": invoice(db, appt)["due"]}

    if amount != appt.deposit_amount:
        pay.status = "AMOUNT_MISMATCH"
        pay.note = f"Số tiền {amount} khác tiền cọc {appt.deposit_amount}"
        db.commit()
        return {"result": "amount_mismatch", "appointment_id": appt.id}

    if appt.status == "HOLD" and appt.hold_expires_at and appt.hold_expires_at > now():
        pay.status = "SUCCESS"
        transition(db, appt, "CONFIRMED", "GATEWAY", reason=f"Nhận cọc {amount:,}đ – {gateway} {txn_id}")
        db.commit()
        send_confirmation(db, appt)
        return {"result": "confirmed", "appointment_id": appt.id}

    if appt.status in ("HOLD", "EXPIRED"):
        # Tiền về sau khi hết hạn giữ chỗ: còn chỗ thì khôi phục, hết chỗ thì chờ hoàn tiền
        if appt.status == "HOLD":
            transition(db, appt, "EXPIRED", "GATEWAY", reason="Tiền về sau khi hết hạn giữ chỗ")
        try:
            lock_doctor_slot(db, appt.doctor_id, appt.specialty_id, appt.date, appt.slot, exclude_id=appt.id)
            if slot_start(appt.date, appt.slot) <= now():
                raise HTTPException(409, "Khung giờ đã qua")
            pay.status = "SUCCESS"
            transition(db, appt, "CONFIRMED", "GATEWAY", reason="Tiền về muộn, khung giờ còn chỗ – khôi phục lịch")
            db.commit()
            send_confirmation(db, appt)
            return {"result": "restored", "appointment_id": appt.id}
        except HTTPException:
            pay.status = "REFUND_PENDING"
            pay.note = "Tiền về sau khi hết hạn giữ chỗ và khung giờ đã hết chỗ"
            db.commit()
            return {"result": "refund_pending", "appointment_id": appt.id}

    # Đã CONFIRMED / đã hủy... mà vẫn chuyển thêm -> chờ hoàn
    pay.status = "REFUND_PENDING"
    pay.note = f"Nhận tiền khi lịch đang ở trạng thái {appt.status}"
    db.commit()
    return {"result": "refund_pending", "appointment_id": appt.id}


def send_confirmation(db: Session, appt: Appointment):
    p = appt.patient
    body = f"""<p>Chào {p.full_name},</p>
<p>Lịch khám của bạn đã được xác nhận.</p>
<table style="border-collapse:collapse">
<tr><td style="padding:4px 12px 4px 0;color:#6b7785">Mã khám</td><td><b style="font-family:monospace;font-size:18px">{appt.code}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#6b7785">Thời gian</td><td><b>{appt.slot} – {appt.date.strftime('%d/%m/%Y')}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#6b7785">Bác sĩ</td><td>{appt.doctor.full_name} · {appt.doctor.room or ''}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#6b7785">Chuyên khoa</td><td>{appt.specialty.name}</td></tr></table>
<p>Khi đến phòng khám, đưa mã QR dưới đây vào máy kiosk ở quầy để check-in:</p>
<img src="cid:qr" width="220" height="220" alt="QR mã khám {appt.code}">
<p>Vui lòng đến trước giờ hẹn 10 phút. Trễ quá 15 phút lịch sẽ bị hủy và không hoàn cọc.</p>"""
    emailer.send_email(p.email, f"Xác nhận lịch khám {appt.code}", emailer.layout("Đặt lịch thành công", body),
                       qr_data=appt.code)


# ───────────────────────── Bác sĩ nghỉ đột xuất ─────────────────────────

def affected_by_leave(db: Session, doctor: Staff, d: date, session: str) -> list[dict]:
    appts = db.query(Appointment).filter(Appointment.doctor_id == doctor.id, Appointment.date == d,
                                         Appointment.status.in_(("CONFIRMED", "HOLD"))).order_by(Appointment.slot).all()
    out = []
    for a in appts:
        if not leave_covers(session, a.slot):
            continue
        replacement = None
        for other in doctors_of(db, doctor.specialty_id):
            if other.id == doctor.id or _on_leave(db, other.id, d, a.slot):
                continue
            if count_in_slot(db, other.id, d, a.slot) < settings.slot_capacity:
                replacement = other
                break
        out.append({"appointment": a, "replacement": replacement})
    return out

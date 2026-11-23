"""F2 – Đặt lịch giữ chỗ 5 phút, chống đặt trùng, thanh toán cọc qua payOS (idempotent), xử lý bác sĩ nghỉ."""
import secrets
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import emailer, payos
from .config import settings
from .models import Appointment, Payment, Staff, StaffLeave, SystemSetting
from .state import audit, transition
from .utils import SLOTS, gen_code, is_working_day, leave_covers, now, slot_start, today, working_days
from .vietqr import build_payload

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


# ───────────────────────── Thanh toán cọc (payOS) ─────────────────────────
# Mỗi lịch HOLD có một dòng PAYMENTS trạng thái PENDING gắn với một đơn payOS; gateway_txn_id = "PAYOS:<orderCode>"
# (ràng buộc duy nhất). Webhook / tra trạng thái chỉ xử lý dòng còn PENDING, nên nhận trùng không ghi nhận hai lần.

BANKS = {"970422": "MB Bank", "970436": "Vietcombank", "970415": "VietinBank", "970418": "BIDV",
         "970405": "Agribank", "970407": "Techcombank", "970416": "ACB", "970432": "VPBank", "970423": "TPBank",
         "970403": "Sacombank"}


def _order_ref(order_code: int) -> str:
    return f"PAYOS:{order_code}"


def _new_order_code(db: Session) -> int:
    """payOS cần orderCode là số nguyên dương, duy nhất trên toàn bộ tài khoản merchant."""
    for _ in range(10):
        code = 100_000_000 + secrets.randbelow(900_000_000)
        if not db.query(Payment.id).filter(Payment.gateway_txn_id == _order_ref(code)).first():
            return code
    raise HTTPException(500, "Không tạo được mã đơn thanh toán")


def pending_deposit(appt: Appointment) -> Payment | None:
    return next((p for p in reversed(appt.payments)
                 if p.gateway == "PAYOS" and p.kind == "DEPOSIT" and p.status == "PENDING"), None)


def deposit_order(db: Session, appt: Appointment, *, offline: bool = False) -> Payment:
    """Lấy hoặc tạo đơn thanh toán cọc. Đã cấu hình payOS thì tạo link thật (hết hạn cùng lúc với giữ chỗ);
    chưa cấu hình (hoặc offline=True) thì chỉ tạo đơn nội bộ để demo bằng nút giả lập."""
    pay = pending_deposit(appt)
    if pay:
        return pay
    code = _new_order_code(db)
    description = f"Coc {appt.code}"
    link = {}
    if payos.is_configured() and not offline:
        base = (settings.payos_domain or settings.frontend_url).rstrip("/")
        link = payos.create_payment_link(
            order_code=code, amount=appt.deposit_amount, description=description,
            return_url=f"{base}/lich-hen/{appt.id}?payment=success",
            cancel_url=f"{base}/lich-hen/{appt.id}?payment=cancel",
            expired_at=int(appt.hold_expires_at.timestamp()) if appt.hold_expires_at else None)
    pay = Payment(kind="DEPOSIT", amount=appt.deposit_amount, method="PAYOS", gateway="PAYOS",
                  gateway_txn_id=_order_ref(code), status="PENDING", content=link.get("description") or description,
                  raw_payload={"order_code": code, "link": link})
    appt.payments.append(pay)
    db.flush()
    return pay


def deposit_info(db: Session, appt: Appointment) -> dict:
    """Thông tin chuyển khoản cọc hiển thị cho bệnh nhân khi lịch đang HOLD."""
    info = {"provider": "PAYOS" if payos.is_configured() else "DEMO", "amount": appt.deposit_amount,
            "content": appt.code, "bank_name": None, "account": None, "account_name": None, "vietqr": None,
            "checkout_url": None, "error": None, "server_now": now().isoformat()}
    if not appt.hold_expires_at or appt.hold_expires_at <= now():
        return info
    try:
        pay = deposit_order(db, appt)
        db.commit()
    except payos.PayOSError as e:
        db.rollback()
        info["error"] = f"Chưa tạo được mã thanh toán payOS: {e}"
        return info
    link = (pay.raw_payload or {}).get("link") or {}
    if link:
        bin_ = str(link.get("bin") or "")
        info.update(content=pay.content, vietqr=link.get("qrCode"), checkout_url=link.get("checkoutUrl"),
                    account=link.get("accountNumber"), account_name=link.get("accountName"),
                    bank_name=BANKS.get(bin_) or (get_setting(db, "bank_name") if bin_ == get_setting(db, "bank_bin")
                                                  else f"Ngân hàng (BIN {bin_})"))
    else:  # chưa cấu hình payOS: VietQR tĩnh tới tài khoản phòng khám, xác nhận bằng nút giả lập
        account = get_setting(db, "bank_account", "0000000000")
        info.update(content=pay.content, account=account,
                    bank_name=get_setting(db, "bank_name", "MB Bank"),
                    account_name=get_setting(db, "bank_account_name", "PHONG KHAM MEDCARE"),
                    vietqr=build_payload(get_setting(db, "bank_bin", "970422"), account, appt.deposit_amount,
                                         pay.content))
    return info


def confirm_deposit(db: Session, order_code: int, amount: int, reference: str, raw: dict) -> dict:
    """payOS báo đơn đã thanh toán (webhook hoặc tra trạng thái). Idempotent: chỉ xử lý đơn còn PENDING."""
    pay = db.query(Payment).filter(Payment.gateway_txn_id == _order_ref(order_code)).with_for_update().first()
    if not pay:
        return {"result": "unmatched", "message": "Không tìm thấy đơn thanh toán"}
    if pay.status != "PENDING":
        return {"result": "duplicate", "appointment_id": pay.appointment_id,
                "message": "Giao dịch đã được ghi nhận trước đó, bỏ qua"}
    # Khóa dòng lịch hẹn để job hết hạn (skip_locked) không chen vào giữa
    appt = db.query(Appointment).filter(Appointment.id == pay.appointment_id).with_for_update().one()
    pay.amount = amount
    pay.note = f"Mã giao dịch {reference}" if reference else None
    pay.raw_payload = {**(pay.raw_payload or {}), "paid": raw}

    if amount != appt.deposit_amount:
        pay.status = "AMOUNT_MISMATCH"
        pay.note = f"Số tiền {amount} khác tiền cọc {appt.deposit_amount}"
        db.commit()
        return {"result": "amount_mismatch", "appointment_id": appt.id}

    if appt.status == "HOLD" and appt.hold_expires_at and appt.hold_expires_at > now():
        pay.status = "SUCCESS"
        transition(db, appt, "CONFIRMED", "GATEWAY", reason=f"Nhận cọc {amount:,}đ qua payOS – đơn {order_code}")
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

    # Đã hủy... mà vẫn chuyển tiền -> chờ hoàn
    pay.status = "REFUND_PENDING"
    pay.note = f"Nhận tiền khi lịch đang ở trạng thái {appt.status}"
    db.commit()
    return {"result": "refund_pending", "appointment_id": appt.id}


def sync_deposit(db: Session, appt: Appointment) -> dict | None:
    """Hỏi payOS trạng thái đơn cọc đang chờ – dùng khi webhook không tới được (vd. chạy trên localhost)."""
    pay = pending_deposit(appt)
    if not pay or not payos.is_configured() or not (pay.raw_payload or {}).get("link"):
        return None
    order_code = pay.raw_payload["order_code"]
    info = payos.get_payment_info(order_code)
    status = info.get("status")
    if status == "PAID":
        tx = (info.get("transactions") or [{}])[0]
        return confirm_deposit(db, order_code, int(info.get("amountPaid") or info.get("amount") or 0),
                               str(tx.get("reference") or ""), info)
    if status in ("CANCELLED", "EXPIRED"):
        pay.status = "CANCELLED"
        pay.note = f"Link payOS {status}"
        db.commit()
    return None


def cancel_deposit_link(db: Session, appt: Appointment):
    """Bệnh nhân hủy khi đang giữ chỗ: hủy link payOS. Chỉ đánh dấu CANCELLED khi payOS xác nhận đã hủy
    (link đã được trả tiền thì payOS từ chối, webhook sau đó sẽ chuyển khoản tiền sang chờ hoàn)."""
    pay = pending_deposit(appt)
    if not pay or not payos.is_configured() or not (pay.raw_payload or {}).get("link"):
        return
    try:
        payos.cancel_payment_link(pay.raw_payload["order_code"], "Benh nhan huy lich")
    except payos.PayOSError:
        return
    pay.status = "CANCELLED"
    pay.note = "Bệnh nhân hủy lịch khi đang giữ chỗ"


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

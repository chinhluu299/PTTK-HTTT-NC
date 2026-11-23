from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import booking, payos
from ..config import settings
from ..db import get_db
from ..models import Appointment, Patient, PharmacyQueue, Specialty, TriageSession
from ..realtime import broker
from ..security import current_patient
from ..serializers import appt_brief, visit_summary
from ..state import audit, transition
from ..utils import now, slot_start, today

router = APIRouter(prefix="/api", tags=["F2 – Đặt lịch"])


def _specialty(db: Session, specialty_id: int) -> Specialty:
    sp = db.get(Specialty, specialty_id)
    if not sp or not sp.is_active:
        raise HTTPException(404, "Không tìm thấy chuyên khoa")
    return sp


@router.get("/booking/availability")
def availability(specialty_id: int, db: Session = Depends(get_db)):
    _specialty(db, specialty_id)
    return booking.availability(db, specialty_id)


@router.get("/booking/suggest")
def suggest(specialty_id: int, db: Session = Depends(get_db)):
    """Đề xuất sẵn khung giờ sớm nhất còn chỗ và bác sĩ phù hợp nhất (cân tải)."""
    sp = _specialty(db, specialty_id)
    return {"specialty": {"id": sp.id, "name": sp.name}, "suggestion": booking.suggest(db, specialty_id)}


class HoldIn(BaseModel):
    specialty_id: int
    doctor_id: int
    date: date
    slot: str
    triage_session_id: str | None = None
    is_general: bool = False


@router.post("/appointments/hold")
def hold(body: HoldIn, p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    urgency, sid = None, None
    sp = _specialty(db, body.specialty_id)
    if body.is_general:
        # QĐ07: Khám tổng quát bỏ qua AI, gán Nội tổng quát
        if not sp.is_general:
            raise HTTPException(400, "Khám tổng quát chỉ áp dụng cho chuyên khoa Nội tổng quát")
    elif body.triage_session_id:
        # Đặt lịch sau khi hỏi trợ lý: kiểm tra phiên trò chuyện (cảnh báo cấp cứu, đã có gợi ý)
        s = db.get(TriageSession, body.triage_session_id)
        if not s:
            raise HTTPException(400, "Không tìm thấy phiên trò chuyện với trợ lý")
        if s.patient_id not in (None, p.id):
            raise HTTPException(403, "Phiên trò chuyện không thuộc tài khoản của bạn")
        if s.state == "EMERGENCY" and not s.emergency_acknowledged:
            raise HTTPException(403, "Bạn cần đọc và xác nhận cảnh báo cấp cứu trước khi đặt lịch")
        if s.state not in ("DONE", "EMERGENCY"):
            raise HTTPException(400, "Trợ lý chưa hoàn tất gợi ý chuyên khoa")
        if s.patient_id is None:
            s.patient_id = p.id
        urgency, sid = s.urgency, s.id
    appt = booking.create_hold(db, p.id, body.specialty_id, body.doctor_id, body.date, body.slot, sid, urgency,
                               body.is_general)
    return _detail(db, appt)


def _own(db: Session, appt_id: int, p: Patient) -> Appointment:
    a = db.get(Appointment, appt_id)
    if not a:
        raise HTTPException(404, "Không tìm thấy lịch hẹn")
    if a.patient_id != p.id:
        raise HTTPException(403, "Bạn không có quyền xem lịch hẹn này")
    return a


def _detail(db: Session, a: Appointment) -> dict:
    d = appt_brief(a)
    d["patient"] = {"full_name": a.patient.full_name, "phone": a.patient.phone}
    if a.status == "HOLD":
        d["payment"] = booking.deposit_info(db, a)
    d["deposit_paid"] = sum(x.amount for x in a.payments if x.kind == "DEPOSIT" and x.status == "SUCCESS")
    d["refund_pending"] = any(x.status == "REFUND_PENDING" for x in a.payments)
    d["can_cancel"] = a.status in ("HOLD", "CONFIRMED")
    d["refundable"] = a.status == "CONFIRMED" and (
        a.leave_conflict or slot_start(a.date, a.slot) - now() >= timedelta(hours=settings.refund_min_hours))
    t = a.queue_ticket
    d["queue"] = {"number": t.number, "status": t.status, "call_count": t.call_count,
                  "ahead": _ahead(db, t)} if t else None
    if a.status in ("COMPLETED", "PAID"):
        # Kết quả và đơn thuốc chỉ hiện khi ca đã COMPLETED
        d["visit"] = visit_summary(db, a)
    return d


def _ahead(db: Session, t: PharmacyQueue) -> int:
    if t.status == "SERVED":
        return 0
    return db.query(PharmacyQueue).filter(PharmacyQueue.queue_date == t.queue_date,
                                          PharmacyQueue.status.in_(("WAITING", "CALLED")),
                                          PharmacyQueue.position < t.position).count()


@router.get("/appointments/mine")
def mine(p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    rows = db.query(Appointment).filter(Appointment.patient_id == p.id) \
        .order_by(Appointment.date.desc(), Appointment.slot.desc()).limit(100).all()
    out = []
    for a in rows:
        d = appt_brief(a)
        d["diagnosis"] = a.record.diagnosis if a.record and a.status in ("COMPLETED", "PAID") else None
        d["queue_number"] = a.queue_ticket.number if a.queue_ticket and a.status == "COMPLETED" else None
        out.append(d)
    return out


@router.get("/appointments/{appt_id}")
def detail(appt_id: int, p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    return _detail(db, _own(db, appt_id, p))


@router.post("/appointments/{appt_id}/payment/check")
def check_payment(appt_id: int, p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    """Tra trạng thái đơn cọc trên payOS (khi bệnh nhân quay lại từ trang thanh toán, hoặc webhook chưa tới)."""
    a = _own(db, appt_id, p)
    if a.status in ("HOLD", "EXPIRED"):
        try:
            res = booking.sync_deposit(db, a)
        except payos.PayOSError as e:
            raise HTTPException(502, str(e))
        if res and res.get("appointment_id") and res["result"] != "duplicate":
            broker.publish(f"patient:{a.patient_id}", "appointment_updated", {"appointment_id": a.id})
        db.refresh(a)
    return _detail(db, a)


@router.post("/appointments/{appt_id}/cancel")
def cancel(appt_id: int, p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    """QĐ05: hủy trước giờ hẹn ≥ 12 giờ được hoàn cọc; hủy muộn hơn -> NO_SHOW, không hoàn cọc.
    Lịch bị ảnh hưởng do bác sĩ nghỉ thì luôn được hoàn cọc."""
    a = _own(db, appt_id, p)
    if a.status == "HOLD":
        booking.cancel_deposit_link(db, a)
        transition(db, a, "CANCELLED", "PATIENT", p.id, p.full_name, reason="Bệnh nhân hủy khi đang giữ chỗ")
    elif a.status == "CONFIRMED":
        early = slot_start(a.date, a.slot) - now() >= timedelta(hours=settings.refund_min_hours)
        if early or a.leave_conflict:
            transition(db, a, "CANCELLED", "PATIENT", p.id, p.full_name,
                       reason="Bệnh nhân hủy – được hoàn cọc" + (" (bác sĩ nghỉ)" if a.leave_conflict else ""))
            for pay in a.payments:
                if pay.kind == "DEPOSIT" and pay.status == "SUCCESS":
                    pay.status = "REFUND_PENDING"
            a.leave_conflict = False
        else:
            transition(db, a, "NO_SHOW", "PATIENT", p.id, p.full_name,
                       reason=f"Hủy muộn (dưới {settings.refund_min_hours} giờ trước giờ hẹn) – không hoàn cọc")
    else:
        raise HTTPException(409, "Lịch hẹn này không thể hủy")
    db.commit()
    return _detail(db, a)


class ResolveIn(BaseModel):
    action: str  # ACCEPT_REPLACEMENT | REFUND


@router.post("/appointments/{appt_id}/resolve-leave")
def resolve_leave(appt_id: int, body: ResolveIn, p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    """Bác sĩ nghỉ: bệnh nhân chọn nhận bác sĩ thay thế hoặc hoàn cọc (đổi giờ dùng /reschedule)."""
    a = _own(db, appt_id, p)
    if not a.leave_conflict or a.status != "CONFIRMED":
        raise HTTPException(409, "Lịch hẹn không cần xử lý")
    if body.action == "ACCEPT_REPLACEMENT":
        if not a.leave_suggested_doctor_id:
            raise HTTPException(409, "Không có bác sĩ thay thế, vui lòng đổi giờ hoặc hoàn cọc")
        try:
            booking.lock_doctor_slot(db, a.leave_suggested_doctor_id, a.specialty_id, a.date, a.slot)
        except HTTPException:
            db.rollback()
            raise HTTPException(409, "Bác sĩ thay thế vừa hết chỗ ở khung giờ này, vui lòng đổi giờ hoặc hoàn cọc")
        audit(db, "APPOINTMENT", a.id, "CHANGE_DOCTOR", "PATIENT", p.id, p.full_name,
              old_value={"doctor_id": a.doctor_id}, new_value={"doctor_id": a.leave_suggested_doctor_id},
              reason="Bác sĩ nghỉ – bệnh nhân nhận bác sĩ thay thế")
        a.doctor_id = a.leave_suggested_doctor_id
        a.leave_conflict, a.leave_suggested_doctor_id = False, None
    elif body.action == "REFUND":
        transition(db, a, "CANCELLED", "PATIENT", p.id, p.full_name, reason="Bác sĩ nghỉ – bệnh nhân chọn hoàn cọc")
        for pay in a.payments:
            if pay.kind == "DEPOSIT" and pay.status == "SUCCESS":
                pay.status = "REFUND_PENDING"
        a.leave_conflict = False
    else:
        raise HTTPException(400, "Lựa chọn không hợp lệ")
    db.commit()
    db.refresh(a)
    return _detail(db, a)


class RescheduleIn(BaseModel):
    doctor_id: int
    date: date
    slot: str


@router.post("/appointments/{appt_id}/reschedule")
def reschedule(appt_id: int, body: RescheduleIn, p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    a = _own(db, appt_id, p)
    if not a.leave_conflict or a.status != "CONFIRMED":
        raise HTTPException(409, "Chỉ đổi giờ được với lịch bị ảnh hưởng do bác sĩ nghỉ")
    booking.validate_slot(body.date, body.slot)
    try:
        booking.lock_doctor_slot(db, body.doctor_id, a.specialty_id, body.date, body.slot, exclude_id=a.id)
    except HTTPException:
        db.rollback()
        raise
    audit(db, "APPOINTMENT", a.id, "RESCHEDULE", "PATIENT", p.id, p.full_name,
          old_value={"doctor_id": a.doctor_id, "date": a.date.isoformat(), "slot": a.slot},
          new_value={"doctor_id": body.doctor_id, "date": body.date.isoformat(), "slot": body.slot},
          reason="Bác sĩ nghỉ – bệnh nhân đổi giờ")
    a.doctor_id, a.date, a.slot = body.doctor_id, body.date, body.slot
    a.leave_conflict, a.leave_suggested_doctor_id = False, None
    db.commit()
    db.refresh(a)
    return _detail(db, a)


@router.get("/patients/me/active")
def active(p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    """Lịch hôm nay / sắp tới cần chú ý (hiển thị trên trang chủ của bệnh nhân, gồm số thứ tự quầy thuốc)."""
    rows = db.query(Appointment).filter(
        Appointment.patient_id == p.id, Appointment.date >= today(),
        Appointment.status.in_(("HOLD", "CONFIRMED", "CHECKED_IN", "IN_CONSULTATION", "WAITING_LAB", "COMPLETED"))) \
        .order_by(Appointment.date, Appointment.slot).all()
    return [_detail(db, a) for a in rows if a.status != "HOLD" or (a.hold_expires_at and a.hold_expires_at > now())]


@router.get("/patients/me/records")
def records(p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    rows = db.query(Appointment).filter(Appointment.patient_id == p.id,
                                        Appointment.status.in_(("COMPLETED", "PAID"))) \
        .order_by(Appointment.date.desc()).all()
    return [visit_summary(db, a) for a in rows]


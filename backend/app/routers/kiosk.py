"""Check-in tại kiosk (máy tính bảng ở quầy): quét QR mã khám hoặc nhập số điện thoại."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Appointment, Patient
from ..realtime import broker
from ..state import transition
from ..utils import mask_name, now, today

router = APIRouter(prefix="/api/kiosk", tags=["Check-in"])


def _public(a: Appointment, db: Session) -> dict:
    waiting = db.query(Appointment).filter(Appointment.doctor_id == a.doctor_id, Appointment.date == a.date,
                                           Appointment.status == "CHECKED_IN",
                                           Appointment.checked_in_at < (a.checked_in_at or now())).count()
    return {"id": a.id, "patient": mask_name(a.patient.full_name), "slot": a.slot, "date": a.date.isoformat(),
            "doctor": a.doctor.full_name, "room": a.doctor.room, "specialty": a.specialty.name, "status": a.status,
            "waiting_before": waiting}


def _checkin(db: Session, a: Appointment) -> dict:
    if a.status == "CHECKED_IN":
        return {"already": True, **_public(a, db)}
    if a.date != today():
        raise HTTPException(409, f"Lịch hẹn này vào ngày {a.date.strftime('%d/%m/%Y')}, không phải hôm nay")
    if a.status == "HOLD":
        raise HTTPException(409, "Lịch hẹn chưa được đặt cọc")
    if a.status == "NO_SHOW":
        raise HTTPException(409, "Lịch hẹn đã quá giờ 15 phút và bị hủy. Vui lòng đặt lịch mới")
    if a.status != "CONFIRMED":
        raise HTTPException(409, "Lịch hẹn không ở trạng thái chờ check-in")
    transition(db, a, "CHECKED_IN", "KIOSK", reason="Check-in tại kiosk")
    a.checked_in_at = now()
    db.commit()
    broker.publish(f"staff:{a.doctor_id}", "checked_in", {"appointment_id": a.id, "patient": a.patient.full_name})
    return {"already": False, **_public(a, db)}


class CodeIn(BaseModel):
    code: str


@router.post("/checkin")
def checkin_code(body: CodeIn, db: Session = Depends(get_db)):
    a = db.query(Appointment).filter(Appointment.code == body.code.strip().upper()).first()
    if not a:
        raise HTTPException(404, "Không tìm thấy mã khám. Kiểm tra lại hoặc tra bằng số điện thoại")
    return _checkin(db, a)


class PhoneIn(BaseModel):
    phone: str


@router.post("/lookup")
def lookup(body: PhoneIn, db: Session = Depends(get_db)):
    phone = "".join(c for c in body.phone if c.isdigit())
    p = db.query(Patient).filter(Patient.phone == phone).first()
    if not p:
        return []
    rows = db.query(Appointment).filter(Appointment.patient_id == p.id, Appointment.date == today(),
                                        Appointment.status.in_(("CONFIRMED", "CHECKED_IN"))) \
        .order_by(Appointment.slot).all()
    return [_public(a, db) for a in rows]


class CheckinIdIn(BaseModel):
    appointment_id: int
    phone: str


@router.post("/checkin-by-phone")
def checkin_phone(body: CheckinIdIn, db: Session = Depends(get_db)):
    a = db.get(Appointment, body.appointment_id)
    phone = "".join(c for c in body.phone if c.isdigit())
    if not a or a.patient.phone != phone:
        raise HTTPException(404, "Không tìm thấy lịch hẹn")
    return _checkin(db, a)

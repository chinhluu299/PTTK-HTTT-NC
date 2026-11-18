"""Dược sĩ kiêm thu ngân: gọi số, thu tiền, giao thuốc. Chỉ xem đơn và hóa đơn của ca đã COMPLETED, không sửa đơn."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..billing import invoice
from ..booking import get_setting
from ..db import get_db
from ..models import Appointment, Patient, Payment, PharmacyQueue, Staff
from ..realtime import broker
from ..security import require_role
from ..serializers import appt_brief, prescription_dict
from ..state import transition
from ..utils import now, today
from ..vietqr import build_payload

router = APIRouter(prefix="/api", tags=["Quầy thuốc"])
pharm_dep = require_role("PHARMACIST")
MAX_CALLS = 3


def _ticket(t: PharmacyQueue) -> dict:
    a = t.appointment
    return {"id": t.id, "number": t.number, "status": t.status, "call_count": t.call_count, "skip_count": t.skip_count,
            "position": t.position, "last_called_at": t.last_called_at.isoformat() if t.last_called_at else None,
            "appointment_id": a.id, "code": a.code, "patient": a.patient.full_name, "phone": a.patient.phone,
            "appointment_status": a.status, "has_prescription": bool(a.prescription and a.prescription.details)}


def _announce(t: PharmacyQueue):
    broker.publish("display", "call", {"number": t.number, "call_count": t.call_count})
    broker.publish("display", "queue_updated", {})
    broker.publish(f"patient:{t.appointment.patient_id}", "queue_called", {"number": t.number})


@router.get("/pharmacy/queue")
def queue(_: Staff = Depends(pharm_dep), db: Session = Depends(get_db)):
    rows = db.query(PharmacyQueue).filter(PharmacyQueue.queue_date == today()).order_by(PharmacyQueue.position).all()
    return {"waiting": [_ticket(t) for t in rows if t.status in ("WAITING", "CALLED")],
            "served": [_ticket(t) for t in sorted(rows, key=lambda x: -x.number) if t.status == "SERVED"]}


def _get_ticket(db: Session, ticket_id: int) -> PharmacyQueue:
    t = db.execute(select(PharmacyQueue).where(PharmacyQueue.id == ticket_id).with_for_update()).scalar_one_or_none()
    if not t or t.queue_date != today():
        raise HTTPException(404, "Không tìm thấy số thứ tự")
    return t


@router.post("/pharmacy/queue/call-next")
def call_next(_: Staff = Depends(pharm_dep), db: Session = Depends(get_db)):
    t = db.execute(select(PharmacyQueue).where(PharmacyQueue.queue_date == today(), PharmacyQueue.status == "WAITING")
                   .order_by(PharmacyQueue.position).limit(1).with_for_update(skip_locked=True)).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Không còn ai trong hàng chờ")
    t.status, t.call_count, t.last_called_at = "CALLED", 1, now()
    db.commit()
    _announce(t)
    return _ticket(t)


@router.post("/pharmacy/queue/{ticket_id}/call")
def recall(ticket_id: int, _: Staff = Depends(pharm_dep), db: Session = Depends(get_db)):
    t = _get_ticket(db, ticket_id)
    if t.status == "SERVED":
        raise HTTPException(409, "Số này đã được phục vụ")
    if t.call_count >= MAX_CALLS:
        raise HTTPException(409, f"Đã gọi {MAX_CALLS} lần, hãy chuyển số này xuống cuối hàng")
    t.status, t.call_count, t.last_called_at = "CALLED", t.call_count + 1, now()
    db.commit()
    _announce(t)
    return _ticket(t)


@router.post("/pharmacy/queue/{ticket_id}/skip")
def skip(ticket_id: int, _: Staff = Depends(pharm_dep), db: Session = Depends(get_db)):
    """Gọi 3 lần không thấy đến thì chuyển xuống cuối hàng."""
    t = _get_ticket(db, ticket_id)
    if t.call_count < MAX_CALLS:
        raise HTTPException(409, f"Cần gọi đủ {MAX_CALLS} lần trước khi chuyển xuống cuối hàng")
    max_pos = db.scalar(select(func.max(PharmacyQueue.position)).where(PharmacyQueue.queue_date == t.queue_date))
    t.position, t.status, t.call_count, t.skip_count = max_pos + 1, "WAITING", 0, t.skip_count + 1
    db.commit()
    broker.publish("display", "queue_updated", {})
    return _ticket(t)


def _completed(db: Session, appt_id: int) -> Appointment:
    a = db.get(Appointment, appt_id)
    if not a:
        raise HTTPException(404, "Không tìm thấy ca")
    if a.status not in ("COMPLETED", "PAID"):
        raise HTTPException(403, "Chỉ xem được đơn thuốc và hóa đơn của ca đã chốt")
    return a


@router.get("/pharmacy/appointments/{appt_id}")
def bill(appt_id: int, _: Staff = Depends(pharm_dep), db: Session = Depends(get_db)):
    a = _completed(db, appt_id)
    inv = invoice(db, a)
    rx = prescription_dict(a)
    out = {"appointment": appt_brief(a), "patient": {"full_name": a.patient.full_name, "phone": a.patient.phone,
                                                     "birth_year": a.patient.birth_year},
           "invoice": inv, "prescription": rx,
           "ticket": _ticket(a.queue_ticket) if a.queue_ticket else None,
           "payments": [{"kind": p.kind, "amount": p.amount, "method": p.method, "status": p.status,
                         "created_at": p.created_at.isoformat()} for p in a.payments]}
    if a.status == "COMPLETED" and inv["due"] > 0:
        account = get_setting(db, "bank_account", "0000000000")
        out["vietqr"] = {"payload": build_payload(get_setting(db, "bank_bin", "970422"), account, inv["due"], a.code),
                         "amount": inv["due"], "content": a.code, "account": account,
                         "bank_name": get_setting(db, "bank_name", "MB Bank")}
    return out


@router.get("/pharmacy/lookup")
def lookup(q: str, _: Staff = Depends(pharm_dep), db: Session = Depends(get_db)):
    """Tra theo mã khám, hoặc theo số điện thoại khi bệnh nhân quên mã."""
    q = q.strip().upper()
    query = db.query(Appointment).join(Patient).filter(Appointment.status.in_(("COMPLETED", "PAID")))
    digits = "".join(c for c in q if c.isdigit())
    if len(q) == 12 and q.isalnum() and not q.isdigit():
        query = query.filter(Appointment.code == q)
    elif len(digits) >= 9:
        query = query.filter(Patient.phone == digits)
    else:
        raise HTTPException(400, "Nhập mã khám 12 ký tự hoặc số điện thoại")
    rows = query.order_by(Appointment.date.desc()).limit(10).all()
    return [{**appt_brief(a), "patient": a.patient.full_name, "queue_number": a.queue_ticket.number
             if a.queue_ticket else None} for a in rows]


class PayIn(BaseModel):
    method: str  # CASH | VIETQR


@router.post("/pharmacy/appointments/{appt_id}/pay")
def pay(appt_id: int, body: PayIn, s: Staff = Depends(pharm_dep), db: Session = Depends(get_db)):
    """Dược sĩ bấm 'Đã thanh toán' sau khi thu tiền và giao thuốc."""
    if body.method not in ("CASH", "VIETQR"):
        raise HTTPException(400, "Hình thức thanh toán không hợp lệ")
    a = db.execute(select(Appointment).where(Appointment.id == appt_id).with_for_update()).scalar_one_or_none()
    if not a or a.status != "COMPLETED":
        raise HTTPException(409, "Ca không ở trạng thái chờ thanh toán")
    inv = invoice(db, a)
    if inv["due"] > 0:
        db.add(Payment(appointment_id=a.id, kind="FINAL", amount=inv["due"], method=body.method, status="SUCCESS",
                       note=f"Thu tại quầy bởi {s.full_name}"))
    transition(db, a, "PAID", "PHARMACIST", s.id, s.full_name,
               reason=f"Thu {inv['due']:,}đ ({'tiền mặt' if body.method == 'CASH' else 'VietQR'}), giao thuốc")
    if a.queue_ticket:
        a.queue_ticket.status = "SERVED"
    db.commit()
    broker.publish("display", "queue_updated", {})
    broker.publish(f"patient:{a.patient_id}", "appointment_updated", {"appointment_id": a.id})
    return {"ok": True, "paid": inv["due"]}


@router.get("/display/pharmacy")
def display(db: Session = Depends(get_db)):
    """Dữ liệu màn hình chờ (công khai): chỉ số thứ tự, không có tên."""
    rows = db.query(PharmacyQueue).filter(PharmacyQueue.queue_date == today()).order_by(PharmacyQueue.position).all()
    called = sorted([t for t in rows if t.status == "CALLED"], key=lambda t: t.last_called_at or now(), reverse=True)
    return {"called": [{"number": t.number, "call_count": t.call_count} for t in called],
            "waiting": [t.number for t in rows if t.status == "WAITING"],
            "served_count": sum(1 for t in rows if t.status == "SERVED")}

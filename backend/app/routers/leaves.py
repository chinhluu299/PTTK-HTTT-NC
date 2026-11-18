"""Lịch nghỉ nhân viên (QĐ03) + xử lý lịch hẹn bị ảnh hưởng khi bác sĩ nghỉ (F2)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import emailer
from ..booking import affected_by_leave
from ..config import settings
from ..db import get_db
from ..models import StaffLeave, Staff
from ..security import require_role
from ..state import audit
from ..utils import today

router = APIRouter(prefix="/api/leaves", tags=["Lịch nghỉ"])
staff_dep = require_role("DOCTOR", "TECHNICIAN", "PHARMACIST")
SESSION_LABEL = {"MORNING": "buổi sáng", "AFTERNOON": "buổi chiều", "FULL_DAY": "cả ngày"}


class LeaveIn(BaseModel):
    date: date
    session: str
    reason: str | None = None


def _validate(body: LeaveIn):
    if body.session not in SESSION_LABEL:
        raise HTTPException(400, "Buổi nghỉ không hợp lệ")
    if body.date < today():
        raise HTTPException(400, "Không đăng ký nghỉ cho ngày đã qua")


@router.get("/mine")
def mine(s: Staff = Depends(staff_dep), db: Session = Depends(get_db)):
    rows = db.query(StaffLeave).filter(StaffLeave.staff_id == s.id, StaffLeave.date >= today()) \
        .order_by(StaffLeave.date).all()
    return [{"id": l.id, "date": l.date.isoformat(), "session": l.session, "session_label": SESSION_LABEL[l.session],
             "reason": l.reason} for l in rows]


def _affected_view(items) -> list[dict]:
    return [{"appointment_id": x["appointment"].id, "code": x["appointment"].code, "slot": x["appointment"].slot,
             "status": x["appointment"].status, "patient": x["appointment"].patient.full_name,
             "phone": x["appointment"].patient.phone,
             "replacement": {"id": x["replacement"].id, "full_name": x["replacement"].full_name}
             if x["replacement"] else None} for x in items]


@router.post("/preview")
def preview(body: LeaveIn, s: Staff = Depends(staff_dep), db: Session = Depends(get_db)):
    """Trước khi lưu đơn nghỉ: liệt kê bệnh nhân bị ảnh hưởng và bác sĩ thay thế đề xuất."""
    _validate(body)
    if s.role != "DOCTOR":
        return {"affected": []}
    return {"affected": _affected_view(affected_by_leave(db, s, body.date, body.session))}


@router.post("")
def create(body: LeaveIn, s: Staff = Depends(staff_dep), db: Session = Depends(get_db)):
    _validate(body)
    exists = db.query(StaffLeave).filter(StaffLeave.staff_id == s.id, StaffLeave.date == body.date).all()
    if any(l.session in ("FULL_DAY", body.session) or body.session == "FULL_DAY" for l in exists):
        raise HTTPException(409, "Bạn đã đăng ký nghỉ trùng buổi này")
    affected = affected_by_leave(db, s, body.date, body.session) if s.role == "DOCTOR" else []
    leave = StaffLeave(staff_id=s.id, date=body.date, session=body.session, reason=(body.reason or "").strip() or None)
    db.add(leave)
    for x in affected:
        a = x["appointment"]
        if a.status != "CONFIRMED":
            continue  # lịch HOLD sẽ tự hết hạn; khung đã bị ẩn với người đặt mới
        a.leave_conflict = True
        a.leave_suggested_doctor_id = x["replacement"].id if x["replacement"] else None
        audit(db, "APPOINTMENT", a.id, "LEAVE_CONFLICT", s.role, s.id, s.full_name,
              reason=f"Bác sĩ nghỉ {SESSION_LABEL[body.session]} {body.date.strftime('%d/%m/%Y')}")
    db.commit()
    for x in affected:
        a = x["appointment"]
        if not a.leave_conflict:
            continue
        rep = x["replacement"]
        opt = (f"<li><b>Nhận bác sĩ thay thế</b>: {rep.full_name} (cùng chuyên khoa, giữ nguyên giờ)</li>"
               if rep else "")
        body_html = (f"<p>Chào {a.patient.full_name},</p><p>Rất tiếc, {s.full_name} có lịch nghỉ đột xuất vào "
                     f"<b>{a.slot} ngày {a.date.strftime('%d/%m/%Y')}</b>, trùng lịch khám của bạn "
                     f"(mã <b>{a.code}</b>).</p><p>Bạn vui lòng chọn một trong các phương án:</p><ul>{opt}"
                     f"<li><b>Đổi sang giờ khác</b></li><li><b>Hoàn tiền cọc</b> ({a.deposit_amount:,}đ)</li></ul>"
                     f"<p><a href='{settings.frontend_url}/lich-hen/{a.id}'>Chọn phương án tại đây</a></p>")
        emailer.send_email(a.patient.email, f"Thay đổi lịch khám {a.code}",
                           emailer.layout("Bác sĩ có lịch nghỉ đột xuất", body_html))
    return {"id": leave.id, "affected": len([x for x in affected if x["appointment"].leave_conflict])}


@router.delete("/{leave_id}")
def delete(leave_id: int, s: Staff = Depends(staff_dep), db: Session = Depends(get_db)):
    l = db.get(StaffLeave, leave_id)
    if not l or l.staff_id != s.id:
        raise HTTPException(404, "Không tìm thấy lịch nghỉ")
    if l.date < today():
        raise HTTPException(400, "Không xóa lịch nghỉ đã qua")
    db.delete(l)
    db.commit()
    return {"ok": True}

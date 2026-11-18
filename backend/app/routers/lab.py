"""Kỹ thuật viên y tế (F3). ABAC: chỉ thấy phiếu thuộc phòng mình; chỉ sửa phiếu do chính mình nhận và chưa DONE."""
import json
from datetime import datetime, time

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import LabOrder, LabResult, Staff
from ..realtime import broker
from ..security import require_role
from ..serializers import audit_list, lab_order_dict, staff_brief
from ..state import audit, lab_transition
from ..storage import save_upload
from ..utils import TZ, now, today
from .doctor import _labs_settled

router = APIRouter(prefix="/api/lab", tags=["Kỹ thuật viên"])
tech_dep = require_role("TECHNICIAN")


def _order(db: Session, order_id: int, t: Staff, lock: bool = False) -> LabOrder:
    q = select(LabOrder).where(LabOrder.id == order_id)
    if lock:
        q = q.with_for_update()
    o = db.execute(q).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Không tìm thấy phiếu")
    if o.department_id != t.department_id:
        raise HTTPException(403, f"Phiếu này thuộc {o.department.name}. Bạn chỉ được truy cập phiếu của phòng mình")
    return o


def _editable(o: LabOrder, t: Staff):
    if o.technician_id != t.id:
        raise HTTPException(403, "Phiếu do kỹ thuật viên khác nhận, bạn không được sửa")
    if o.status != "IN_PROGRESS":
        raise HTTPException(409, "Phiếu đã hoàn thành và bị khóa. Muốn sửa phải nhập lý do")


def _view(o: LabOrder) -> dict:
    a = o.appointment
    p = a.patient
    # Kỹ thuật viên chỉ thấy thông tin hành chính + yêu cầu của bác sĩ (không thấy chẩn đoán, đơn thuốc)
    return {**lab_order_dict(o), "patient": {"full_name": p.full_name, "birth_year": p.birth_year,
                                              "age": now().year - p.birth_year, "gender": p.gender},
            "appointment_code": a.code, "ordered_by": staff_brief(a.doctor)}


@router.get("/orders")
def orders(t: Staff = Depends(tech_dep), db: Session = Depends(get_db)):
    start = datetime.combine(today(), time(0), tzinfo=TZ)
    rows = db.query(LabOrder).filter(
        LabOrder.department_id == t.department_id,
        or_(LabOrder.status.in_(("ORDERED", "IN_PROGRESS")), LabOrder.completed_at >= start)) \
        .order_by(LabOrder.created_at).all()
    return {"department": {"id": t.department.id, "name": t.department.name, "room": t.department.room},
            "me": t.id, "items": [_view(o) for o in rows]}


@router.get("/orders/{order_id}")
def order_detail(order_id: int, t: Staff = Depends(tech_dep), db: Session = Depends(get_db)):
    o = _order(db, order_id, t)
    return {**_view(o), "audit": audit_list(db, [("LAB_ORDER", str(o.id)), ("LAB_RESULT", str(o.id))]),
            "can_edit": o.technician_id == t.id and o.status == "IN_PROGRESS",
            "can_amend": o.technician_id == t.id and o.status == "DONE"}


@router.post("/orders/{order_id}/claim")
def claim(order_id: int, t: Staff = Depends(tech_dep), db: Session = Depends(get_db)):
    o = _order(db, order_id, t, lock=True)  # khóa dòng: 2 người cùng bấm nhận thì chỉ 1 người được
    if o.status != "ORDERED":
        raise HTTPException(409, "Phiếu đã có người nhận hoặc đã bị hủy")
    lab_transition(db, o, "IN_PROGRESS", "TECHNICIAN", t.id, t.full_name, reason="Nhận phiếu")
    o.technician_id, o.claimed_at = t.id, now()
    if not o.result:
        db.add(LabResult(lab_order_id=o.id, files=[]))
    db.commit()
    broker.publish(f"dept:{o.department_id}", "lab_claimed", {"order_id": o.id})
    return {"ok": True}


@router.post("/orders/{order_id}/files")
def upload(order_id: int, request: Request, files: list[UploadFile] = File(...), t: Staff = Depends(tech_dep),
           db: Session = Depends(get_db)):
    o = _order(db, order_id, t)
    _editable(o, t)
    saved = [save_upload(f, str(request.base_url)) for f in files]
    o.result.files = [*(o.result.files or []), *saved]
    db.commit()
    return {"files": o.result.files}


class RemoveFileIn(BaseModel):
    url: str


@router.post("/orders/{order_id}/files/remove")
def remove_file(order_id: int, body: RemoveFileIn, t: Staff = Depends(tech_dep), db: Session = Depends(get_db)):
    o = _order(db, order_id, t)
    _editable(o, t)
    o.result.files = [f for f in (o.result.files or []) if f["url"] != body.url]
    db.commit()
    return {"files": o.result.files}


class NoteIn(BaseModel):
    note: str


@router.put("/orders/{order_id}/note")
def save_note(order_id: int, body: NoteIn, t: Staff = Depends(tech_dep), db: Session = Depends(get_db)):
    o = _order(db, order_id, t)
    _editable(o, t)
    o.result.note = body.note.strip()
    db.commit()
    return {"ok": True}


@router.post("/orders/{order_id}/complete")
def complete(order_id: int, t: Staff = Depends(tech_dep), db: Session = Depends(get_db)):
    o = _order(db, order_id, t, lock=True)
    _editable(o, t)
    if not (o.result.files or (o.result.note or "").strip()):
        raise HTTPException(400, "Cần tải lên kết quả hoặc ghi nhận xét trước khi hoàn thành")
    lab_transition(db, o, "DONE", "TECHNICIAN", t.id, t.full_name, reason="Hoàn thành – kết quả bị khóa")
    o.completed_at = now()
    o.result.is_locked = True
    a = o.appointment
    ready = _labs_settled(db, a)
    db.commit()
    broker.publish(f"staff:{a.doctor_id}", "lab_done", {
        "appointment_id": a.id, "order_id": o.id, "service": o.service.name, "patient": a.patient.full_name,
        "case_ready": ready})
    broker.publish(f"dept:{o.department_id}", "lab_done", {"order_id": o.id})
    return {"ok": True, "case_ready": ready}


@router.post("/orders/{order_id}/amend")
def amend(order_id: int, request: Request, reason: str = Form(...), note: str = Form(""),
          keep_urls: str = Form("[]"), files: list[UploadFile] | None = File(None), t: Staff = Depends(tech_dep),
          db: Session = Depends(get_db)):
    """Sửa kết quả sau khi khóa: bắt buộc lý do; bản cũ lưu vào AUDIT_LOGS; gắn nhãn 'Đã chỉnh sửa'."""
    o = _order(db, order_id, t, lock=True)
    if o.technician_id != t.id:
        raise HTTPException(403, "Chỉ kỹ thuật viên đã thực hiện mới được sửa kết quả")
    if o.status != "DONE":
        raise HTTPException(409, "Phiếu chưa hoàn thành, hãy sửa trực tiếp")
    if len(reason.strip()) < 5:
        raise HTTPException(400, "Lý do sửa cần ít nhất 5 ký tự")
    try:
        keep = set(json.loads(keep_urls))
    except json.JSONDecodeError:
        raise HTTPException(400, "Danh sách file không hợp lệ")
    r = o.result
    old = {"note": r.note, "files": r.files}
    new_files = [f for f in (r.files or []) if f["url"] in keep]
    new_files += [save_upload(f, str(request.base_url)) for f in (files or []) if f.filename]
    new = {"note": note.strip(), "files": new_files}
    if new == old:
        raise HTTPException(400, "Không có thay đổi nào")
    if not (new["files"] or new["note"]):
        raise HTTPException(400, "Kết quả không được để trống")
    audit(db, "LAB_RESULT", o.id, "AMEND", "TECHNICIAN", t.id, t.full_name, reason=reason.strip(),
          old_value=old, new_value=new)
    r.note, r.files, r.is_amended = new["note"], new_files, True
    db.commit()
    broker.publish(f"staff:{o.appointment.doctor_id}", "lab_amended",
                   {"appointment_id": o.appointment_id, "service": o.service.name})
    return {"ok": True}

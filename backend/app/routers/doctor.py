"""Bác sĩ khám chính (F3 + F4). Mọi thao tác kiểm tra: role (require_role) + quyền sở hữu ca (_case) + trạng thái."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .. import prescribing
from ..db import get_db
from ..models import (Appointment, LabOrder, LabService, MedicalRecord, PharmacyQueue, Prescription,
                      PrescriptionDetail, Specialty, Staff, TriageSession)
from ..realtime import broker
from ..security import require_role
from ..serializers import (appt_brief, audit_list, lab_order_dict, patient_brief, prescription_dict, record_dict,
                           visit_summary)
from ..state import STATUS_LABEL, audit, lab_transition, transition
from ..utils import now, today

router = APIRouter(prefix="/api/doctor", tags=["Bác sĩ"])
doctor_dep = require_role("DOCTOR")
VISIBLE = ("CONFIRMED", "CHECKED_IN", "IN_CONSULTATION", "WAITING_LAB", "COMPLETED", "PAID", "NO_SHOW")


def _case(db: Session, appt_id: int, doc: Staff) -> Appointment:
    a = db.get(Appointment, appt_id)
    if not a or a.status in ("HOLD", "EXPIRED", "CANCELLED"):
        raise HTTPException(404, "Không tìm thấy ca khám")
    if a.doctor_id != doc.id:
        raise HTTPException(403, "Ca khám này không thuộc về bạn")
    return a


def _require_consulting(a: Appointment):
    if a.status == "WAITING_LAB":
        raise HTTPException(409, "Ca đang chờ kết quả cận lâm sàng, chưa chỉnh sửa được")
    if a.status != "IN_CONSULTATION":
        raise HTTPException(409, f"Chỉ chỉnh sửa khi ca đang khám (hiện tại: {STATUS_LABEL.get(a.status)})")


def _triage(s: TriageSession | None) -> dict | None:
    if not s:
        return None
    return {"id": s.id, "result": s.result, "vitals": s.vitals, "red_flags": s.red_flags, "urgency": s.urgency,
            "rag_context": s.rag_context, "messages": s.messages, "provider": s.provider, "age_group": s.age_group,
            "specialty": s.specialty.name if s.specialty else None,
            "feedback": None if s.doctor_feedback_correct is None else {
                "correct": s.doctor_feedback_correct, "specialty_id": s.doctor_feedback_specialty_id}}


@router.get("/queue")
def queue(d: date | None = None, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    d = d or today()
    rows = db.query(Appointment).filter(Appointment.doctor_id == doc.id, Appointment.date == d,
                                        Appointment.status.in_(VISIBLE)).order_by(Appointment.slot,
                                                                                  Appointment.checked_in_at).all()
    out = []
    for a in rows:
        labs = [o for o in a.lab_orders if o.status != "CANCELLED"]
        out.append({**appt_brief(a), "patient": patient_brief(a.patient),
                    "summary": (a.triage.result or {}).get("tom_tat") if a.triage else None,
                    "red_flags": len(a.triage.red_flags or []) if a.triage else 0,
                    "labs_done": sum(1 for o in labs if o.status == "DONE"), "labs_total": len(labs)})
    return {"date": d.isoformat(), "doctor": {"id": doc.id, "full_name": doc.full_name, "room": doc.room},
            "items": out}


@router.get("/cases/{appt_id}")
def case_detail(appt_id: int, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    a = _case(db, appt_id, doc)
    history = db.query(Appointment).filter(Appointment.patient_id == a.patient_id, Appointment.id != a.id,
                                           Appointment.status.in_(("COMPLETED", "PAID"))) \
        .order_by(Appointment.date.desc()).limit(10).all()
    pairs = [("APPOINTMENT", str(a.id))]
    if a.record:
        pairs.append(("MEDICAL_RECORD", str(a.record.id)))
    pairs += [("LAB_ORDER", str(o.id)) for o in a.lab_orders] + [("LAB_RESULT", str(o.id)) for o in a.lab_orders]
    rx = prescription_dict(a)
    if rx and rx["items"]:
        items = [prescribing.RxItem(**{k: i[k] for k in ("medicine_id", "dose_per_time", "times_per_day", "days",
                                                         "timing", "note")}) for i in rx["items"]]
        rx["evaluation"] = prescribing.evaluate(db, items)
    return {
        "appointment": appt_brief(a), "patient": patient_brief(a.patient), "triage": _triage(a.triage),
        "record": record_dict(a.record), "lab_orders": [lab_order_dict(o) for o in a.lab_orders],
        "prescription": rx, "history": [visit_summary(db, h) for h in history],
        "audit": audit_list(db, pairs),
        "can_edit": a.status == "IN_CONSULTATION",
    }


@router.post("/cases/{appt_id}/open")
def open_case(appt_id: int, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    a = _case(db, appt_id, doc)
    transition(db, a, "IN_CONSULTATION", "DOCTOR", doc.id, doc.full_name, reason="Bác sĩ mở ca")
    if not a.record:
        db.add(MedicalRecord(appointment_id=a.id, patient_id=a.patient_id, doctor_id=doc.id))
    db.commit()
    return {"ok": True}


class RecordIn(BaseModel):
    clinical_notes: str | None = None
    diagnosis: str | None = None
    diagnosis_kb_id: int | None = None
    advice: str | None = None
    follow_up_date: date | None = None


@router.put("/cases/{appt_id}/record")
def save_record(appt_id: int, body: RecordIn, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    a = _case(db, appt_id, doc)
    _require_consulting(a)
    r = a.record
    if r.is_locked:
        raise HTTPException(409, "Bệnh án đã khóa")
    if body.follow_up_date and body.follow_up_date <= today():
        raise HTTPException(400, "Ngày tái khám phải sau hôm nay")
    for k, v in body.model_dump().items():
        setattr(r, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    return record_dict(r)


class LabOrderIn(BaseModel):
    service_ids: list[int] = Field(min_length=1)
    note: str | None = None


def _labs_settled(db: Session, a: Appointment, actor_name: str | None = None):
    """Khi mọi phiếu đều DONE (hoặc đã hủy) -> ca tự quay về IN_CONSULTATION và báo bác sĩ."""
    db.flush()
    db.refresh(a)
    pending = [o for o in a.lab_orders if o.status in ("ORDERED", "IN_PROGRESS")]
    if a.status == "WAITING_LAB" and not pending:
        transition(db, a, "IN_CONSULTATION", "SYSTEM", reason="Mọi phiếu cận lâm sàng đã hoàn thành")
        return True
    return False


@router.post("/cases/{appt_id}/lab-orders")
def order_labs(appt_id: int, body: LabOrderIn, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    a = _case(db, appt_id, doc)
    _require_consulting(a)
    active = {o.service_id for o in a.lab_orders if o.status in ("ORDERED", "IN_PROGRESS", "DONE")}
    created = []
    for sid in dict.fromkeys(body.service_ids):
        svc = db.get(LabService, sid)
        if not svc or not svc.is_active:
            raise HTTPException(400, "Dịch vụ cận lâm sàng không hợp lệ")
        if sid in active:
            raise HTTPException(409, f"\"{svc.name}\" đã được chỉ định trong ca này")
        # Chỉ định theo PHÒNG, không chỉ định đích danh kỹ thuật viên
        o = LabOrder(appointment_id=a.id, service_id=svc.id, department_id=svc.department_id, ordered_by=doc.id,
                     price=svc.price, doctor_note=(body.note or "").strip() or None)
        db.add(o)
        db.flush()
        audit(db, "LAB_ORDER", o.id, "STATUS_CHANGE", "DOCTOR", doc.id, doc.full_name, to_status="ORDERED",
              reason=f"Chỉ định {svc.name}")
        created.append(o)
    transition(db, a, "WAITING_LAB", "DOCTOR", doc.id, doc.full_name,
               reason="Chỉ định CLS: " + ", ".join(o.service.name for o in created))
    db.commit()
    for o in created:
        broker.publish(f"dept:{o.department_id}", "lab_order_created", {"order_id": o.id, "service": o.service.name})
    return {"ok": True, "created": [o.id for o in created]}


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=255)


@router.post("/lab-orders/{order_id}/cancel")
def cancel_lab(order_id: int, body: CancelIn, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    o = db.execute(select(LabOrder).where(LabOrder.id == order_id).with_for_update()).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Không tìm thấy phiếu")
    a = _case(db, o.appointment_id, doc)
    if a.status not in ("IN_CONSULTATION", "WAITING_LAB"):
        raise HTTPException(409, "Ca đã kết thúc")
    lab_transition(db, o, "CANCELLED", "DOCTOR", doc.id, doc.full_name, reason=body.reason)
    o.cancel_reason = body.reason.strip()
    ready = _labs_settled(db, a)
    db.commit()
    broker.publish(f"dept:{o.department_id}", "lab_order_cancelled", {"order_id": o.id})
    return {"ok": True, "case_ready": ready}


class RxIn(BaseModel):
    items: list[prescribing.RxItem]
    duplicate_ack: bool = False
    overdose_reason: str | None = None


@router.post("/prescriptions/check")
def check_rx(body: RxIn, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    """Kiểm tra ngay khi thêm từng thuốc: tự tính số lượng, tiền, cảnh báo trùng hoạt chất / vượt liều."""
    return prescribing.evaluate(db, body.items)


@router.put("/cases/{appt_id}/prescription")
def save_rx(appt_id: int, body: RxIn, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    a = _case(db, appt_id, doc)
    _require_consulting(a)
    ev = prescribing.evaluate(db, body.items)
    reason = (body.overdose_reason or "").strip()
    if ev["requires_duplicate_ack"] and not body.duplicate_ack:
        raise HTTPException(422, "Đơn có thuốc trùng hoạt chất. Cần xác nhận giữ cả hai thuốc")
    if ev["requires_overdose_reason"] and len(reason) < 5:
        raise HTTPException(422, "Đơn vượt liều tối đa. Cần nhập lý do (ít nhất 5 ký tự)")
    p = a.prescription
    if not p:
        p = Prescription(appointment_id=a.id, doctor_id=doc.id)
        db.add(p)
    if p.is_locked:
        raise HTTPException(409, "Đơn thuốc đã khóa")
    p.details.clear()
    for line in ev["lines"]:
        p.details.append(PrescriptionDetail(
            medicine_id=line["medicine_id"], dose_per_time=line["dose_per_time"], times_per_day=line["times_per_day"],
            days=line["days"], timing=line["timing"], quantity=line["quantity"], unit_price=line["unit_price"],
            amount=line["amount"], note=line["note"]))
    p.total_amount = ev["total"]
    p.warnings = ev["warnings"]
    p.duplicate_ack = bool(body.duplicate_ack and ev["requires_duplicate_ack"])
    p.overdose_reason = reason if ev["requires_overdose_reason"] else None
    db.commit()
    db.refresh(a)
    return {**prescription_dict(a), "evaluation": ev}


class CompleteIn(BaseModel):
    ai_correct: bool | None = None
    ai_specialty_id: int | None = None


@router.post("/cases/{appt_id}/complete")
def complete(appt_id: int, body: CompleteIn, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    a = _case(db, appt_id, doc)
    pending = [o for o in a.lab_orders if o.status in ("ORDERED", "IN_PROGRESS")]
    if pending:
        names = ", ".join(f"{o.service.name} ({'chờ nhận' if o.status == 'ORDERED' else 'đang làm'})" for o in pending)
        raise HTTPException(409, f"Chưa thể chốt ca: còn {len(pending)} phiếu CLS chưa xong – {names}. "
                                 f"Chờ kết quả hoặc hủy phiếu kèm lý do.")
    _require_consulting(a)
    r = a.record
    if not r or not (r.diagnosis or "").strip():
        raise HTTPException(400, "Cần ghi chẩn đoán trước khi chốt ca")
    s = a.triage
    if s and s.result:
        # Human-in-the-loop: bác sĩ đánh giá chuyên khoa AI gợi ý
        if body.ai_correct is None:
            raise HTTPException(400, "Vui lòng trả lời: chuyên khoa AI gợi ý có phù hợp không?")
        if body.ai_correct is False:
            if not body.ai_specialty_id or not db.get(Specialty, body.ai_specialty_id):
                raise HTTPException(400, "Vui lòng chọn chuyên khoa đúng")
        s.doctor_feedback_correct = body.ai_correct
        s.doctor_feedback_specialty_id = None if body.ai_correct else body.ai_specialty_id
    r.is_locked, r.locked_at = True, now()
    if a.prescription:
        a.prescription.is_locked = True
    transition(db, a, "COMPLETED", "DOCTOR", doc.id, doc.full_name, reason="Bác sĩ chốt ca – bệnh án và đơn thuốc khóa")
    # Tự cấp số thứ tự quầy thuốc
    db.execute(text("SELECT pg_advisory_xact_lock(7001)"))
    qd = today()
    max_no = db.scalar(select(func.coalesce(func.max(PharmacyQueue.number), 0)).where(PharmacyQueue.queue_date == qd))
    max_pos = db.scalar(select(func.coalesce(func.max(PharmacyQueue.position), 0)).where(PharmacyQueue.queue_date == qd))
    ticket = PharmacyQueue(appointment_id=a.id, queue_date=qd, number=max_no + 1, position=max_pos + 1)
    db.add(ticket)
    db.commit()
    broker.publish("role:PHARMACIST", "queue_updated", {"number": ticket.number})
    broker.publish("display", "queue_updated", {})
    broker.publish(f"patient:{a.patient_id}", "appointment_updated", {"appointment_id": a.id})
    return {"ok": True, "queue_number": ticket.number}


class AmendIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)
    clinical_notes: str | None = None
    diagnosis: str | None = None
    advice: str | None = None
    follow_up_date: date | None = None


@router.post("/cases/{appt_id}/amend")
def amend(appt_id: int, body: AmendIn, doc: Staff = Depends(doctor_dep), db: Session = Depends(get_db)):
    """Sửa bệnh án sau khi khóa: bắt buộc lý do, lưu bản cũ vào AUDIT_LOGS, gắn nhãn 'Đã chỉnh sửa'."""
    a = _case(db, appt_id, doc)
    r = a.record
    if not r or not r.is_locked:
        raise HTTPException(409, "Bệnh án chưa khóa, hãy sửa trực tiếp")
    if r.doctor_id != doc.id:
        raise HTTPException(403, "Chỉ bác sĩ lập bệnh án mới được sửa")
    fields = ("clinical_notes", "diagnosis", "advice", "follow_up_date")
    new = body.model_dump(include=set(fields))
    old = {k: (getattr(r, k).isoformat() if k == "follow_up_date" and getattr(r, k) else getattr(r, k)) for k in fields}
    new_s = {k: (v.isoformat() if k == "follow_up_date" and v else (v.strip() if isinstance(v, str) else v))
             for k, v in new.items()}
    changed = {k: v for k, v in new_s.items() if v != old[k]}
    if not changed:
        raise HTTPException(400, "Không có thay đổi nào")
    if "diagnosis" in changed and not changed["diagnosis"]:
        raise HTTPException(400, "Chẩn đoán không được để trống")
    audit(db, "MEDICAL_RECORD", r.id, "AMEND", "DOCTOR", doc.id, doc.full_name, reason=body.reason.strip(),
          old_value={k: old[k] for k in changed}, new_value=changed)
    for k in changed:
        setattr(r, k, new[k].strip() if isinstance(new[k], str) else new[k])
    r.is_amended = True
    if "follow_up_date" in changed:
        r.follow_up_reminded = False
    db.commit()
    return record_dict(r)

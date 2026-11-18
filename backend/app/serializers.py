from sqlalchemy.orm import Session

from .models import Appointment, AuditLog, LabOrder, MedicalRecord, Patient, Staff
from .prescribing import TIMING_LABEL, schedule
from .state import STATUS_LABEL
from .utils import now

LAB_LABEL = {"ORDERED": "Chờ nhận", "IN_PROGRESS": "Đang thực hiện", "DONE": "Hoàn thành", "CANCELLED": "Đã hủy"}


def iso(v):
    return v.isoformat() if v else None


def staff_brief(s: Staff | None) -> dict | None:
    if not s:
        return None
    return {"id": s.id, "full_name": s.full_name, "room": s.room, "role": s.role,
            "specialty": s.specialty.name if s.specialty else None,
            "department": s.department.name if s.department else None}


def patient_brief(p: Patient) -> dict:
    return {"id": p.id, "full_name": p.full_name, "phone": p.phone, "birth_year": p.birth_year,
            "age": now().year - p.birth_year, "gender": p.gender}


def patient_profile(p: Patient) -> dict:
    return {**patient_brief(p), "email": p.email, "address": p.address, "relative_name": p.relative_name,
            "relative_phone": p.relative_phone}


def appt_brief(a: Appointment) -> dict:
    return {
        "id": a.id, "code": a.code, "date": a.date.isoformat(), "slot": a.slot, "status": a.status,
        "status_label": STATUS_LABEL.get(a.status, a.status), "urgency": a.urgency, "is_general": a.is_general,
        "specialty": {"id": a.specialty.id, "name": a.specialty.name},
        "doctor": staff_brief(a.doctor), "hold_expires_at": iso(a.hold_expires_at),
        "deposit_amount": a.deposit_amount, "consultation_fee": a.consultation_fee,
        "checked_in_at": iso(a.checked_in_at), "leave_conflict": a.leave_conflict,
        "suggested_doctor": staff_brief(a.suggested_doctor), "created_at": iso(a.created_at),
    }


def audit_list(db: Session, pairs: list[tuple[str, str]]) -> list[dict]:
    if not pairs:
        return []
    q = db.query(AuditLog)
    from sqlalchemy import and_, or_
    q = q.filter(or_(*[and_(AuditLog.entity_type == t, AuditLog.entity_id == str(i)) for t, i in pairs]))
    return [{"id": l.id, "entity_type": l.entity_type, "entity_id": l.entity_id, "action": l.action,
             "from_status": l.from_status, "to_status": l.to_status,
             "from_label": STATUS_LABEL.get(l.from_status or "", LAB_LABEL.get(l.from_status or "", l.from_status)),
             "to_label": STATUS_LABEL.get(l.to_status or "", LAB_LABEL.get(l.to_status or "", l.to_status)),
             "actor_type": l.actor_type, "actor_name": l.actor_name, "reason": l.reason,
             "old_value": l.old_value, "new_value": l.new_value, "created_at": iso(l.created_at)}
            for l in q.order_by(AuditLog.id)]


def lab_order_dict(o: LabOrder, with_result: bool = True) -> dict:
    d = {
        "id": o.id, "appointment_id": o.appointment_id, "status": o.status, "status_label": LAB_LABEL[o.status],
        "service": {"id": o.service.id, "name": o.service.name}, "department": {"id": o.department.id,
                                                                                "name": o.department.name,
                                                                                "room": o.department.room},
        "price": o.price, "doctor_note": o.doctor_note, "cancel_reason": o.cancel_reason,
        "technician": staff_brief(o.technician), "claimed_at": iso(o.claimed_at), "completed_at": iso(o.completed_at),
        "created_at": iso(o.created_at),
    }
    if with_result:
        r = o.result
        d["result"] = {"files": r.files, "note": r.note, "is_locked": r.is_locked, "is_amended": r.is_amended} \
            if r else None
    return d


def record_dict(r: MedicalRecord | None) -> dict | None:
    if not r:
        return None
    return {"id": r.id, "clinical_notes": r.clinical_notes, "diagnosis": r.diagnosis,
            "diagnosis_kb_id": r.diagnosis_kb_id, "advice": r.advice, "follow_up_date": iso(r.follow_up_date),
            "is_locked": r.is_locked, "is_amended": r.is_amended, "locked_at": iso(r.locked_at)}


def prescription_dict(a: Appointment) -> dict | None:
    p = a.prescription
    if not p:
        return None
    return {
        "id": p.id, "total_amount": p.total_amount, "warnings": p.warnings, "duplicate_ack": p.duplicate_ack,
        "overdose_reason": p.overdose_reason, "is_locked": p.is_locked,
        "items": [{"medicine_id": d.medicine_id, "name": d.medicine.name, "unit": d.medicine.unit,
                   "dose_per_time": d.dose_per_time, "times_per_day": d.times_per_day, "days": d.days,
                   "timing": d.timing, "timing_label": TIMING_LABEL.get(d.timing, d.timing),
                   "quantity": d.quantity, "unit_price": d.unit_price, "amount": d.amount, "note": d.note}
                  for d in p.details],
        "schedule": schedule(p.details),
    }


def visit_summary(db: Session, a: Appointment) -> dict:
    """Một lần khám đã chốt: dùng cho lịch sử bệnh nhân (bác sĩ xem) và hồ sơ (bệnh nhân xem)."""
    pairs = []
    if a.record:
        pairs.append(("MEDICAL_RECORD", str(a.record.id)))
    pairs += [("LAB_RESULT", str(o.id)) for o in a.lab_orders]
    history = [h for h in audit_list(db, pairs) if h["action"] == "AMEND"]
    return {
        **appt_brief(a),
        "record": record_dict(a.record),
        "lab_orders": [lab_order_dict(o) for o in a.lab_orders if o.status != "CANCELLED"],
        "prescription": prescription_dict(a),
        "amendments": history,
    }

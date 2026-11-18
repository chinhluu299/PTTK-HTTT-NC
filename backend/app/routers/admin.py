"""Quản trị viên: danh mục, tài khoản nhân viên, tham số, khóa tài khoản bệnh nhân, thống kê.
Không có endpoint nào trả nội dung khám bệnh (chẩn đoán, đơn thuốc, kết quả CLS)."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import (ActiveIngredient, Appointment, Department, LabService, Medicine, MedicineIngredient, Patient,
                      Payment, Specialty, Staff, SystemSetting, TriageSession)
from ..security import hash_password, require_role
from ..serializers import staff_brief
from ..utils import TZ, today

router = APIRouter(prefix="/api/admin", tags=["Quản trị"], dependencies=[Depends(require_role("ADMIN"))])


def _commit(db: Session):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Dữ liệu bị trùng (tên hoặc mã đã tồn tại)")


def _get(db: Session, model, id_: int):
    obj = db.get(model, id_)
    if not obj:
        raise HTTPException(404, "Không tìm thấy")
    return obj


# ───────────── Chuyên khoa ─────────────
class SpecialtyIn(BaseModel):
    name: str = Field(min_length=2)
    description: str | None = None
    is_active: bool = True


@router.get("/specialties")
def list_specialties(db: Session = Depends(get_db)):
    counts = dict(db.query(Staff.specialty_id, func.count()).filter(Staff.role == "DOCTOR", Staff.is_active)
                  .group_by(Staff.specialty_id).all())
    return [{"id": s.id, "name": s.name, "description": s.description, "is_general": s.is_general,
             "is_active": s.is_active, "doctors": counts.get(s.id, 0)} for s in db.query(Specialty).order_by(Specialty.id)]


@router.post("/specialties")
def create_specialty(body: SpecialtyIn, db: Session = Depends(get_db)):
    db.add(Specialty(**body.model_dump()))
    _commit(db)
    return {"ok": True}


@router.put("/specialties/{id_}")
def update_specialty(id_: int, body: SpecialtyIn, db: Session = Depends(get_db)):
    s = _get(db, Specialty, id_)
    if s.is_general and not body.is_active:
        raise HTTPException(400, "Không thể ngừng chuyên khoa Nội tổng quát (dùng cho Khám tổng quát)")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    _commit(db)
    return {"ok": True}


# ───────────── Phòng CLS & dịch vụ ─────────────
class DepartmentIn(BaseModel):
    name: str = Field(min_length=2)
    room: str | None = None
    is_active: bool = True


@router.get("/departments")
def list_departments(db: Session = Depends(get_db)):
    return [{"id": d.id, "name": d.name, "room": d.room, "is_active": d.is_active}
            for d in db.query(Department).order_by(Department.id)]


@router.post("/departments")
def create_department(body: DepartmentIn, db: Session = Depends(get_db)):
    db.add(Department(**body.model_dump()))
    _commit(db)
    return {"ok": True}


@router.put("/departments/{id_}")
def update_department(id_: int, body: DepartmentIn, db: Session = Depends(get_db)):
    d = _get(db, Department, id_)
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    _commit(db)
    return {"ok": True}


class LabServiceIn(BaseModel):
    name: str = Field(min_length=2)
    department_id: int
    price: int = Field(ge=0)
    is_active: bool = True


@router.get("/lab-services")
def list_lab_services(db: Session = Depends(get_db)):
    return [{"id": s.id, "name": s.name, "department_id": s.department_id, "department": s.department.name,
             "price": s.price, "is_active": s.is_active} for s in db.query(LabService).order_by(LabService.department_id, LabService.id)]


@router.post("/lab-services")
def create_lab_service(body: LabServiceIn, db: Session = Depends(get_db)):
    _get(db, Department, body.department_id)
    db.add(LabService(**body.model_dump()))
    _commit(db)
    return {"ok": True}


@router.put("/lab-services/{id_}")
def update_lab_service(id_: int, body: LabServiceIn, db: Session = Depends(get_db)):
    s = _get(db, LabService, id_)
    _get(db, Department, body.department_id)
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    _commit(db)
    return {"ok": True}


# ───────────── Hoạt chất & thuốc ─────────────
class IngredientIn(BaseModel):
    name: str = Field(min_length=2)
    max_daily_dose: float | None = Field(default=None, gt=0)
    dose_unit: str = "mg"


@router.get("/ingredients")
def list_ingredients(db: Session = Depends(get_db)):
    return [{"id": i.id, "name": i.name, "max_daily_dose": i.max_daily_dose, "dose_unit": i.dose_unit}
            for i in db.query(ActiveIngredient).order_by(ActiveIngredient.name)]


@router.post("/ingredients")
def create_ingredient(body: IngredientIn, db: Session = Depends(get_db)):
    db.add(ActiveIngredient(**body.model_dump()))
    _commit(db)
    return {"ok": True}


@router.put("/ingredients/{id_}")
def update_ingredient(id_: int, body: IngredientIn, db: Session = Depends(get_db)):
    i = _get(db, ActiveIngredient, id_)
    for k, v in body.model_dump().items():
        setattr(i, k, v)
    _commit(db)
    return {"ok": True}


class MedIngredientIn(BaseModel):
    ingredient_id: int
    amount: float = Field(gt=0)


class MedicineIn(BaseModel):
    name: str = Field(min_length=2)
    strength: str
    dosage_form: str
    unit: str
    unit_price: int = Field(ge=0)
    max_daily_quantity: float | None = Field(default=None, gt=0)
    is_active: bool = True
    ingredients: list[MedIngredientIn] = Field(min_length=1)


@router.get("/medicines")
def list_medicines(db: Session = Depends(get_db)):
    rows = db.query(Medicine).options(selectinload(Medicine.ingredients).selectinload(MedicineIngredient.ingredient)) \
        .order_by(Medicine.name).all()
    return [{"id": m.id, "name": m.name, "strength": m.strength, "dosage_form": m.dosage_form, "unit": m.unit,
             "unit_price": m.unit_price, "max_daily_quantity": m.max_daily_quantity, "is_active": m.is_active,
             "ingredients": [{"ingredient_id": mi.ingredient_id, "name": mi.ingredient.name, "amount": mi.amount,
                              "unit": mi.ingredient.dose_unit} for mi in m.ingredients]} for m in rows]


def _apply_medicine(db: Session, m: Medicine, body: MedicineIn):
    ids = [i.ingredient_id for i in body.ingredients]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "Một hoạt chất chỉ khai báo một lần")
    for i in ids:
        _get(db, ActiveIngredient, i)
    for k, v in body.model_dump(exclude={"ingredients"}).items():
        setattr(m, k, v)
    m.ingredients.clear()
    db.flush()
    for i in body.ingredients:
        m.ingredients.append(MedicineIngredient(ingredient_id=i.ingredient_id, amount=i.amount))


@router.post("/medicines")
def create_medicine(body: MedicineIn, db: Session = Depends(get_db)):
    m = Medicine(name=body.name, strength=body.strength, dosage_form=body.dosage_form, unit=body.unit,
                 unit_price=body.unit_price)
    db.add(m)
    _apply_medicine(db, m, body)
    _commit(db)
    return {"ok": True}


@router.put("/medicines/{id_}")
def update_medicine(id_: int, body: MedicineIn, db: Session = Depends(get_db)):
    _apply_medicine(db, _get(db, Medicine, id_), body)
    _commit(db)
    return {"ok": True}


# ───────────── Tài khoản nhân viên ─────────────
class StaffIn(BaseModel):
    username: str = Field(min_length=3)
    password: str | None = None
    full_name: str = Field(min_length=2)
    role: str
    specialty_id: int | None = None
    department_id: int | None = None
    room: str | None = None
    email: str | None = None
    is_active: bool = True


def _check_staff(db: Session, body: StaffIn):
    if body.role not in ("DOCTOR", "TECHNICIAN", "PHARMACIST", "ADMIN"):
        raise HTTPException(400, "Vai trò không hợp lệ")
    if body.role == "DOCTOR" and not body.specialty_id:
        raise HTTPException(400, "Bác sĩ cần có chuyên khoa")
    if body.role == "TECHNICIAN" and not body.department_id:
        raise HTTPException(400, "Kỹ thuật viên cần thuộc một phòng CLS")


@router.get("/staff")
def list_staff(db: Session = Depends(get_db)):
    return [{**staff_brief(s), "username": s.username, "email": s.email, "is_active": s.is_active,
             "specialty_id": s.specialty_id, "department_id": s.department_id}
            for s in db.query(Staff).order_by(Staff.role, Staff.id)]


@router.post("/staff")
def create_staff(body: StaffIn, db: Session = Depends(get_db)):
    _check_staff(db, body)
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "Mật khẩu tối thiểu 6 ký tự")
    data = body.model_dump(exclude={"password"})
    data["username"] = data["username"].strip().lower()
    if body.role != "DOCTOR":
        data["specialty_id"] = None
    if body.role != "TECHNICIAN":
        data["department_id"] = None
    db.add(Staff(**data, password_hash=hash_password(body.password)))
    _commit(db)
    return {"ok": True}


@router.put("/staff/{id_}")
def update_staff(id_: int, body: StaffIn, db: Session = Depends(get_db)):
    _check_staff(db, body)
    s = _get(db, Staff, id_)
    for k, v in body.model_dump(exclude={"password", "username"}).items():
        setattr(s, k, v)
    if body.role != "DOCTOR":
        s.specialty_id = None
    if body.role != "TECHNICIAN":
        s.department_id = None
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "Mật khẩu tối thiểu 6 ký tự")
        s.password_hash = hash_password(body.password)
    _commit(db)
    return {"ok": True}


# ───────────── Tham số ─────────────
@router.get("/settings")
def list_settings(db: Session = Depends(get_db)):
    return [{"key": s.key, "value": s.value, "label": s.label} for s in db.query(SystemSetting).order_by(SystemSetting.key)]


@router.put("/settings")
def update_settings(body: dict[str, str], db: Session = Depends(get_db)):
    for k, v in body.items():
        s = db.get(SystemSetting, k)
        if not s:
            raise HTTPException(400, f"Tham số {k} không tồn tại")
        if k in ("deposit_amount", "consultation_fee") and (not v.isdigit() or int(v) < 0):
            raise HTTPException(400, "Số tiền không hợp lệ")
        s.value = v.strip()
    db.commit()
    return {"ok": True}


# ───────────── Bệnh nhân (chỉ khóa / mở khóa) ─────────────
@router.get("/patients")
def list_patients(q: str = "", db: Session = Depends(get_db)):
    query = db.query(Patient)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter((Patient.phone.like(like)) | (Patient.full_name.ilike(like)))
    rows = query.order_by(Patient.id.desc()).limit(100).all()
    return [{"id": p.id, "full_name": p.full_name, "phone": p.phone, "birth_year": p.birth_year,
             "is_locked": p.is_locked, "created_at": p.created_at.isoformat()} for p in rows]


class LockIn(BaseModel):
    locked: bool


@router.post("/patients/{id_}/lock")
def lock_patient(id_: int, body: LockIn, db: Session = Depends(get_db)):
    p = _get(db, Patient, id_)
    p.is_locked = body.locked
    db.commit()
    return {"ok": True}


# ───────────── Hoàn cọc ─────────────
@router.get("/refunds")
def refunds(db: Session = Depends(get_db)):
    rows = db.query(Payment).filter(Payment.status.in_(("REFUND_PENDING", "AMOUNT_MISMATCH", "UNMATCHED"))) \
        .order_by(Payment.id.desc()).all()
    return [{"id": p.id, "amount": p.amount, "status": p.status, "note": p.note, "content": p.content,
             "created_at": p.created_at.isoformat(),
             "code": p.appointment.code if p.appointment else None,
             "patient": p.appointment.patient.full_name if p.appointment else None,
             "phone": p.appointment.patient.phone if p.appointment else None} for p in rows]


@router.post("/refunds/{id_}/done")
def refund_done(id_: int, db: Session = Depends(get_db)):
    p = _get(db, Payment, id_)
    if p.status not in ("REFUND_PENDING", "AMOUNT_MISMATCH", "UNMATCHED"):
        raise HTTPException(409, "Khoản này không chờ hoàn")
    p.status = "REFUNDED"
    db.commit()
    return {"ok": True}


# ───────────── Thống kê ─────────────
def _bucket(d: date, period: str) -> date:
    return d - timedelta(days=d.weekday()) if period == "week" else d.replace(day=1)


@router.get("/stats")
def stats(period: str = "week", db: Session = Depends(get_db)):
    if period not in ("week", "month"):
        raise HTTPException(400, "period = week | month")
    end = today()
    if period == "week":
        start = _bucket(end, "week") - timedelta(weeks=7)
        buckets = [start + timedelta(weeks=i) for i in range(8)]
    else:
        first = end.replace(day=1)
        buckets = []
        y, m = first.year, first.month
        for _ in range(6):
            buckets.insert(0, date(y, m, 1))
            m -= 1
            if m == 0:
                y, m = y - 1, 12
        start = buckets[0]
    specs = {s.id: s.name for s in db.query(Specialty).order_by(Specialty.id)}
    appts = db.query(Appointment.id, Appointment.date, Appointment.status, Appointment.specialty_id,
                     Appointment.created_at).filter(Appointment.date >= start, Appointment.date <= end).all()

    cases = defaultdict(lambda: defaultdict(int))
    attended_statuses = ("CHECKED_IN", "IN_CONSULTATION", "WAITING_LAB", "COMPLETED", "PAID")
    ns = defaultdict(lambda: [0, 0])  # bucket -> [no_show, đến khám]
    for a in appts:
        b = _bucket(a.date, period)
        if a.status in ("COMPLETED", "PAID"):
            cases[b][a.specialty_id] += 1
        if a.status == "NO_SHOW":
            ns[b][0] += 1
        elif a.status in attended_statuses:
            ns[b][1] += 1

    created_start = datetime.combine(start, time(0), tzinfo=TZ)
    holds = db.query(Appointment.created_at, Appointment.status).filter(Appointment.created_at >= created_start).all()
    ex = defaultdict(lambda: [0, 0])  # bucket -> [hết hạn, tổng lượt giữ chỗ]
    for h in holds:
        b = _bucket(h.created_at.astimezone(TZ).date(), period)
        ex[b][1] += 1
        if h.status == "EXPIRED":
            ex[b][0] += 1

    fb = db.query(TriageSession.specialty_id, TriageSession.doctor_feedback_correct,
                  TriageSession.doctor_feedback_specialty_id).filter(
        TriageSession.doctor_feedback_correct.isnot(None)).all()
    acc = defaultdict(lambda: {"total": 0, "correct": 0, "corrections": defaultdict(int)})
    for f in fb:
        e = acc[f.specialty_id]
        e["total"] += 1
        if f.doctor_feedback_correct:
            e["correct"] += 1
        elif f.doctor_feedback_specialty_id:
            e["corrections"][specs.get(f.doctor_feedback_specialty_id, "?")] += 1

    def rate(a, b):
        return round(a / b, 4) if b else None

    total_ns = [sum(v[0] for v in ns.values()), sum(v[0] + v[1] for v in ns.values())]
    total_ex = [sum(v[0] for v in ex.values()), sum(v[1] for v in ex.values())]
    total_fb = [sum(e["correct"] for e in acc.values()), sum(e["total"] for e in acc.values())]
    used_specs = sorted({sid for b in cases.values() for sid in b}, key=lambda x: x)
    return {
        "period": period,
        "buckets": [b.isoformat() for b in buckets],
        "kpi": {
            "cases": sum(sum(b.values()) for b in cases.values()),
            "no_show_rate": rate(*total_ns), "no_show": total_ns[0], "no_show_base": total_ns[1],
            "expired_rate": rate(*total_ex), "expired": total_ex[0], "holds": total_ex[1],
            "ai_accuracy": rate(*total_fb), "ai_feedback": total_fb[1],
        },
        "cases_by_specialty": {
            "specialties": [{"id": sid, "name": specs.get(sid, "?")} for sid in used_specs],
            "rows": [{"bucket": b.isoformat(), "counts": {str(sid): cases[b].get(sid, 0) for sid in used_specs}}
                     for b in buckets],
        },
        "no_show": [{"bucket": b.isoformat(), "no_show": ns[b][0], "base": sum(ns[b]), "rate": rate(ns[b][0], sum(ns[b]))}
                    for b in buckets],
        "expired": [{"bucket": b.isoformat(), "expired": ex[b][0], "holds": ex[b][1], "rate": rate(*ex[b])}
                    for b in buckets],
        "ai_accuracy": sorted([{"specialty": specs.get(sid, "?"), "total": e["total"], "correct": e["correct"],
                                "rate": rate(e["correct"], e["total"]),
                                "corrections": sorted(({"specialty": k, "count": v} for k, v in e["corrections"].items()),
                                                      key=lambda x: -x["count"])}
                               for sid, e in acc.items()], key=lambda x: (x["rate"] if x["rate"] is not None else 1)),
    }

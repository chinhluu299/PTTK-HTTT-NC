from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from ..booking import get_int_setting, get_setting
from ..config import settings
from ..db import get_db
from ..models import DiseaseKnowledge, LabService, Medicine, MedicineIngredient, Specialty
from ..security import require_role
from ..utils import AFTERNOON_SLOTS, MORNING_SLOTS
from ..utils import strip_accents

router = APIRouter(tags=["Danh mục"])


@router.get("/api/public/config")
def public_config(db: Session = Depends(get_db)):
    return {
        "clinic_name": get_setting(db, "clinic_name", "Phòng khám MedCare"),
        "hotline": get_setting(db, "hotline", "1900 1234"),
        "address": get_setting(db, "address", ""),
        "deposit_amount": get_int_setting(db, "deposit_amount", 100000),
        "consultation_fee": get_int_setting(db, "consultation_fee", 150000),
        "hold_minutes": settings.hold_minutes,
        "slot_capacity": settings.slot_capacity,
        "payment_dev_mode": settings.payment_dev_mode,
        "morning_slots": MORNING_SLOTS, "afternoon_slots": AFTERNOON_SLOTS,
    }


@router.get("/api/public/specialties")
def specialties(db: Session = Depends(get_db)):
    return [{"id": s.id, "name": s.name, "description": s.description, "is_general": s.is_general}
            for s in db.query(Specialty).filter(Specialty.is_active).order_by(Specialty.is_general.desc(), Specialty.name)]


doctor_only = require_role("DOCTOR")


@router.get("/api/catalog/lab-services")
def lab_services(db: Session = Depends(get_db), _=Depends(doctor_only)):
    return [{"id": s.id, "name": s.name, "price": s.price, "department": {"id": s.department.id,
                                                                         "name": s.department.name}}
            for s in db.query(LabService).filter(LabService.is_active).order_by(LabService.department_id, LabService.name)]


@router.get("/api/catalog/medicines")
def medicines(q: str = "", db: Session = Depends(get_db), _=Depends(doctor_only)):
    rows = db.query(Medicine).options(selectinload(Medicine.ingredients).selectinload(MedicineIngredient.ingredient)) \
        .filter(Medicine.is_active).order_by(Medicine.name).all()
    key = strip_accents(q.strip())
    out = []
    for m in rows:
        ings = [mi.ingredient.name for mi in m.ingredients]
        hay = strip_accents(m.name + " " + " ".join(ings))
        if key and key not in hay:
            continue
        out.append({"id": m.id, "name": m.name, "strength": m.strength, "dosage_form": m.dosage_form, "unit": m.unit,
                    "unit_price": m.unit_price, "max_daily_quantity": m.max_daily_quantity,
                    "ingredients": [{"name": mi.ingredient.name, "amount": mi.amount, "unit": mi.ingredient.dose_unit}
                                    for mi in m.ingredients]})
    return out[:30]


@router.get("/api/catalog/diseases")
def diseases(q: str = "", db: Session = Depends(get_db), _=Depends(doctor_only)):
    key = strip_accents(q.strip())
    if len(key) < 2:
        return []
    rows = db.query(DiseaseKnowledge.id, DiseaseKnowledge.name, DiseaseKnowledge.specialty_hint).all()
    hits = [r for r in rows if key in strip_accents(r.name)]
    hits.sort(key=lambda r: (not strip_accents(r.name).startswith(key), len(r.name)))
    return [{"id": r.id, "name": r.name, "specialty_hint": r.specialty_hint} for r in hits[:12]]

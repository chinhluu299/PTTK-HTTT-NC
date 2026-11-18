"""Hóa đơn cuối ca = phí khám + phí CLS + tiền thuốc − tiền cọc (− khoản đã chuyển khoản tại quầy)."""
from sqlalchemy.orm import Session

from .models import Appointment


def invoice(db: Session, appt: Appointment) -> dict:
    labs = [{"name": o.service.name, "price": o.price} for o in appt.lab_orders if o.status == "DONE"]
    lab_total = sum(x["price"] for x in labs)
    meds = []
    med_total = 0
    if appt.prescription:
        for d in appt.prescription.details:
            meds.append({"name": d.medicine.name, "quantity": d.quantity, "unit": d.medicine.unit,
                         "unit_price": d.unit_price, "amount": d.amount})
        med_total = appt.prescription.total_amount
    deposit = sum(p.amount for p in appt.payments if p.kind == "DEPOSIT" and p.status == "SUCCESS")
    paid_final = sum(p.amount for p in appt.payments if p.kind == "FINAL" and p.status == "SUCCESS")
    gross = appt.consultation_fee + lab_total + med_total
    return {
        "consultation_fee": appt.consultation_fee, "labs": labs, "lab_total": lab_total,
        "medicines": meds, "medicine_total": med_total, "gross": gross, "deposit": deposit,
        "paid_final": paid_final, "due": max(0, gross - deposit - paid_final),
        "refund": max(0, deposit + paid_final - gross),
    }

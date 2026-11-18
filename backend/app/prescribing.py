"""F4 – Kê đơn có kiểm tra tự động.

- Số lượng = liều mỗi lần × số lần/ngày × số ngày (làm tròn lên đơn vị nguyên); thành tiền = số lượng × đơn giá.
- Trùng hoạt chất: ≥ 2 mặt hàng trong đơn có chung hoạt chất -> cảnh báo, bác sĩ phải xác nhận.
- Vượt liều: tổng liều/ngày của MỘT HOẠT CHẤT cộng từ mọi thuốc trong đơn > mức tối đa trong danh mục
  (hoặc số đơn vị/ngày của một mặt hàng > mức tối đa của mặt hàng) -> cảnh báo đỏ, bác sĩ phải nhập lý do.
"""
import math
from collections import defaultdict

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from .models import Medicine, MedicineIngredient

TIMING_LABEL = {"SAU_AN": "Sau ăn", "TRUOC_AN": "Trước ăn", "TRONG_AN": "Trong bữa ăn",
                "KHONG_PHU_THUOC": "Không phụ thuộc bữa ăn"}


def vn(n: float) -> str:
    """Số kiểu Việt Nam: 4.500 ; 7,5"""
    if float(n).is_integer():
        return f"{n:,.0f}".replace(",", ".")
    return f"{n:,.2f}".rstrip("0").replace(",", " ").replace(".", ",").replace(" ", ".")


class RxItem(BaseModel):
    medicine_id: int
    dose_per_time: float = Field(gt=0, le=20)
    times_per_day: int = Field(ge=1, le=6)
    days: int = Field(ge=1, le=90)
    timing: str = "SAU_AN"
    note: str | None = None


def evaluate(db: Session, items: list[RxItem]) -> dict:
    ids = {it.medicine_id for it in items}
    meds = {m.id: m for m in db.query(Medicine).options(
        selectinload(Medicine.ingredients).selectinload(MedicineIngredient.ingredient)).filter(Medicine.id.in_(ids))}
    lines, total = [], 0
    per_ing: dict[int, dict] = defaultdict(lambda: {"total": 0.0, "sources": []})
    warnings = []
    for idx, it in enumerate(items):
        m = meds.get(it.medicine_id)
        if not m or not m.is_active:
            raise HTTPException(400, f"Thuốc ở dòng {idx + 1} không có trong danh mục")
        if it.timing not in TIMING_LABEL:
            raise HTTPException(400, "Thời điểm dùng không hợp lệ")
        quantity = math.ceil(round(it.dose_per_time * it.times_per_day * it.days, 4))
        amount = quantity * m.unit_price
        total += amount
        daily_units = it.dose_per_time * it.times_per_day
        lines.append({
            "index": idx, "medicine_id": m.id, "name": m.name, "unit": m.unit, "unit_price": m.unit_price,
            "dose_per_time": it.dose_per_time, "times_per_day": it.times_per_day, "days": it.days,
            "timing": it.timing, "timing_label": TIMING_LABEL[it.timing], "note": it.note,
            "quantity": quantity, "amount": amount,
            "ingredients": [{"name": mi.ingredient.name, "amount": mi.amount, "unit": mi.ingredient.dose_unit}
                            for mi in m.ingredients],
        })
        if m.max_daily_quantity and daily_units > m.max_daily_quantity:
            warnings.append({"type": "OVERDOSE", "level": "danger", "medicine": m.name, "lines": [idx],
                             "message": f"{m.name}: {vn(daily_units)} {m.unit}/ngày vượt mức tối đa "
                                        f"{vn(m.max_daily_quantity)} {m.unit}/ngày"})
        for mi in m.ingredients:
            entry = per_ing[mi.ingredient_id]
            entry["ingredient"] = mi.ingredient
            entry["total"] += mi.amount * daily_units
            entry["sources"].append({"line": idx, "medicine": m.name, "daily": mi.amount * daily_units})

    for entry in per_ing.values():
        ing = entry["ingredient"]
        meds_in = list(dict.fromkeys(s["medicine"] for s in entry["sources"]))
        lines_in = [s["line"] for s in entry["sources"]]
        if len(entry["sources"]) >= 2:
            warnings.append({"type": "DUPLICATE", "level": "warning", "ingredient": ing.name, "lines": lines_in,
                             "message": f"Trùng hoạt chất {ing.name}: {' và '.join(meds_in)}"})
        if ing.max_daily_dose and entry["total"] > ing.max_daily_dose + 1e-9:
            detail = " + ".join(f"{s['medicine']}: {vn(s['daily'])} {ing.dose_unit}" for s in entry["sources"])
            warnings.append({
                "type": "OVERDOSE", "level": "danger", "ingredient": ing.name, "lines": lines_in,
                "total": round(entry["total"], 2), "max": ing.max_daily_dose, "unit": ing.dose_unit,
                "message": f"Vượt liều {ing.name}: {vn(entry['total'])} {ing.dose_unit}/ngày "
                           f"> tối đa {vn(ing.max_daily_dose)} {ing.dose_unit}/ngày ({detail})"})
    return {
        "lines": lines, "total": total, "warnings": warnings,
        "requires_duplicate_ack": any(w["type"] == "DUPLICATE" for w in warnings),
        "requires_overdose_reason": any(w["type"] == "OVERDOSE" for w in warnings),
    }


def schedule(details) -> list[dict]:
    """Chuyển đơn thuốc thành lịch uống theo buổi cho bệnh nhân."""
    plan = {1: ["Sáng"], 2: ["Sáng", "Tối"], 3: ["Sáng", "Trưa", "Tối"], 4: ["Sáng", "Trưa", "Chiều", "Tối"],
            5: ["Sáng", "Trưa", "Chiều", "Tối", "Trước ngủ"], 6: ["Sáng", "Trưa", "Chiều", "Tối", "Trước ngủ", "Đêm"]}
    out = []
    for d in details:
        out.append({"medicine": d.medicine.name, "unit": d.medicine.unit, "dose": d.dose_per_time,
                    "sessions": plan.get(d.times_per_day, ["Sáng"]), "timing": TIMING_LABEL.get(d.timing, d.timing),
                    "days": d.days, "note": d.note})
    return out

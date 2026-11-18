"""F1 – Lớp 1: luật cứng, KHÔNG dùng AI.

Tách chỉ số (huyết áp, nhiệt độ, SpO2) bằng biểu thức chính quy, so ngưỡng nguy hiểm, dò cụm từ dấu hiệu đỏ.
Làm việc trên văn bản đã bỏ dấu để bắt được cả trường hợp gõ không dấu ("dau nguc kho tho").
Ngưỡng lấy theo bảng ví dụ trong đặc tả – cần đối chiếu tài liệu y khoa trước khi dùng thật.
"""
import re

from ..utils import strip_accents

NEGATIONS = ("khong ", "ko ", "k ", "chua ", "het ", "khong bi ", "khong con ")

BP_RE = re.compile(r"(\d{2,3})\s*(?:/|\\|tren)\s*(\d{2,3})")
TEMP_RES = [
    re.compile(r"(?:nhiet do|sot|than nhiet|do duoc)\D{0,12}?(\d{2}(?:[.,]\d{1,2})?)"),
    re.compile(r"(\d{2}(?:[.,]\d{1,2})?)\s*(?:°\s*c?|do\s*c\b|do\b|oc\b)"),
]
SPO2_RE = re.compile(r"(?:spo2|sp02|spo 2|bao hoa oxy|oxy mau|nong do oxy|oxy)\D{0,12}?(\d{2,3})")

CHEST = ["dau nguc", "tuc nguc", "dau that nguc"]
CHEST_WITH = ["kho tho", "va mo hoi", "toat mo hoi", "ra mo hoi lanh"]
STROKE = ["meo mieng", "yeu nua nguoi", "liet nua nguoi", "noi ngong dot ngot", "dot ngot noi ngong",
          "dot nhien noi ngong", "te nua nguoi"]
FEVER_WITH = ["co giat", "lo mo"]
CONSCIOUS = ["bat tinh", "ngat xiu", "ngung tho", "hon me"]


def _has(text: str, phrase: str) -> bool:
    """Có cụm từ và không bị phủ định ngay trước (vd 'không khó thở')."""
    for m in re.finditer(r"\b" + re.escape(phrase) + r"\b", text):
        before = text[max(0, m.start() - 12):m.start()]
        if any(before.endswith(n) for n in NEGATIONS):
            continue
        return True
    return False


def _num(s: str) -> float:
    return float(s.replace(",", "."))


def extract_vitals(text: str) -> dict:
    t = strip_accents(text)
    vitals: dict = {}
    for m in BP_RE.finditer(t):
        sys_, dia = int(m.group(1)), int(m.group(2))
        if 70 <= sys_ <= 300 and 40 <= dia <= 200 and sys_ > dia:
            vitals["bp"] = {"systolic": sys_, "diastolic": dia}
    for rx in TEMP_RES:
        for m in rx.finditer(t):
            v = _num(m.group(1))
            if 34 <= v <= 43.5:
                vitals["temp"] = v
    for m in SPO2_RE.finditer(t):
        v = int(m.group(1))
        if 50 <= v <= 100:
            vitals["spo2"] = v
    return vitals


def evaluate(text: str) -> dict:
    """Trả về {vitals, flags}. flags rỗng = không có dấu hiệu đỏ."""
    t = strip_accents(text)
    vitals = extract_vitals(text)
    flags = []

    bp = vitals.get("bp")
    if bp and (bp["systolic"] >= 180 or bp["diastolic"] >= 120):
        flags.append({"group": "Huyết áp", "finding": f"Huyết áp {bp['systolic']}/{bp['diastolic']} mmHg "
                      f"(ngưỡng: tâm thu ≥ 180 hoặc tâm trương ≥ 120)", "suspect": "Cơn tăng huyết áp",
                      "specialty": "Tim mạch"})
    spo2 = vitals.get("spo2")
    if spo2 is not None and spo2 < 90:
        flags.append({"group": "SpO2", "finding": f"SpO2 {spo2}% (ngưỡng: < 90%)", "suspect": "Suy hô hấp",
                      "specialty": "Hô hấp"})
    chest = [p for p in CHEST if _has(t, p)]
    chest_with = [p for p in CHEST_WITH if _has(t, p)]
    if chest and chest_with:
        flags.append({"group": "Đau ngực", "finding": "Đau/tức ngực kèm khó thở hoặc vã mồ hôi",
                      "suspect": "Nhồi máu cơ tim", "specialty": "Tim mạch"})
    if any(_has(t, p) for p in STROKE):
        flags.append({"group": "Thần kinh", "finding": "Méo miệng / yếu nửa người / nói ngọng đột ngột",
                      "suspect": "Đột quỵ", "specialty": "Thần kinh"})
    temp = vitals.get("temp")
    has_fever_word = _has(t, "sot") or (temp is not None and temp >= 38)
    if temp is not None and temp >= 40:
        flags.append({"group": "Sốt", "finding": f"Sốt {temp:g}°C (ngưỡng: ≥ 40°C)",
                      "suspect": "Nhiễm trùng nặng", "specialty": "Nội tổng quát"})
    elif has_fever_word and any(_has(t, p) for p in FEVER_WITH):
        flags.append({"group": "Sốt", "finding": "Sốt kèm co giật hoặc lơ mơ",
                      "suspect": "Nhiễm trùng nặng", "specialty": "Nội tổng quát"})
    if any(_has(t, p) for p in CONSCIOUS):
        flags.append({"group": "Ý thức", "finding": "Bất tỉnh / ngất / ngừng thở",
                      "suspect": "Tình trạng nguy kịch", "specialty": "Nội tổng quát"})
    return {"vitals": vitals, "flags": flags}

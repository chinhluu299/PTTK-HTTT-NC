"""Tiện ích chung: thời gian theo giờ Việt Nam, khung giờ (QĐ01), mã khám (QĐ06), bỏ dấu tiếng Việt."""
import secrets
import string
import unicodedata
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .config import settings

TZ = ZoneInfo(settings.timezone)

# QĐ01 – mỗi khung 30 phút, nghỉ trưa 12:00–14:00, Thứ 2 – Thứ 7
MORNING_SLOTS = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]
AFTERNOON_SLOTS = ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"]
SLOTS = MORNING_SLOTS + AFTERNOON_SLOTS

WEEKDAYS_VI = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]


def now() -> datetime:
    return datetime.now(TZ)


def today() -> date:
    return now().date()


def is_working_day(d: date) -> bool:
    return d.weekday() <= 5  # 0 = Thứ 2 ... 5 = Thứ 7


def slot_session(slot: str) -> str:
    return "MORNING" if slot in MORNING_SLOTS else "AFTERNOON"


def slot_start(d: date, slot: str) -> datetime:
    h, m = slot.split(":")
    return datetime.combine(d, time(int(h), int(m)), tzinfo=TZ)


def leave_covers(leave_session: str, slot: str) -> bool:
    return leave_session == "FULL_DAY" or leave_session == slot_session(slot)


def working_days(start: date, count: int) -> list[date]:
    days, d = [], start
    while len(days) < count:
        if is_working_day(d):
            days.append(d)
        d += timedelta(days=1)
    return days


_CODE_ALPHABET = string.ascii_uppercase + string.digits


def gen_code() -> str:
    """QĐ06 – 12 ký tự ngẫu nhiên A–Z, 0–9."""
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(12))


def strip_accents(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d")


def mask_name(name: str) -> str:
    """Che bớt tên khi hiển thị ở kiosk công cộng: 'Nguyễn Văn An' -> 'Nguyễn V. A.'"""
    parts = name.split()
    if len(parts) <= 1:
        return name[:1] + "***"
    return parts[0] + " " + " ".join(p[0] + "." for p in parts[1:])


def mask_phone(phone: str) -> str:
    return phone[:3] + "****" + phone[-3:] if len(phone) >= 7 else phone

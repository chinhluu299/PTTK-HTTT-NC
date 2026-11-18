import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Patient, Staff, TriageSession
from ..security import create_token, current_patient, current_staff, hash_password, verify_password
from ..serializers import patient_profile, staff_brief
from ..utils import now

router = APIRouter(prefix="/api/auth", tags=["Xác thực"])
PHONE_RE = re.compile(r"^0\d{9}$")


def _phone(v: str) -> str:
    v = re.sub(r"[\s.\-]", "", v or "")
    if v.startswith("+84"):
        v = "0" + v[3:]
    if not PHONE_RE.match(v):
        raise ValueError("Số điện thoại gồm 10 số, bắt đầu bằng 0")
    return v


class RegisterIn(BaseModel):
    phone: str
    password: str = Field(min_length=6, max_length=64)
    full_name: str = Field(min_length=2, max_length=100)
    birth_year: int
    gender: str
    email: str | None = None
    triage_session_id: str | None = None

    @field_validator("phone")
    @classmethod
    def _p(cls, v):
        return _phone(v)

    @field_validator("birth_year")
    @classmethod
    def _by(cls, v):
        if not 1900 <= v <= now().year:
            raise ValueError("Năm sinh không hợp lệ")
        return v

    @field_validator("gender")
    @classmethod
    def _g(cls, v):
        if v not in ("NAM", "NU"):
            raise ValueError("Giới tính không hợp lệ")
        return v


class LoginIn(BaseModel):
    phone: str
    password: str
    triage_session_id: str | None = None


class StaffLoginIn(BaseModel):
    username: str
    password: str


def _attach_session(db: Session, sid: str | None, patient: Patient):
    """Gắn phiên trò chuyện với AI (đã làm trước khi đăng ký) vào tài khoản."""
    if not sid:
        return
    s = db.get(TriageSession, sid)
    if s and s.patient_id is None:
        s.patient_id = patient.id


@router.post("/patient/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(Patient).filter(Patient.phone == body.phone).first():
        raise HTTPException(409, "Số điện thoại đã được đăng ký, vui lòng đăng nhập")
    email = (body.email or "").strip() or None
    p = Patient(phone=body.phone, password_hash=hash_password(body.password), full_name=body.full_name.strip(),
                birth_year=body.birth_year, gender=body.gender, email=email)
    db.add(p)
    db.flush()
    _attach_session(db, body.triage_session_id, p)
    db.commit()
    return {"token": create_token("patient", p.id), "patient": patient_profile(p)}


@router.post("/patient/login")
def patient_login(body: LoginIn, db: Session = Depends(get_db)):
    try:
        phone = _phone(body.phone)
    except ValueError:
        raise HTTPException(400, "Số điện thoại không hợp lệ")
    p = db.query(Patient).filter(Patient.phone == phone).first()
    if not p or not verify_password(body.password, p.password_hash):
        raise HTTPException(401, "Sai số điện thoại hoặc mật khẩu")
    if p.is_locked:
        raise HTTPException(403, "Tài khoản đã bị khóa. Vui lòng liên hệ phòng khám")
    _attach_session(db, body.triage_session_id, p)
    db.commit()
    return {"token": create_token("patient", p.id), "patient": patient_profile(p)}


@router.post("/staff/login")
def staff_login(body: StaffLoginIn, db: Session = Depends(get_db)):
    s = db.query(Staff).filter(Staff.username == body.username.strip().lower()).first()
    if not s or not verify_password(body.password, s.password_hash):
        raise HTTPException(401, "Sai tên đăng nhập hoặc mật khẩu")
    if not s.is_active:
        raise HTTPException(403, "Tài khoản đã bị vô hiệu hóa")
    return {"token": create_token("staff", s.id, s.role), "staff": staff_brief(s)}


@router.get("/patient/me")
def patient_me(p: Patient = Depends(current_patient)):
    return patient_profile(p)


class ProfileIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    birth_year: int
    gender: str
    email: str | None = None
    address: str | None = None
    relative_name: str | None = None
    relative_phone: str | None = None


@router.put("/patient/me")
def update_profile(body: ProfileIn, p: Patient = Depends(current_patient), db: Session = Depends(get_db)):
    if body.gender not in ("NAM", "NU") or not 1900 <= body.birth_year <= now().year:
        raise HTTPException(400, "Thông tin không hợp lệ")
    for k, v in body.model_dump().items():
        setattr(p, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    return patient_profile(p)


@router.get("/staff/me")
def staff_me(s: Staff = Depends(current_staff)):
    return staff_brief(s)

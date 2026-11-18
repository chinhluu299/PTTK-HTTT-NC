"""Xác thực JWT và lớp phân quyền thứ nhất (theo role). Lớp thứ hai (theo hồ sơ) nằm trong từng router."""
from datetime import timedelta

import bcrypt
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Patient, Staff
from .utils import now

ALGO = "HS256"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(kind: str, sub: int, role: str | None = None) -> str:
    payload = {"typ": kind, "sub": str(sub), "exp": now() + timedelta(hours=settings.jwt_expire_hours)}
    if role:
        payload["role"] = role
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGO)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGO])
    except JWTError:
        return None


def _bearer(request: Request) -> dict | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return decode_token(auth[7:])


def optional_patient(request: Request, db: Session = Depends(get_db)) -> Patient | None:
    data = _bearer(request)
    if not data or data.get("typ") != "patient":
        return None
    p = db.get(Patient, int(data["sub"]))
    return p if p and not p.is_locked else None


def current_patient(p: Patient | None = Depends(optional_patient)) -> Patient:
    if not p:
        raise HTTPException(401, "Vui lòng đăng nhập")
    return p


def current_staff(request: Request, db: Session = Depends(get_db)) -> Staff:
    data = _bearer(request)
    if not data or data.get("typ") != "staff":
        raise HTTPException(401, "Vui lòng đăng nhập tài khoản nhân viên")
    s = db.get(Staff, int(data["sub"]))
    if not s or not s.is_active:
        raise HTTPException(401, "Tài khoản không còn hiệu lực")
    return s


def require_role(*roles: str):
    def dep(staff: Staff = Depends(current_staff)) -> Staff:
        if staff.role not in roles:
            raise HTTPException(403, "Vai trò của bạn không được phép thực hiện thao tác này")
        return staff
    return dep

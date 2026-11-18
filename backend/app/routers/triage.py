from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Patient, TriageSession
from ..security import optional_patient
from ..triage import service

router = APIRouter(prefix="/api/triage", tags=["F1 – Trợ lý AI"])


def _get(db: Session, sid: str, patient: Patient | None) -> TriageSession:
    s = db.get(TriageSession, sid)
    if not s:
        raise HTTPException(404, "Không tìm thấy phiên trò chuyện")
    # Phiên đã gắn với tài khoản thì chỉ chủ tài khoản được xem
    if s.patient_id and (not patient or patient.id != s.patient_id):
        raise HTTPException(403, "Bạn không có quyền xem phiên trò chuyện này")
    return s


@router.post("/sessions")
def create(db: Session = Depends(get_db), patient: Patient | None = Depends(optional_patient)):
    """Không cần đăng nhập. Đã đăng nhập thì lấy tuổi, giới tính từ hồ sơ."""
    return service.serialize(service.create_session(db, patient))


@router.get("/sessions/{sid}")
def get(sid: str, db: Session = Depends(get_db), patient: Patient | None = Depends(optional_patient)):
    return service.serialize(_get(db, sid, patient))


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


@router.post("/sessions/{sid}/messages")
def message(sid: str, body: MessageIn, db: Session = Depends(get_db),
            patient: Patient | None = Depends(optional_patient)):
    s = _get(db, sid, patient)
    if len(s.messages or []) > 60:
        raise HTTPException(400, "Phiên trò chuyện quá dài, vui lòng bắt đầu lại")
    return service.serialize(service.handle_message(db, s, body.text))


@router.post("/sessions/{sid}/ack-emergency")
def ack_emergency(sid: str, db: Session = Depends(get_db), patient: Patient | None = Depends(optional_patient)):
    """Bệnh nhân bấm xác nhận đã đọc cảnh báo cấp cứu thì mới được tiếp tục."""
    s = _get(db, sid, patient)
    if s.state != "EMERGENCY":
        raise HTTPException(400, "Phiên không ở trạng thái cảnh báo cấp cứu")
    s.emergency_acknowledged = True
    db.commit()
    return service.serialize(s)

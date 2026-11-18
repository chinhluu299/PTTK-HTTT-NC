import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..booking import process_bank_transfer
from ..config import settings
from ..db import get_db
from ..models import Appointment
from ..realtime import broker

router = APIRouter(prefix="/api/payments", tags=["F2 – Thanh toán"])


class SepayWebhook(BaseModel):
    """Định dạng webhook của SePay (https://docs.sepay.vn)."""
    id: int | str
    gateway: str | None = None
    transactionDate: str | None = None
    accountNumber: str | None = None
    content: str = ""
    transferType: str = "in"
    transferAmount: int
    referenceCode: str | None = None
    description: str | None = None


def _handle(db: Session, body: SepayWebhook) -> dict:
    if body.transferType != "in":
        return {"success": True, "result": "ignored"}
    res = process_bank_transfer(db, "SEPAY", str(body.id), body.transferAmount, body.content, body.model_dump())
    if res.get("appointment_id"):
        a = db.get(Appointment, res["appointment_id"])
        broker.publish(f"patient:{a.patient_id}", "appointment_updated", {"appointment_id": a.id})
        if res["result"] == "final_received":
            broker.publish("role:PHARMACIST", "queue_updated", {})
    return {"success": True, **res}


@router.post("/sepay-webhook")
def sepay_webhook(body: SepayWebhook, authorization: str = Header(default=""), db: Session = Depends(get_db)):
    if authorization != f"Apikey {settings.sepay_api_key}":
        raise HTTPException(401, "Sai API key")
    return _handle(db, body)


class SimulateIn(BaseModel):
    code: str
    amount: int | None = None
    transaction_id: str | None = None  # truyền lại cùng mã để thử webhook gửi trùng


@router.post("/dev/simulate")
def simulate(body: SimulateIn, db: Session = Depends(get_db)):
    """Môi trường thử nghiệm: giả lập ngân hàng báo tiền về, đi qua đúng luồng webhook."""
    if not settings.payment_dev_mode:
        raise HTTPException(404, "Not found")
    a = db.query(Appointment).filter(Appointment.code == body.code.upper()).first()
    if not a:
        raise HTTPException(404, "Không tìm thấy mã khám")
    from ..billing import invoice
    amount = body.amount if body.amount is not None else (
        invoice(db, a)["due"] if a.status == "COMPLETED" else a.deposit_amount)
    txn = body.transaction_id or str(secrets.randbelow(10 ** 9))
    payload = SepayWebhook(id=txn, gateway="MBBank", content=f"{a.code} thanh toan MedCare", transferAmount=amount,
                           transferType="in", accountNumber="0000000000", referenceCode=f"FT{txn}")
    return {"transaction_id": txn, **_handle(db, payload)}

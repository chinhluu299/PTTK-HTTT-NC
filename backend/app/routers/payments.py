import secrets

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import booking, payos
from ..config import settings
from ..db import get_db
from ..models import Appointment
from ..realtime import broker
from ..security import require_role

router = APIRouter(prefix="/api/payments", tags=["F2 – Thanh toán"])


def notify(db: Session, res: dict):
    if res.get("appointment_id") and res["result"] != "duplicate":
        a = db.get(Appointment, res["appointment_id"])
        broker.publish(f"patient:{a.patient_id}", "appointment_updated", {"appointment_id": a.id})


@router.post("/payos-webhook")
def payos_webhook(payload: dict = Body(...), db: Session = Depends(get_db)):
    """payOS báo kết quả thanh toán. Kiểm tra chữ ký HMAC-SHA256 (PAYOS_CHECKSUM_KEY) trước khi xử lý."""
    data = payos.verify_webhook(payload)
    if data is None:
        raise HTTPException(400, "Chữ ký webhook không hợp lệ")
    if not (data.get("code") == "00" or payload.get("success") is True):
        return {"success": True, "result": "ignored"}
    try:
        order_code, amount = int(data["orderCode"]), int(data["amount"])
    except (KeyError, TypeError, ValueError):
        return {"success": True, "result": "ignored"}
    res = booking.confirm_deposit(db, order_code, amount, str(data.get("reference") or ""), payload)
    notify(db, res)
    return {"success": True, **res}


class WebhookUrlIn(BaseModel):
    webhook_url: str | None = None


@router.post("/payos/confirm-webhook")
def confirm_webhook(body: WebhookUrlIn, request: Request, _=Depends(require_role("ADMIN"))):
    """Đăng ký URL webhook với payOS (một lần khi triển khai). Mặc định dùng địa chỉ của chính API này."""
    url = body.webhook_url or str(request.base_url).rstrip("/") + "/api/payments/payos-webhook"
    try:
        payos.confirm_webhook(url)
    except payos.PayOSError as e:
        raise HTTPException(502, str(e))
    return {"webhook_url": url, "status": "confirmed"}


class SimulateIn(BaseModel):
    code: str
    amount: int | None = None
    transaction_id: str | None = None


@router.post("/dev/simulate")
def simulate(body: SimulateIn, db: Session = Depends(get_db)):
    """Môi trường thử nghiệm: giả lập payOS báo đơn cọc đã thanh toán, đi qua đúng luồng xác nhận của webhook."""
    if not settings.payment_dev_mode:
        raise HTTPException(404, "Not found")
    a = db.query(Appointment).filter(Appointment.code == body.code.upper()).first()
    if not a:
        raise HTTPException(404, "Không tìm thấy mã khám")
    pay = booking.pending_deposit(a) or next(
        (p for p in reversed(a.payments)
         if p.gateway == "PAYOS" and p.kind == "DEPOSIT" and (p.raw_payload or {}).get("order_code")), None)
    if pay is None:
        if a.status not in ("HOLD", "EXPIRED"):
            raise HTTPException(409, "Lịch hẹn không ở trạng thái chờ đặt cọc")
        pay = booking.deposit_order(db, a, offline=True)
        db.commit()
    txn = body.transaction_id or f"SIM{secrets.randbelow(10 ** 9)}"
    amount = body.amount if body.amount is not None else a.deposit_amount
    res = booking.confirm_deposit(db, pay.raw_payload["order_code"], amount, txn, {"simulated": True, "reference": txn})
    notify(db, res)
    return {"transaction_id": txn, **res}

"""Cổng thanh toán payOS (https://payos.vn/docs): tạo link thanh toán, xác thực webhook, tra trạng thái đơn."""
import hashlib
import hmac
import json

import httpx

from .config import settings

BASE = "https://api-merchant.payos.vn"
LINKS = f"{BASE}/v2/payment-requests"


class PayOSError(Exception):
    """Gọi payOS thất bại hoặc chưa cấu hình."""


def is_configured() -> bool:
    return bool(settings.payos_client_id and settings.payos_api_key and settings.payos_checksum_key)


def _hmac(data: str) -> str:
    return hmac.new(settings.payos_checksum_key.encode(), data.encode(), hashlib.sha256).hexdigest()


def _value_to_str(value) -> str:
    """Chuỗi hoá giá trị giống SDK payOS khi dựng chuỗi ký."""
    if value is None or value in ("undefined", "null"):
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        normed = [dict(sorted(v.items())) if isinstance(v, dict) else v for v in value]
        return json.dumps(normed, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def _sign_obj(data: dict) -> str:
    """HMAC-SHA256 trên chuỗi k1=v1&k2=v2... với khoá sắp xếp theo bảng chữ cái."""
    return _hmac("&".join(f"{k}={_value_to_str(data[k])}" for k in sorted(data)))


def _call(method: str, url: str, **kwargs) -> dict:
    if not is_configured():
        raise PayOSError("payOS chưa được cấu hình (thiếu PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY)")
    headers = {"x-client-id": settings.payos_client_id, "x-api-key": settings.payos_api_key}
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.request(method, url, headers=headers, **kwargs)
        payload = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise PayOSError("Không kết nối được tới payOS") from exc
    if payload.get("code") != "00":
        raise PayOSError(payload.get("desc") or f"payOS từ chối yêu cầu (HTTP {resp.status_code})")
    return payload.get("data") or {}


def create_payment_link(*, order_code: int, amount: int, description: str, return_url: str, cancel_url: str,
                        expired_at: int | None = None) -> dict:
    """Tạo link thanh toán. Trả về `data` của payOS: checkoutUrl, qrCode (chuỗi VietQR), paymentLinkId,
    bin, accountNumber, accountName, description... `expiredAt` không nằm trong chuỗi ký."""
    description = description[:25]
    body = {
        "orderCode": order_code, "amount": amount, "description": description,
        "cancelUrl": cancel_url, "returnUrl": return_url,
        "signature": _sign_obj({"amount": amount, "cancelUrl": cancel_url, "description": description,
                                "orderCode": order_code, "returnUrl": return_url}),
    }
    if expired_at:
        body["expiredAt"] = expired_at
    return _call("POST", LINKS, json=body)


def get_payment_info(order_code: int) -> dict:
    """Trạng thái đơn: status PENDING | PAID | CANCELLED | EXPIRED, amountPaid, transactions[]."""
    return _call("GET", f"{LINKS}/{order_code}")


def cancel_payment_link(order_code: int, reason: str) -> dict:
    return _call("POST", f"{LINKS}/{order_code}/cancel", json={"cancellationReason": reason})


def confirm_webhook(webhook_url: str) -> None:
    """Đăng ký URL webhook với payOS (payOS gửi thử một request có chữ ký tới URL này)."""
    _call("POST", f"{BASE}/confirm-webhook", json={"webhookUrl": webhook_url})


def verify_webhook(payload: dict) -> dict | None:
    """Trả về `data` nếu chữ ký webhook hợp lệ, ngược lại None."""
    data, signature = payload.get("data"), payload.get("signature")
    if not is_configured() or not isinstance(data, dict) or not isinstance(signature, str):
        return None
    return data if hmac.compare_digest(_sign_obj(data), signature) else None

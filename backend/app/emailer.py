"""Gửi email qua SMTP. Chưa cấu hình SMTP thì ghi email ra thư mục outbox/ để xem khi demo."""
import logging
import smtplib
import threading
from email.message import EmailMessage
from pathlib import Path

import segno

from .config import settings
from .utils import now

log = logging.getLogger("medcare.email")
OUTBOX = Path(__file__).resolve().parent.parent / "outbox"


def qr_png(data: str) -> bytes:
    import io
    buf = io.BytesIO()
    segno.make(data, error="m").save(buf, kind="png", scale=8, border=2)
    return buf.getvalue()


def _send(to: str, subject: str, html: str, qr_data: str | None):
    if not settings.smtp_host:
        OUTBOX.mkdir(exist_ok=True)
        stamp = now().strftime("%Y%m%d-%H%M%S")
        safe = "".join(c if c.isalnum() else "_" for c in to)[:40]
        base = OUTBOX / f"{stamp}-{safe}"
        if qr_data:
            (base.with_suffix(".qr.png")).write_bytes(qr_png(qr_data))
            html = html.replace("cid:qr", base.with_suffix(".qr.png").name)
        base.with_suffix(".html").write_text(f"<!-- To: {to} | Subject: {subject} -->\n{html}", encoding="utf-8")
        log.info("Email (outbox) -> %s: %s", to, subject)
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, subject
    msg.set_content("Vui lòng xem email ở chế độ HTML.")
    msg.add_alternative(html, subtype="html")
    if qr_data:
        msg.get_payload()[1].add_related(qr_png(qr_data), "image", "png", cid="<qr>")
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
    except Exception:  # không để lỗi email làm hỏng nghiệp vụ
        log.exception("Gửi email thất bại tới %s", to)


def send_email(to: str | None, subject: str, html: str, qr_data: str | None = None):
    if not to:
        return
    threading.Thread(target=_send, args=(to, subject, html, qr_data), daemon=True).start()


def layout(title: str, body: str) -> str:
    return f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#14202b">
<div style="border-bottom:3px solid #0d5c8c;padding:12px 0;font-weight:bold;font-size:18px">Phòng khám MedCare</div>
<h2 style="font-size:20px">{title}</h2>{body}
<p style="color:#6b7785;font-size:12px;margin-top:32px">Email tự động từ hệ thống MedCare. Vui lòng không trả lời.</p></div>"""

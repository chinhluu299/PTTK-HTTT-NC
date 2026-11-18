"""Lưu file kết quả CLS: Cloudinary nếu có CLOUDINARY_URL, ngược lại lưu vào thư mục uploads/."""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import settings

UPLOADS = Path(__file__).resolve().parent.parent / "uploads"
ALLOWED = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_BYTES = 10 * 1024 * 1024


def save_upload(file: UploadFile, base_url: str) -> dict:
    if file.content_type not in ALLOWED:
        raise HTTPException(400, "Chỉ nhận ảnh JPG/PNG/WEBP hoặc PDF")
    data = file.file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "File vượt quá 10 MB")
    kind = "pdf" if file.content_type == "application/pdf" else "image"
    if settings.cloudinary_url:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(cloudinary_url=settings.cloudinary_url)
        res = cloudinary.uploader.upload(data, folder="medcare/lab", resource_type="auto")
        return {"url": res["secure_url"], "name": file.filename, "type": kind}
    UPLOADS.mkdir(exist_ok=True)
    ext = Path(file.filename or "").suffix.lower() or (".pdf" if kind == "pdf" else ".jpg")
    name = f"{uuid.uuid4().hex}{ext}"
    (UPLOADS / name).write_bytes(data)
    return {"url": f"{base_url.rstrip('/')}/uploads/{name}", "name": file.filename, "type": kind}

"""Server-Sent Events. EventSource không gửi được header nên token đi qua query string."""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..db import SessionLocal
from ..models import Staff
from ..realtime import broker
from ..security import decode_token

router = APIRouter(prefix="/api/events", tags=["Realtime"])


def _stream(request: Request, channels: list[str]):
    q = broker.subscribe(channels)

    async def gen():
        try:
            yield "retry: 3000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"event: {ev['type']}\ndata: {json.dumps(ev, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            broker.unsubscribe(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("")
async def events(request: Request, token: str):
    data = decode_token(token)
    if not data:
        raise HTTPException(401, "Token không hợp lệ")
    if data["typ"] == "patient":
        return _stream(request, [f"patient:{data['sub']}"])
    with SessionLocal() as db:
        s = db.get(Staff, int(data["sub"]))
        if not s or not s.is_active:
            raise HTTPException(401, "Token không hợp lệ")
        channels = [f"staff:{s.id}", f"role:{s.role}"]
        if s.department_id:
            channels.append(f"dept:{s.department_id}")
    return _stream(request, channels)


@router.get("/display")
async def display(request: Request):
    """Màn hình chờ quầy thuốc (công khai, chỉ có số thứ tự)."""
    return _stream(request, ["display"])

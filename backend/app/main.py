import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import jobs
from .config import settings
from .db import SessionLocal
from .realtime import broker
from .routers import (admin, appointments, auth, catalog, doctor, events, kiosk, lab, leaves, payments, pharmacy,
                      triage)
from .storage import UPLOADS
from .triage.rag import build_from_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("medcare")


@asynccontextmanager
async def lifespan(_: FastAPI):
    broker.loop = asyncio.get_running_loop()
    with SessionLocal() as db:
        n = build_from_db(db)
    log.info("RAG: đã nạp %d bệnh vào chỉ mục FAISS", n)
    jobs.start()
    yield
    jobs.stop()


app = FastAPI(title="MedCare AI – API", version="1.0", lifespan=lifespan,
              description="Hệ thống quản lý phòng khám & đặt lịch tích hợp AI phân loại triệu chứng")
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
UPLOADS.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

for r in (auth, catalog, triage, appointments, payments, kiosk, doctor, lab, pharmacy, leaves, admin, events):
    app.include_router(r.router)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    msg = str(first.get("msg", "Dữ liệu không hợp lệ")).removeprefix("Value error, ")
    field = ".".join(str(x) for x in first.get("loc", [])[1:])
    return JSONResponse(status_code=422, content={"detail": msg, "field": field})


@app.get("/api/health")
def health():
    return {"ok": True}

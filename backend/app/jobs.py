"""Job nền chạy mỗi phút (F2): hết hạn giữ chỗ -> EXPIRED, trễ 15 phút chưa check-in -> NO_SHOW,
và email nhắc tái khám trước 1 ngày."""
import logging
from datetime import timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from . import emailer
from .config import settings
from .db import SessionLocal
from .models import Appointment, MedicalRecord, Patient
from .state import transition
from .utils import now, slot_start, today

log = logging.getLogger("medcare.jobs")
scheduler = BackgroundScheduler(timezone=settings.timezone)


def expire_holds():
    with SessionLocal() as db:
        rows = db.query(Appointment).filter(Appointment.status == "HOLD", Appointment.hold_expires_at < now()) \
            .with_for_update(skip_locked=True).all()
        for a in rows:
            transition(db, a, "EXPIRED", "SYSTEM", reason="Quá 5 phút chưa đặt cọc – trả chỗ")
        db.commit()
        if rows:
            log.info("EXPIRED %d lịch giữ chỗ", len(rows))


def mark_no_show():
    with SessionLocal() as db:
        cutoff = now() - timedelta(minutes=settings.no_show_after_minutes)
        rows = db.query(Appointment).filter(Appointment.status == "CONFIRMED", Appointment.date <= today()) \
            .with_for_update(skip_locked=True).all()
        n = 0
        for a in rows:
            if slot_start(a.date, a.slot) < cutoff:
                transition(db, a, "NO_SHOW", "SYSTEM",
                           reason=f"Trễ quá {settings.no_show_after_minutes} phút chưa check-in")
                n += 1
        db.commit()
        if n:
            log.info("NO_SHOW %d lịch", n)


def remind_follow_up():
    with SessionLocal() as db:
        tomorrow = today() + timedelta(days=1)
        recs = db.query(MedicalRecord).filter(MedicalRecord.follow_up_date == tomorrow,
                                              MedicalRecord.follow_up_reminded.is_(False),
                                              MedicalRecord.is_locked).all()
        for r in recs:
            p = db.get(Patient, r.patient_id)
            body = (f"<p>Chào {p.full_name},</p><p>Bác sĩ hẹn bạn <b>tái khám vào ngày "
                    f"{tomorrow.strftime('%d/%m/%Y')}</b>.</p><p>Bạn có thể đặt lịch tại "
                    f"<a href='{settings.frontend_url}/kham'>{settings.frontend_url}/kham</a>.</p>")
            emailer.send_email(p.email, "Nhắc lịch tái khám", emailer.layout("Nhắc lịch tái khám", body))
            r.follow_up_reminded = True
        db.commit()


def run_all():
    for job in (expire_holds, mark_no_show, remind_follow_up):
        try:
            job()
        except Exception:
            log.exception("Job %s lỗi", job.__name__)


def start():
    scheduler.add_job(run_all, "interval", minutes=1, id="medcare-minutely", next_run_time=now(),
                      replace_existing=True, max_instances=1)
    scheduler.start()


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)

"""20 bảng theo mục VII của đặc tả (+ bảng SYSTEM_SETTINGS lưu tham số do quản trị viên cấu hình)."""
from datetime import date, datetime

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _ts():
    return mapped_column(DateTime(timezone=True), server_default=func.now())


# ───────────────────────── Người dùng ─────────────────────────

class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(100))
    birth_year: Mapped[int] = mapped_column(Integer)
    gender: Mapped[str] = mapped_column(String(10))  # NAM | NU
    # Không bắt buộc
    email: Mapped[str | None] = mapped_column(String(120))  # để nhận email xác nhận / nhắc tái khám
    address: Mapped[str | None] = mapped_column(String(255))
    relative_name: Mapped[str | None] = mapped_column(String(100))
    relative_phone: Mapped[str | None] = mapped_column(String(15))
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _ts()


class Staff(Base):
    __tablename__ = "staff"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))  # DOCTOR | TECHNICIAN | PHARMACIST | ADMIN
    specialty_id: Mapped[int | None] = mapped_column(ForeignKey("specialties.id"))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    room: Mapped[str | None] = mapped_column(String(50))  # phòng khám của bác sĩ
    email: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _ts()

    specialty: Mapped["Specialty | None"] = relationship()
    department: Mapped["Department | None"] = relationship()


# ───────────────────────── Danh mục ─────────────────────────

class Specialty(Base):
    __tablename__ = "specialties"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_general: Mapped[bool] = mapped_column(Boolean, default=False)  # Nội tổng quát (QĐ07)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    room: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class LabService(Base):
    __tablename__ = "lab_services"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    price: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    department: Mapped[Department] = relationship()


class Medicine(Base):
    __tablename__ = "medicines"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))          # tên thương mại, vd "Panadol 500mg"
    strength: Mapped[str] = mapped_column(String(50))       # hàm lượng hiển thị, vd "500mg"
    dosage_form: Mapped[str] = mapped_column(String(50))    # dạng bào chế, vd "Viên nén"
    unit: Mapped[str] = mapped_column(String(20))           # đơn vị tính, vd "viên"
    unit_price: Mapped[int] = mapped_column(Integer)
    max_daily_quantity: Mapped[float | None] = mapped_column(Float)  # liều tối đa/ngày tính theo đơn vị của mặt hàng
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    ingredients: Mapped[list["MedicineIngredient"]] = relationship(
        back_populates="medicine", cascade="all, delete-orphan")


class ActiveIngredient(Base):
    __tablename__ = "active_ingredients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    max_daily_dose: Mapped[float | None] = mapped_column(Float)  # tổng liều tối đa/ngày của hoạt chất
    dose_unit: Mapped[str] = mapped_column(String(10), default="mg")


class MedicineIngredient(Base):
    __tablename__ = "medicine_ingredients"
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicines.id", ondelete="CASCADE"), primary_key=True)
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("active_ingredients.id"), primary_key=True)
    amount: Mapped[float] = mapped_column(Float)  # hàm lượng hoạt chất trong 1 đơn vị thuốc (mg)

    medicine: Mapped[Medicine] = relationship(back_populates="ingredients")
    ingredient: Mapped[ActiveIngredient] = relationship()


class DiseaseKnowledge(Base):
    __tablename__ = "disease_knowledge_base"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    symptoms: Mapped[str] = mapped_column(Text)
    specialty_hint: Mapped[str | None] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(50), default="ViMedical_Disease")


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(String(255))
    label: Mapped[str] = mapped_column(String(150), default="")


# ───────────────────────── Lịch & tiền ─────────────────────────

class StaffLeave(Base):
    __tablename__ = "staff_leaves"
    id: Mapped[int] = mapped_column(primary_key=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id"))
    date: Mapped[date] = mapped_column(Date, index=True)
    session: Mapped[str] = mapped_column(String(15))  # MORNING | AFTERNOON | FULL_DAY
    reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = _ts()

    staff: Mapped[Staff] = relationship()


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("staff.id"), index=True)
    specialty_id: Mapped[int] = mapped_column(ForeignKey("specialties.id"))
    date: Mapped[date] = mapped_column(Date, index=True)
    slot: Mapped[str] = mapped_column(String(5))
    status: Mapped[str] = mapped_column(String(20), index=True)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    triage_session_id: Mapped[str | None] = mapped_column(ForeignKey("ai_triage_sessions.id"))
    urgency: Mapped[str | None] = mapped_column(String(15))
    is_general: Mapped[bool] = mapped_column(Boolean, default=False)
    deposit_amount: Mapped[int] = mapped_column(Integer)
    consultation_fee: Mapped[int] = mapped_column(Integer)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Bác sĩ nghỉ đột xuất (F2): chờ bệnh nhân chọn bác sĩ thay thế / đổi giờ / hoàn cọc
    leave_conflict: Mapped[bool] = mapped_column(Boolean, default=False)
    leave_suggested_doctor_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"))
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    patient: Mapped[Patient] = relationship()
    doctor: Mapped[Staff] = relationship(foreign_keys=[doctor_id])
    suggested_doctor: Mapped[Staff | None] = relationship(foreign_keys=[leave_suggested_doctor_id])
    specialty: Mapped[Specialty] = relationship()
    triage: Mapped["TriageSession | None"] = relationship()
    payments: Mapped[list["Payment"]] = relationship(back_populates="appointment", order_by="Payment.id")
    record: Mapped["MedicalRecord | None"] = relationship(back_populates="appointment", uselist=False)
    lab_orders: Mapped[list["LabOrder"]] = relationship(back_populates="appointment", order_by="LabOrder.id")
    prescription: Mapped["Prescription | None"] = relationship(back_populates="appointment", uselist=False)
    queue_ticket: Mapped["PharmacyQueue | None"] = relationship(back_populates="appointment", uselist=False)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("appointments.id"), index=True)
    kind: Mapped[str] = mapped_column(String(15))     # DEPOSIT | FINAL
    amount: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(15))   # VIETQR | CASH
    gateway: Mapped[str | None] = mapped_column(String(20))
    # Mã giao dịch của cổng – ràng buộc duy nhất để webhook idempotent
    gateway_txn_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(20))   # SUCCESS | REFUND_PENDING | REFUNDED | UNMATCHED | AMOUNT_MISMATCH
    content: Mapped[str | None] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(String(255))
    raw_payload: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = _ts()

    appointment: Mapped[Appointment | None] = relationship(back_populates="payments")


# ───────────────────────── Khám ─────────────────────────

class TriageSession(Base):
    __tablename__ = "ai_triage_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"), index=True)
    messages: Mapped[list] = mapped_column(JSON, default=list)
    vitals: Mapped[dict] = mapped_column(JSON, default=dict)        # chỉ số tách được (Lớp 1)
    red_flags: Mapped[list] = mapped_column(JSON, default=list)     # dấu hiệu đỏ khớp (Lớp 1)
    rag_context: Mapped[list] = mapped_column(JSON, default=list)   # 5 bệnh gần nhất (Lớp 2)
    result: Mapped[dict | None] = mapped_column(JSON)              # JSON đã qua kiểm tra (Lớp 3)
    pending: Mapped[dict | None] = mapped_column(JSON)             # câu hỏi đang chờ trả lời
    urgency: Mapped[str | None] = mapped_column(String(15))       # CAP_CUU | KHAM_SOM | BINH_THUONG
    specialty_id: Mapped[int | None] = mapped_column(ForeignKey("specialties.id"))
    state: Mapped[str] = mapped_column(String(15), default="ACTIVE")  # ACTIVE | DONE | EMERGENCY
    emergency_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    clarify_count: Mapped[int] = mapped_column(Integer, default=0)
    age_group: Mapped[str | None] = mapped_column(String(20))
    gender: Mapped[str | None] = mapped_column(String(10))
    provider: Mapped[str | None] = mapped_column(String(20))
    # Đánh giá của bác sĩ khi chốt ca (human-in-the-loop)
    doctor_feedback_correct: Mapped[bool | None] = mapped_column(Boolean)
    doctor_feedback_specialty_id: Mapped[int | None] = mapped_column(ForeignKey("specialties.id"))
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    specialty: Mapped[Specialty | None] = relationship(foreign_keys=[specialty_id])


class MedicalRecord(Base):
    __tablename__ = "medical_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), unique=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("staff.id"))
    clinical_notes: Mapped[str | None] = mapped_column(Text)   # khám lâm sàng
    diagnosis: Mapped[str | None] = mapped_column(Text)
    diagnosis_kb_id: Mapped[int | None] = mapped_column(ForeignKey("disease_knowledge_base.id"))
    advice: Mapped[str | None] = mapped_column(Text)            # lời dặn
    follow_up_date: Mapped[date | None] = mapped_column(Date)
    follow_up_reminded: Mapped[bool] = mapped_column(Boolean, default=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_amended: Mapped[bool] = mapped_column(Boolean, default=False)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _ts()

    appointment: Mapped[Appointment] = relationship(back_populates="record")


class LabOrder(Base):
    __tablename__ = "lab_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("lab_services.id"))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), index=True)
    ordered_by: Mapped[int] = mapped_column(ForeignKey("staff.id"))
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"))
    status: Mapped[str] = mapped_column(String(15), default="ORDERED")  # ORDERED | IN_PROGRESS | DONE | CANCELLED
    price: Mapped[int] = mapped_column(Integer)
    doctor_note: Mapped[str | None] = mapped_column(String(500))
    cancel_reason: Mapped[str | None] = mapped_column(String(255))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _ts()

    appointment: Mapped[Appointment] = relationship(back_populates="lab_orders")
    service: Mapped[LabService] = relationship()
    department: Mapped[Department] = relationship()
    technician: Mapped[Staff | None] = relationship(foreign_keys=[technician_id])
    result: Mapped["LabResult | None"] = relationship(back_populates="order", uselist=False)


class LabResult(Base):
    __tablename__ = "lab_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    lab_order_id: Mapped[int] = mapped_column(ForeignKey("lab_orders.id"), unique=True)
    files: Mapped[list] = mapped_column(JSON, default=list)  # [{url, name, type}] – URL Cloudinary
    note: Mapped[str | None] = mapped_column(Text)            # nhận xét của kỹ thuật viên
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_amended: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _ts()

    order: Mapped[LabOrder] = relationship(back_populates="result")


class Prescription(Base):
    __tablename__ = "prescriptions"
    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), unique=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("staff.id"))
    total_amount: Mapped[int] = mapped_column(Integer, default=0)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    duplicate_ack: Mapped[bool] = mapped_column(Boolean, default=False)
    overdose_reason: Mapped[str | None] = mapped_column(String(500))  # lý do vượt cảnh báo
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _ts()

    appointment: Mapped[Appointment] = relationship(back_populates="prescription")
    details: Mapped[list["PrescriptionDetail"]] = relationship(
        back_populates="prescription", cascade="all, delete-orphan", order_by="PrescriptionDetail.id")


class PrescriptionDetail(Base):
    __tablename__ = "prescription_details"
    id: Mapped[int] = mapped_column(primary_key=True)
    prescription_id: Mapped[int] = mapped_column(ForeignKey("prescriptions.id", ondelete="CASCADE"))
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicines.id"))
    dose_per_time: Mapped[float] = mapped_column(Float)
    times_per_day: Mapped[int] = mapped_column(Integer)
    days: Mapped[int] = mapped_column(Integer)
    timing: Mapped[str] = mapped_column(String(15))  # SAU_AN | TRUOC_AN | TRONG_AN | KHONG_PHU_THUOC
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(255))

    prescription: Mapped[Prescription] = relationship(back_populates="details")
    medicine: Mapped[Medicine] = relationship()


# ───────────────────────── Vận hành ─────────────────────────

class PharmacyQueue(Base):
    __tablename__ = "pharmacy_queue"
    __table_args__ = (UniqueConstraint("queue_date", "number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), unique=True)
    queue_date: Mapped[date] = mapped_column(Date, index=True)
    number: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)   # thứ tự trong hàng (vắng 3 lần -> chuyển cuối)
    status: Mapped[str] = mapped_column(String(15), default="WAITING")  # WAITING | CALLED | SERVED
    call_count: Mapped[int] = mapped_column(Integer, default=0)
    skip_count: Mapped[int] = mapped_column(Integer, default=0)
    last_called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _ts()

    appointment: Mapped[Appointment] = relationship(back_populates="queue_ticket")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(30), index=True)  # APPOINTMENT | LAB_ORDER | MEDICAL_RECORD | LAB_RESULT ...
    entity_id: Mapped[str] = mapped_column(String(40), index=True)
    action: Mapped[str] = mapped_column(String(30))                  # STATUS_CHANGE | AMEND | ...
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str | None] = mapped_column(String(20))
    actor_type: Mapped[str] = mapped_column(String(15))              # PATIENT | DOCTOR | ... | SYSTEM | GATEWAY | KIOSK
    actor_id: Mapped[int | None] = mapped_column(Integer)
    actor_name: Mapped[str | None] = mapped_column(String(100))
    reason: Mapped[str | None] = mapped_column(String(500))
    old_value: Mapped[dict | None] = mapped_column(JSON)
    new_value: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = _ts()

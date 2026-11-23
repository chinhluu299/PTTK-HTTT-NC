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
    """Bệnh nhân: tài khoản đăng nhập bằng SĐT để hỏi trợ lý AI, đặt lịch, xem kết quả khám."""
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True)  # SĐT, dùng làm tên đăng nhập
    password_hash: Mapped[str] = mapped_column(String(100))  # mật khẩu đã băm
    full_name: Mapped[str] = mapped_column(String(100))  # họ tên
    birth_year: Mapped[int] = mapped_column(Integer)  # năm sinh (suy ra nhóm tuổi cho trợ lý AI)
    gender: Mapped[str] = mapped_column(String(10))  # NAM | NU
    # Không bắt buộc
    email: Mapped[str | None] = mapped_column(String(120))  # để nhận email xác nhận / nhắc tái khám
    address: Mapped[str | None] = mapped_column(String(255))  # địa chỉ
    relative_name: Mapped[str | None] = mapped_column(String(100))  # tên người thân liên hệ
    relative_phone: Mapped[str | None] = mapped_column(String(15))  # SĐT người thân
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)  # quản trị viên khóa thì không đăng nhập được
    created_at: Mapped[datetime] = _ts()  # thời điểm đăng ký


class Staff(Base):
    """Nhân viên phòng khám (bác sĩ, kỹ thuật viên, dược sĩ, quản trị viên), đăng nhập trang nội bộ."""
    __tablename__ = "staff"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    username: Mapped[str] = mapped_column(String(50), unique=True)  # tên đăng nhập
    password_hash: Mapped[str] = mapped_column(String(100))  # mật khẩu đã băm
    full_name: Mapped[str] = mapped_column(String(100))  # họ tên
    role: Mapped[str] = mapped_column(String(20))  # DOCTOR | TECHNICIAN | PHARMACIST | ADMIN
    specialty_id: Mapped[int | None] = mapped_column(ForeignKey("specialties.id"))  # chuyên khoa (chỉ bác sĩ)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))  # phòng cận lâm sàng (chỉ KTV)
    room: Mapped[str | None] = mapped_column(String(50))  # phòng khám của bác sĩ
    email: Mapped[str | None] = mapped_column(String(120))  # email liên hệ
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # False = đã nghỉ việc / bị vô hiệu hóa
    created_at: Mapped[datetime] = _ts()  # thời điểm tạo tài khoản

    specialty: Mapped["Specialty | None"] = relationship()  # chuyên khoa của bác sĩ
    department: Mapped["Department | None"] = relationship()  # phòng của KTV


# ───────────────────────── Danh mục ─────────────────────────

class Specialty(Base):
    """Chuyên khoa khám. Trợ lý AI chỉ được chọn trong danh sách này; bệnh nhân đặt lịch theo chuyên khoa."""
    __tablename__ = "specialties"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    name: Mapped[str] = mapped_column(String(100), unique=True)  # tên chuyên khoa (LLM phải trả đúng tên này)
    description: Mapped[str | None] = mapped_column(Text)  # mô tả triệu chứng thường gặp, hiện khi chọn khoa
    is_general: Mapped[bool] = mapped_column(Boolean, default=False)  # Nội tổng quát (QĐ07)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # False = ngừng nhận khám, ẩn khỏi danh mục


class Department(Base):
    """Phòng cận lâm sàng (X-quang, Xét nghiệm, Siêu âm…), nơi kỹ thuật viên thực hiện chỉ định."""
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    name: Mapped[str] = mapped_column(String(100), unique=True)  # tên phòng
    room: Mapped[str | None] = mapped_column(String(50))  # số phòng, vd "P.105"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # đang hoạt động


class LabService(Base):
    """Dịch vụ cận lâm sàng bác sĩ có thể chỉ định (xét nghiệm máu, chụp X-quang…), kèm giá."""
    __tablename__ = "lab_services"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    name: Mapped[str] = mapped_column(String(150))  # tên dịch vụ
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))  # phòng thực hiện
    price: Mapped[int] = mapped_column(Integer)  # đơn giá (đ)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # còn cung cấp

    department: Mapped[Department] = relationship()  # phòng thực hiện


class Medicine(Base):
    """Danh mục thuốc của nhà thuốc phòng khám, dùng khi kê đơn và tính tiền."""
    __tablename__ = "medicines"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    name: Mapped[str] = mapped_column(String(150))          # tên thương mại, vd "Panadol 500mg"
    strength: Mapped[str] = mapped_column(String(50))       # hàm lượng hiển thị, vd "500mg"
    dosage_form: Mapped[str] = mapped_column(String(50))    # dạng bào chế, vd "Viên nén"
    unit: Mapped[str] = mapped_column(String(20))           # đơn vị tính, vd "viên"
    unit_price: Mapped[int] = mapped_column(Integer)        # đơn giá theo đơn vị tính (đ)
    max_daily_quantity: Mapped[float | None] = mapped_column(Float)  # liều tối đa/ngày tính theo đơn vị của mặt hàng
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # còn được kê

    ingredients: Mapped[list["MedicineIngredient"]] = relationship(
        back_populates="medicine", cascade="all, delete-orphan")  # các hoạt chất trong thuốc


class ActiveIngredient(Base):
    """Hoạt chất (Paracetamol, Ibuprofen…), dùng để cảnh báo trùng hoạt chất và quá liều khi kê đơn."""
    __tablename__ = "active_ingredients"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    name: Mapped[str] = mapped_column(String(100), unique=True)  # tên hoạt chất
    max_daily_dose: Mapped[float | None] = mapped_column(Float)  # tổng liều tối đa/ngày của hoạt chất
    dose_unit: Mapped[str] = mapped_column(String(10), default="mg")  # đơn vị liều


class MedicineIngredient(Base):
    """Bảng nối thuốc – hoạt chất (nhiều-nhiều), kèm hàm lượng từng hoạt chất trong thuốc."""
    __tablename__ = "medicine_ingredients"
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicines.id", ondelete="CASCADE"), primary_key=True)  # thuốc
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("active_ingredients.id"), primary_key=True)  # hoạt chất
    amount: Mapped[float] = mapped_column(Float)  # hàm lượng hoạt chất trong 1 đơn vị thuốc (mg)

    medicine: Mapped[Medicine] = relationship(back_populates="ingredients")  # đối tượng thuốc
    ingredient: Mapped[ActiveIngredient] = relationship()  # đối tượng hoạt chất


class DiseaseKnowledge(Base):
    """Kho tri thức bệnh (nạp từ ViMedical_Disease): nguồn RAG cho trợ lý AI, bác sĩ chọn khi ghi chẩn đoán."""
    __tablename__ = "disease_knowledge_base"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    name: Mapped[str] = mapped_column(String(200))  # tên bệnh
    symptoms: Mapped[str] = mapped_column(Text)  # mô tả triệu chứng, được vector hóa cho RAG
    specialty_hint: Mapped[str | None] = mapped_column(String(100))  # chuyên khoa gợi ý, gán tự động theo tên bệnh
    source: Mapped[str] = mapped_column(String(50), default="ViMedical_Disease")  # nguồn dữ liệu


class SystemSetting(Base):
    """Tham số hệ thống do quản trị viên cấu hình (tiền cọc, phí khám, tài khoản ngân hàng nhận tiền…)."""
    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(50), primary_key=True)  # mã tham số, vd "deposit_amount"
    value: Mapped[str] = mapped_column(String(255))  # giá trị (lưu dạng chuỗi)
    label: Mapped[str] = mapped_column(String(150), default="")  # tên hiển thị trên trang quản trị


# ───────────────────────── Lịch & tiền ─────────────────────────

class StaffLeave(Base):
    """Lịch nghỉ của nhân viên theo buổi: ẩn giờ trống của bác sĩ, phát hiện lịch hẹn trùng ngày nghỉ."""
    __tablename__ = "staff_leaves"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id"))  # nhân viên nghỉ
    date: Mapped[date] = mapped_column(Date, index=True)  # ngày nghỉ
    session: Mapped[str] = mapped_column(String(15))  # MORNING | AFTERNOON | FULL_DAY
    reason: Mapped[str | None] = mapped_column(String(255))  # lý do nghỉ
    created_at: Mapped[datetime] = _ts()  # thời điểm đăng ký nghỉ

    staff: Mapped[Staff] = relationship()  # nhân viên nghỉ


class Appointment(Base):
    """Lịch hẹn khám, trung tâm của quy trình: giữ chỗ → đặt cọc → check-in → khám → thanh toán."""
    __tablename__ = "appointments"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)  # mã lịch hẹn, dùng check-in ở kiosk
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)  # bệnh nhân đặt
    doctor_id: Mapped[int] = mapped_column(ForeignKey("staff.id"), index=True)  # bác sĩ khám
    specialty_id: Mapped[int] = mapped_column(ForeignKey("specialties.id"))  # chuyên khoa khám
    date: Mapped[date] = mapped_column(Date, index=True)  # ngày khám
    slot: Mapped[str] = mapped_column(String(5))  # giờ khám "HH:MM", khung 30 phút
    # HOLD | CONFIRMED | CHECKED_IN | IN_CONSULTATION | WAITING_LAB | COMPLETED | PAID | CANCELLED | EXPIRED | NO_SHOW
    status: Mapped[str] = mapped_column(String(20), index=True)  # trạng thái lịch hẹn
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # hạn giữ chỗ chờ đặt cọc
    triage_session_id: Mapped[str | None] = mapped_column(ForeignKey("ai_triage_sessions.id"))  # phiên AI đã gợi ý khoa
    urgency: Mapped[str | None] = mapped_column(String(15))  # mức độ khẩn lấy từ phiên AI
    is_general: Mapped[bool] = mapped_column(Boolean, default=False)  # Khám tổng quát, bỏ qua AI (QĐ07)
    deposit_amount: Mapped[int] = mapped_column(Integer)  # tiền cọc (đ), chốt lúc đặt
    consultation_fee: Mapped[int] = mapped_column(Integer)  # phí khám (đ), chốt lúc đặt
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # thời điểm check-in
    # Bác sĩ nghỉ đột xuất (F2): chờ bệnh nhân chọn bác sĩ thay thế / đổi giờ / hoàn cọc
    leave_conflict: Mapped[bool] = mapped_column(Boolean, default=False)  # True = bác sĩ nghỉ trùng lịch này
    leave_suggested_doctor_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"))  # bác sĩ thay thế đề xuất
    created_at: Mapped[datetime] = _ts()  # thời điểm đặt lịch
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())  # lần cập nhật cuối

    patient: Mapped[Patient] = relationship()  # bệnh nhân
    doctor: Mapped[Staff] = relationship(foreign_keys=[doctor_id])  # bác sĩ khám
    suggested_doctor: Mapped[Staff | None] = relationship(foreign_keys=[leave_suggested_doctor_id])  # bác sĩ thay thế
    specialty: Mapped[Specialty] = relationship()  # chuyên khoa
    triage: Mapped["TriageSession | None"] = relationship()  # phiên trợ lý AI
    payments: Mapped[list["Payment"]] = relationship(back_populates="appointment", order_by="Payment.id")  # các giao dịch
    record: Mapped["MedicalRecord | None"] = relationship(back_populates="appointment", uselist=False)  # hồ sơ khám (1-1)
    lab_orders: Mapped[list["LabOrder"]] = relationship(back_populates="appointment", order_by="LabOrder.id")  # chỉ định CLS
    prescription: Mapped["Prescription | None"] = relationship(back_populates="appointment", uselist=False)  # đơn thuốc (1-1)
    queue_ticket: Mapped["PharmacyQueue | None"] = relationship(back_populates="appointment", uselist=False)  # số chờ quầy dược


class Payment(Base):
    """Giao dịch tiền của lịch hẹn: cọc online (PayOS) và thanh toán cuối tại quầy, cả hoàn cọc."""
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    appointment_id: Mapped[int | None] = mapped_column(ForeignKey("appointments.id"), index=True)  # lịch hẹn
    kind: Mapped[str] = mapped_column(String(15))     # DEPOSIT | FINAL
    amount: Mapped[int] = mapped_column(Integer)      # số tiền (đ)
    method: Mapped[str] = mapped_column(String(15))   # PAYOS (cọc online) | VIETQR | CASH (tại quầy)
    gateway: Mapped[str | None] = mapped_column(String(20))  # cổng thanh toán, vd "PAYOS"
    # Mã đơn của cổng ("PAYOS:<orderCode>") – ràng buộc duy nhất để webhook idempotent
    gateway_txn_id: Mapped[str | None] = mapped_column(String(64), unique=True)  # mã giao dịch phía cổng
    # PENDING | SUCCESS | CANCELLED | REFUND_PENDING | REFUNDED | UNMATCHED | AMOUNT_MISMATCH
    status: Mapped[str] = mapped_column(String(20))  # trạng thái giao dịch
    content: Mapped[str | None] = mapped_column(String(255))  # nội dung chuyển khoản
    note: Mapped[str | None] = mapped_column(String(255))  # ghi chú (vd lý do hoàn cọc)
    raw_payload: Mapped[dict | None] = mapped_column(JSON)  # dữ liệu gốc từ cổng, để đối soát
    created_at: Mapped[datetime] = _ts()  # thời điểm tạo giao dịch

    appointment: Mapped[Appointment | None] = relationship(back_populates="payments")  # lịch hẹn


# ───────────────────────── Khám ─────────────────────────

class TriageSession(Base):
    """Phiên trò chuyện với trợ lý AI tư vấn chuyên khoa (F1): luật cứng → RAG → LLM."""
    __tablename__ = "ai_triage_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID phiên
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"), index=True)  # None nếu chưa đăng nhập
    messages: Mapped[list] = mapped_column(JSON, default=list)      # toàn bộ hội thoại [{role, text, kind, ...}]
    vitals: Mapped[dict] = mapped_column(JSON, default=dict)        # chỉ số tách được (Lớp 1)
    red_flags: Mapped[list] = mapped_column(JSON, default=list)     # dấu hiệu đỏ khớp (Lớp 1)
    rag_context: Mapped[list] = mapped_column(JSON, default=list)   # 5 bệnh gần nhất (Lớp 2)
    result: Mapped[dict | None] = mapped_column(JSON)              # JSON đã qua kiểm tra (Lớp 3)
    pending: Mapped[dict | None] = mapped_column(JSON)             # câu hỏi đang chờ trả lời
    urgency: Mapped[str | None] = mapped_column(String(15))       # CAP_CUU | KHAM_SOM | BINH_THUONG
    specialty_id: Mapped[int | None] = mapped_column(ForeignKey("specialties.id"))  # chuyên khoa AI gợi ý
    state: Mapped[str] = mapped_column(String(15), default="ACTIVE")  # ACTIVE | DONE | EMERGENCY
    emergency_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)  # đã xác nhận đọc cảnh báo cấp cứu
    clarify_count: Mapped[int] = mapped_column(Integer, default=0)  # số câu hỏi làm rõ đã hỏi (tối đa 2)
    age_group: Mapped[str | None] = mapped_column(String(20))  # nhóm tuổi, vd "16–40 tuổi"
    gender: Mapped[str | None] = mapped_column(String(10))  # NAM | NU
    provider: Mapped[str | None] = mapped_column(String(20))  # nguồn kết quả: rules | llm | offline | fallback
    # Đánh giá của bác sĩ khi chốt ca (human-in-the-loop)
    doctor_feedback_correct: Mapped[bool | None] = mapped_column(Boolean)  # AI gợi ý đúng khoa? (None = chưa đánh giá)
    doctor_feedback_specialty_id: Mapped[int | None] = mapped_column(ForeignKey("specialties.id"))  # khoa đúng khi AI sai
    created_at: Mapped[datetime] = _ts()  # thời điểm mở phiên
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())  # lần cập nhật cuối

    specialty: Mapped[Specialty | None] = relationship(foreign_keys=[specialty_id])  # chuyên khoa AI gợi ý


class MedicalRecord(Base):
    """Hồ sơ khám của một lịch hẹn: khám lâm sàng, chẩn đoán, lời dặn, hẹn tái khám."""
    __tablename__ = "medical_records"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), unique=True)  # lịch hẹn (1-1)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)  # bệnh nhân
    doctor_id: Mapped[int] = mapped_column(ForeignKey("staff.id"))  # bác sĩ khám
    clinical_notes: Mapped[str | None] = mapped_column(Text)   # khám lâm sàng
    diagnosis: Mapped[str | None] = mapped_column(Text)  # chẩn đoán (văn bản)
    diagnosis_kb_id: Mapped[int | None] = mapped_column(ForeignKey("disease_knowledge_base.id"))  # bệnh chọn từ kho tri thức
    advice: Mapped[str | None] = mapped_column(Text)            # lời dặn
    follow_up_date: Mapped[date | None] = mapped_column(Date)  # ngày hẹn tái khám
    follow_up_reminded: Mapped[bool] = mapped_column(Boolean, default=False)  # đã gửi email nhắc tái khám
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)  # đã chốt ca, không sửa trực tiếp
    is_amended: Mapped[bool] = mapped_column(Boolean, default=False)  # đã sửa sau khi chốt (có ghi audit log)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # thời điểm chốt
    created_at: Mapped[datetime] = _ts()  # thời điểm tạo

    appointment: Mapped[Appointment] = relationship(back_populates="record")  # lịch hẹn


class LabOrder(Base):
    """Chỉ định cận lâm sàng bác sĩ gửi sang phòng kỹ thuật (xét nghiệm, X-quang…)."""
    __tablename__ = "lab_orders"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), index=True)  # lịch hẹn
    service_id: Mapped[int] = mapped_column(ForeignKey("lab_services.id"))  # dịch vụ được chỉ định
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), index=True)  # phòng thực hiện
    ordered_by: Mapped[int] = mapped_column(ForeignKey("staff.id"))  # bác sĩ chỉ định
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"))  # KTV nhận thực hiện
    status: Mapped[str] = mapped_column(String(15), default="ORDERED")  # ORDERED | IN_PROGRESS | DONE | CANCELLED
    price: Mapped[int] = mapped_column(Integer)  # giá (đ), chốt lúc chỉ định
    doctor_note: Mapped[str | None] = mapped_column(String(500))  # ghi chú của bác sĩ cho KTV
    cancel_reason: Mapped[str | None] = mapped_column(String(255))  # lý do hủy
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # lúc KTV nhận làm
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # lúc trả kết quả
    created_at: Mapped[datetime] = _ts()  # lúc chỉ định

    appointment: Mapped[Appointment] = relationship(back_populates="lab_orders")  # lịch hẹn
    service: Mapped[LabService] = relationship()  # dịch vụ
    department: Mapped[Department] = relationship()  # phòng thực hiện
    technician: Mapped[Staff | None] = relationship(foreign_keys=[technician_id])  # KTV thực hiện
    result: Mapped["LabResult | None"] = relationship(back_populates="order", uselist=False)  # kết quả (1-1)


class LabResult(Base):
    """Kết quả cận lâm sàng do KTV tải lên (file ảnh/PDF + nhận xét)."""
    __tablename__ = "lab_results"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    lab_order_id: Mapped[int] = mapped_column(ForeignKey("lab_orders.id"), unique=True)  # chỉ định tương ứng (1-1)
    files: Mapped[list] = mapped_column(JSON, default=list)  # [{url, name, type}] – URL Cloudinary
    note: Mapped[str | None] = mapped_column(Text)            # nhận xét của kỹ thuật viên
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)  # đã trả kết quả, khóa sửa trực tiếp
    is_amended: Mapped[bool] = mapped_column(Boolean, default=False)  # đã sửa sau khi khóa (có ghi audit log)
    created_at: Mapped[datetime] = _ts()  # thời điểm tạo

    order: Mapped[LabOrder] = relationship(back_populates="result")  # chỉ định


class Prescription(Base):
    """Đơn thuốc của một lịch hẹn, kèm cảnh báo trùng hoạt chất / quá liều."""
    __tablename__ = "prescriptions"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), unique=True)  # lịch hẹn (1-1)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("staff.id"))  # bác sĩ kê đơn
    total_amount: Mapped[int] = mapped_column(Integer, default=0)  # tổng tiền thuốc (đ)
    warnings: Mapped[list] = mapped_column(JSON, default=list)  # cảnh báo DUPLICATE / OVERDOSE lúc kê
    duplicate_ack: Mapped[bool] = mapped_column(Boolean, default=False)  # bác sĩ đã xác nhận cảnh báo trùng hoạt chất
    overdose_reason: Mapped[str | None] = mapped_column(String(500))  # lý do vượt cảnh báo
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)  # khóa cùng hồ sơ khám khi chốt ca
    created_at: Mapped[datetime] = _ts()  # thời điểm kê

    appointment: Mapped[Appointment] = relationship(back_populates="prescription")  # lịch hẹn
    details: Mapped[list["PrescriptionDetail"]] = relationship(
        back_populates="prescription", cascade="all, delete-orphan", order_by="PrescriptionDetail.id")  # các dòng thuốc


class PrescriptionDetail(Base):
    """Một dòng thuốc trong đơn: liều, số lần/ngày, số ngày, thành tiền."""
    __tablename__ = "prescription_details"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    prescription_id: Mapped[int] = mapped_column(ForeignKey("prescriptions.id", ondelete="CASCADE"))  # đơn thuốc
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicines.id"))  # thuốc
    dose_per_time: Mapped[float] = mapped_column(Float)  # liều mỗi lần (theo đơn vị tính của thuốc)
    times_per_day: Mapped[int] = mapped_column(Integer)  # số lần/ngày
    days: Mapped[int] = mapped_column(Integer)  # số ngày dùng
    timing: Mapped[str] = mapped_column(String(15))  # SAU_AN | TRUOC_AN | TRONG_AN | KHONG_PHU_THUOC
    quantity: Mapped[int] = mapped_column(Integer)  # tổng số lượng = liều × lần × ngày (làm tròn lên)
    unit_price: Mapped[int] = mapped_column(Integer)  # đơn giá lúc kê (đ)
    amount: Mapped[int] = mapped_column(Integer)  # thành tiền (đ)
    note: Mapped[str | None] = mapped_column(String(255))  # ghi chú cách dùng

    prescription: Mapped[Prescription] = relationship(back_populates="details")  # đơn thuốc
    medicine: Mapped[Medicine] = relationship()  # thuốc


# ───────────────────────── Vận hành ─────────────────────────

class PharmacyQueue(Base):
    """Số thứ tự chờ tại quầy dược (thu tiền + phát thuốc) sau khi khám xong, gọi số lên màn hình."""
    __tablename__ = "pharmacy_queue"
    __table_args__ = (UniqueConstraint("queue_date", "number"),)  # số thứ tự không trùng trong ngày
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), unique=True)  # lịch hẹn (1-1)
    queue_date: Mapped[date] = mapped_column(Date, index=True)  # ngày xếp hàng
    number: Mapped[int] = mapped_column(Integer)  # số thứ tự hiển thị
    position: Mapped[int] = mapped_column(Integer)   # thứ tự trong hàng (vắng 3 lần -> chuyển cuối)
    status: Mapped[str] = mapped_column(String(15), default="WAITING")  # WAITING | CALLED | SERVED
    call_count: Mapped[int] = mapped_column(Integer, default=0)  # số lần đã gọi trong lượt hiện tại
    skip_count: Mapped[int] = mapped_column(Integer, default=0)  # số lần bị chuyển xuống cuối vì vắng
    last_called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # lần gọi gần nhất
    created_at: Mapped[datetime] = _ts()  # lúc lấy số

    appointment: Mapped[Appointment] = relationship(back_populates="queue_ticket")  # lịch hẹn


class AuditLog(Base):
    """Nhật ký thay đổi (đổi trạng thái, sửa hồ sơ…): ai làm, lúc nào, giá trị cũ/mới."""
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)  # khóa chính
    entity_type: Mapped[str] = mapped_column(String(30), index=True)  # APPOINTMENT | LAB_ORDER | MEDICAL_RECORD | LAB_RESULT ...
    entity_id: Mapped[str] = mapped_column(String(40), index=True)  # id của đối tượng bị thay đổi
    action: Mapped[str] = mapped_column(String(30))                  # STATUS_CHANGE | AMEND | ...
    from_status: Mapped[str | None] = mapped_column(String(20))  # trạng thái trước
    to_status: Mapped[str | None] = mapped_column(String(20))  # trạng thái sau
    actor_type: Mapped[str] = mapped_column(String(15))              # PATIENT | DOCTOR | ... | SYSTEM | GATEWAY | KIOSK
    actor_id: Mapped[int | None] = mapped_column(Integer)  # id người thực hiện
    actor_name: Mapped[str | None] = mapped_column(String(100))  # tên người thực hiện
    reason: Mapped[str | None] = mapped_column(String(500))  # lý do (vd lý do hủy lịch, sửa hồ sơ)
    old_value: Mapped[dict | None] = mapped_column(JSON)  # dữ liệu trước khi sửa
    new_value: Mapped[dict | None] = mapped_column(JSON)  # dữ liệu sau khi sửa
    created_at: Mapped[datetime] = _ts()  # thời điểm ghi nhận

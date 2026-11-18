"""F3 – Máy trạng thái lịch hẹn / ca khám và nhật ký chỉnh sửa (audit trail).

Mọi bước chuyển trạng thái đi qua hàm transition(): kiểm tra (trạng thái hiện tại, tác nhân) có hợp lệ
không, rồi ghi AUDIT_LOGS. Quyền sở hữu hồ sơ được kiểm tra ở router trước khi gọi hàm này.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Appointment, AuditLog, LabOrder

STATUS_LABEL = {
    "HOLD": "Đang giữ chỗ",
    "CONFIRMED": "Đã đặt cọc",
    "CHECKED_IN": "Đã check-in",
    "IN_CONSULTATION": "Đang khám",
    "WAITING_LAB": "Chờ cận lâm sàng",
    "COMPLETED": "Đã chốt ca",
    "PAID": "Đã thanh toán",
    "EXPIRED": "Hết hạn giữ chỗ",
    "CANCELLED": "Đã hủy",
    "NO_SHOW": "Vắng mặt",
}

# (từ, đến) -> các tác nhân được phép
APPOINTMENT_TRANSITIONS: dict[tuple[str, str], set[str]] = {
    ("HOLD", "CONFIRMED"): {"GATEWAY"},
    ("HOLD", "EXPIRED"): {"SYSTEM", "GATEWAY"},
    ("HOLD", "CANCELLED"): {"PATIENT"},
    ("EXPIRED", "CONFIRMED"): {"GATEWAY"},          # tiền về muộn nhưng khung giờ còn chỗ
    ("CONFIRMED", "CHECKED_IN"): {"KIOSK"},
    ("CONFIRMED", "CANCELLED"): {"PATIENT"},
    ("CONFIRMED", "NO_SHOW"): {"SYSTEM", "PATIENT"},  # trễ 15 phút / hủy muộn (QĐ05)
    ("CHECKED_IN", "IN_CONSULTATION"): {"DOCTOR"},
    ("IN_CONSULTATION", "WAITING_LAB"): {"DOCTOR"},
    ("WAITING_LAB", "IN_CONSULTATION"): {"SYSTEM"},  # mọi phiếu CLS đã xong
    ("IN_CONSULTATION", "COMPLETED"): {"DOCTOR"},
    ("COMPLETED", "PAID"): {"PHARMACIST"},
}

LAB_TRANSITIONS: dict[tuple[str, str], set[str]] = {
    ("ORDERED", "IN_PROGRESS"): {"TECHNICIAN"},
    ("IN_PROGRESS", "DONE"): {"TECHNICIAN"},
    ("ORDERED", "CANCELLED"): {"DOCTOR"},
    ("IN_PROGRESS", "CANCELLED"): {"DOCTOR"},
}

ACTIVE_STATUSES = ("HOLD", "CONFIRMED", "CHECKED_IN", "IN_CONSULTATION", "WAITING_LAB", "COMPLETED", "PAID")


def audit(db: Session, entity_type: str, entity_id, action: str, actor_type: str, actor_id=None,
          actor_name=None, from_status=None, to_status=None, reason=None, old_value=None, new_value=None):
    db.add(AuditLog(
        entity_type=entity_type, entity_id=str(entity_id), action=action, actor_type=actor_type,
        actor_id=actor_id, actor_name=actor_name, from_status=from_status, to_status=to_status,
        reason=reason, old_value=old_value, new_value=new_value,
    ))


def transition(db: Session, appt: Appointment, to: str, actor_type: str, actor_id=None, actor_name=None,
               reason=None):
    key = (appt.status, to)
    allowed = APPOINTMENT_TRANSITIONS.get(key)
    if allowed is None:
        raise HTTPException(409, f"Không thể chuyển ca từ \"{STATUS_LABEL.get(appt.status, appt.status)}\" "
                                 f"sang \"{STATUS_LABEL.get(to, to)}\"")
    if actor_type not in allowed:
        raise HTTPException(403, "Bạn không được phép thực hiện bước chuyển trạng thái này")
    old = appt.status
    appt.status = to
    audit(db, "APPOINTMENT", appt.id, "STATUS_CHANGE", actor_type, actor_id, actor_name,
          from_status=old, to_status=to, reason=reason)


def lab_transition(db: Session, order: LabOrder, to: str, actor_type: str, actor_id=None, actor_name=None,
                   reason=None):
    key = (order.status, to)
    allowed = LAB_TRANSITIONS.get(key)
    if allowed is None:
        raise HTTPException(409, "Phiếu đã ở trạng thái khác, vui lòng tải lại")
    if actor_type not in allowed:
        raise HTTPException(403, "Bạn không được phép thực hiện thao tác này với phiếu CLS")
    old = order.status
    order.status = to
    audit(db, "LAB_ORDER", order.id, "STATUS_CHANGE", actor_type, actor_id, actor_name,
          from_status=old, to_status=to, reason=reason)

"""Tạo lại toàn bộ CSDL và nạp dữ liệu mẫu.  Chạy:  python seed.py

Tài khoản mẫu (mật khẩu đều là 123456):
  Bệnh nhân   0901234567 (Nguyễn Văn Hùng)
  Bác sĩ      bs.an (Nội tổng quát), bs.cuong (Tim mạch), bs.giang / bs.hai (Da liễu) ...
  KTV         ktv.xquang, ktv.xquang2, ktv.xetnghiem, ktv.sieuam
  Dược sĩ     duocsi
  Quản trị    admin
"""
import random
import uuid
from datetime import datetime, time, timedelta

from app.db import Base, SessionLocal, engine
from app.models import (ActiveIngredient, Appointment, Department, DiseaseKnowledge, LabOrder, LabResult, LabService,
                        MedicalRecord, Medicine, MedicineIngredient, Patient, Payment, PharmacyQueue, Prescription,
                        PrescriptionDetail, Specialty, Staff, SystemSetting, TriageSession)
from app.security import hash_password
from app.state import audit
from app.triage.kb_loader import load_csv
from app.utils import SLOTS, TZ, gen_code, is_working_day, now, today, working_days

random.seed(2026)
PW = hash_password("123456")

SETTINGS = [
    ("clinic_name", "Phòng khám Đa khoa MedCare", "Tên phòng khám"),
    ("hotline", "1900 1234", "Hotline phòng khám"),
    ("address", "Số 12 Đường số 7, Phường An Lạc, TP. Hồ Chí Minh", "Địa chỉ"),
    ("deposit_amount", "100000", "Tiền cọc mỗi lịch hẹn (đ)"),
    ("consultation_fee", "150000", "Phí khám (đ)"),
    ("bank_bin", "970422", "Mã BIN ngân hàng nhận (VietQR)"),
    ("bank_name", "MB Bank", "Tên ngân hàng"),
    ("bank_account", "0000123456789", "Số tài khoản nhận"),
    ("bank_account_name", "PHONG KHAM MEDCARE", "Tên chủ tài khoản"),
]

SPECIALTIES = [
    ("Nội tổng quát", "Khám sức khỏe tổng quát, sốt, mệt mỏi và các bệnh nội khoa thường gặp", True),
    ("Tim mạch", "Đau ngực, hồi hộp, tăng huyết áp, rối loạn nhịp tim", False),
    ("Tiêu hóa", "Đau bụng, ợ chua, tiêu chảy, táo bón, bệnh gan mật", False),
    ("Hô hấp", "Ho kéo dài, khó thở, hen, viêm phổi", False),
    ("Thần kinh", "Đau đầu, chóng mặt, tê bì, mất ngủ", False),
    ("Da liễu", "Mẩn ngứa, mề đay, mụn, nấm da, bệnh da dị ứng", False),
    ("Tai Mũi Họng", "Đau họng, viêm xoang, ù tai, nghẹt mũi", False),
    ("Cơ xương khớp", "Đau khớp, đau lưng, thoái hóa, gout", False),
    ("Nội tiết", "Tiểu đường, tuyến giáp, rối loạn nội tiết", False),
    ("Thận – Tiết niệu", "Tiểu buốt, tiểu rắt, sỏi thận, bệnh nam khoa", False),
    ("Sản phụ khoa", "Khám phụ khoa, kinh nguyệt, thai kỳ", False),
    ("Mắt", "Đau mắt, đỏ mắt, giảm thị lực", False),
]

DOCTORS = [
    ("bs.an", "BS.CKI Trần Minh An", "Nội tổng quát", "P.101"),
    ("bs.binh", "BS. Lê Thị Bình", "Nội tổng quát", "P.102"),
    ("bs.cuong", "ThS.BS Phạm Quốc Cường", "Tim mạch", "P.201"),
    ("bs.dung", "BS.CKII Ngô Thị Dung", "Tim mạch", "P.202"),
    ("bs.giang", "BS. Hoàng Thu Giang", "Da liễu", "P.203"),
    ("bs.hai", "BS.CKI Đỗ Văn Hải", "Da liễu", "P.204"),
    ("bs.khoa", "BS. Vũ Đăng Khoa", "Tiêu hóa", "P.205"),
    ("bs.lan", "BS. Phan Ngọc Lan", "Hô hấp", "P.206"),
    ("bs.minh", "TS.BS Bùi Đức Minh", "Thần kinh", "P.301"),
    ("bs.nga", "BS. Trịnh Thị Nga", "Tai Mũi Họng", "P.302"),
    ("bs.phuc", "BS.CKI Mai Hồng Phúc", "Cơ xương khớp", "P.303"),
    ("bs.quynh", "BS. Đặng Như Quỳnh", "Nội tiết", "P.304"),
    ("bs.son", "BS. Lý Thanh Sơn", "Thận – Tiết niệu", "P.305"),
    ("bs.thao", "BS.CKI Cao Phương Thảo", "Sản phụ khoa", "P.306"),
    ("bs.uyen", "BS. Tạ Bảo Uyên", "Mắt", "P.307"),
]

DEPARTMENTS = [("Phòng X-quang", "P.105"), ("Phòng Xét nghiệm", "P.106"), ("Phòng Siêu âm – Điện tim", "P.107")]
TECHS = [("ktv.xquang", "KTV. Nguyễn Hữu Tài", "Phòng X-quang"), ("ktv.xquang2", "KTV. Lâm Gia Huy", "Phòng X-quang"),
         ("ktv.xetnghiem", "KTV. Trương Mỹ Linh", "Phòng Xét nghiệm"),
         ("ktv.sieuam", "KTV. Hồ Quang Vinh", "Phòng Siêu âm – Điện tim")]

LAB_SERVICES = [
    ("X-quang ngực thẳng", "Phòng X-quang", 120000), ("X-quang cột sống thắt lưng", "Phòng X-quang", 150000),
    ("X-quang khớp gối", "Phòng X-quang", 130000), ("Công thức máu toàn phần", "Phòng Xét nghiệm", 90000),
    ("Đường huyết lúc đói", "Phòng Xét nghiệm", 40000), ("Mỡ máu (Cholesterol, Triglycerid, HDL, LDL)", "Phòng Xét nghiệm", 160000),
    ("Chức năng gan (AST, ALT)", "Phòng Xét nghiệm", 80000), ("Chức năng thận (Ure, Creatinin)", "Phòng Xét nghiệm", 80000),
    ("Tổng phân tích nước tiểu", "Phòng Xét nghiệm", 60000), ("Siêu âm ổ bụng tổng quát", "Phòng Siêu âm – Điện tim", 200000),
    ("Siêu âm tuyến giáp", "Phòng Siêu âm – Điện tim", 180000), ("Điện tâm đồ (ECG)", "Phòng Siêu âm – Điện tim", 80000),
    ("Siêu âm tim", "Phòng Siêu âm – Điện tim", 350000),
]

INGREDIENTS = [("Paracetamol", 4000), ("Ibuprofen", 2400), ("Caffeine", 400), ("Amoxicillin", 3000),
               ("Acid clavulanic", 375), ("Cetirizine", 10), ("Loratadine", 10), ("Fexofenadine", 180),
               ("Omeprazole", 40), ("Esomeprazole", 40), ("Domperidone", 30), ("Amlodipine", 10), ("Losartan", 100),
               ("Metformin", 2550), ("Meloxicam", 15), ("Diclofenac", 150), ("Dextromethorphan", 120),
               ("Loperamide", 16), ("Diosmectite", 9000), ("Prednisolone", 60), ("Alverine", 240),
               ("Acetylcysteine", 600), ("Salbutamol", 16)]

# (tên, hàm lượng, dạng, đơn vị, đơn giá, tối đa đơn vị/ngày, [(hoạt chất, mg/đơn vị)])
MEDICINES = [
    ("Panadol 500mg", "500mg", "Viên nén", "viên", 1500, 8, [("Paracetamol", 500)]),
    ("Efferalgan 500mg", "500mg", "Viên sủi", "viên", 3500, 8, [("Paracetamol", 500)]),
    ("Hapacol 500", "500mg", "Viên nén", "viên", 800, 8, [("Paracetamol", 500)]),
    ("Hapacol 250", "250mg", "Gói bột sủi", "gói", 2500, 16, [("Paracetamol", 250)]),
    ("Panadol Extra", "500mg + 65mg", "Viên nén", "viên", 2000, 8, [("Paracetamol", 500), ("Caffeine", 65)]),
    ("Ibuprofen 400mg", "400mg", "Viên nén", "viên", 1200, 6, [("Ibuprofen", 400)]),
    ("Augmentin 625mg", "500mg + 125mg", "Viên nén bao phim", "viên", 15000, 3,
     [("Amoxicillin", 500), ("Acid clavulanic", 125)]),
    ("Amoxicillin 500mg", "500mg", "Viên nang", "viên", 1500, 6, [("Amoxicillin", 500)]),
    ("Cetirizine 10mg", "10mg", "Viên nén", "viên", 1000, 1, [("Cetirizine", 10)]),
    ("Clarityne 10mg", "10mg", "Viên nén", "viên", 6000, 1, [("Loratadine", 10)]),
    ("Telfast 180mg", "180mg", "Viên nén bao phim", "viên", 9000, 1, [("Fexofenadine", 180)]),
    ("Omeprazole 20mg", "20mg", "Viên nang", "viên", 1500, 2, [("Omeprazole", 20)]),
    ("Nexium 40mg", "40mg", "Viên nén bao phim", "viên", 22000, 1, [("Esomeprazole", 40)]),
    ("Motilium-M 10mg", "10mg", "Viên nén", "viên", 3000, 3, [("Domperidone", 10)]),
    ("Amlor 5mg", "5mg", "Viên nang", "viên", 8000, 2, [("Amlodipine", 5)]),
    ("Cozaar 50mg", "50mg", "Viên nén bao phim", "viên", 9500, 2, [("Losartan", 50)]),
    ("Glucophage 500mg", "500mg", "Viên nén bao phim", "viên", 2500, 5, [("Metformin", 500)]),
    ("Mobic 7.5mg", "7.5mg", "Viên nén", "viên", 7000, 2, [("Meloxicam", 7.5)]),
    ("Voltaren 50mg", "50mg", "Viên nén bao tan trong ruột", "viên", 3500, 3, [("Diclofenac", 50)]),
    ("Dextromethorphan 15mg", "15mg", "Viên nén", "viên", 600, 8, [("Dextromethorphan", 15)]),
    ("Imodium 2mg", "2mg", "Viên nang", "viên", 3000, 8, [("Loperamide", 2)]),
    ("Smecta 3g", "3g", "Gói bột", "gói", 4000, 3, [("Diosmectite", 3000)]),
    ("Prednisolone 5mg", "5mg", "Viên nén", "viên", 500, 12, [("Prednisolone", 5)]),
    ("Alverin 40mg", "40mg", "Viên nén", "viên", 800, 6, [("Alverine", 40)]),
    ("Acemuc 200mg", "200mg", "Gói bột", "gói", 2500, 3, [("Acetylcysteine", 200)]),
    ("Ventolin 2mg", "2mg", "Viên nén", "viên", 1000, 8, [("Salbutamol", 2)]),
]

DIAGNOSES = {
    "Nội tổng quát": ["Sốt siêu vi", "Viêm họng cấp", "Rối loạn tiêu hóa", "Suy nhược cơ thể"],
    "Tim mạch": ["Tăng huyết áp vô căn", "Rối loạn nhịp tim", "Đau thắt ngực ổn định"],
    "Tiêu hóa": ["Viêm dạ dày", "Trào ngược dạ dày thực quản", "Hội chứng ruột kích thích"],
    "Hô hấp": ["Viêm phế quản cấp", "Hen phế quản", "Viêm phổi"],
    "Thần kinh": ["Đau đầu căng cơ", "Đau nửa đầu Migraine", "Rối loạn tiền đình"],
    "Da liễu": ["Mề đay cấp", "Viêm da cơ địa", "Mụn trứng cá"],
    "Tai Mũi Họng": ["Viêm xoang cấp", "Viêm amidan", "Viêm tai giữa"],
    "Cơ xương khớp": ["Thoái hóa khớp gối", "Đau thắt lưng cơ học", "Gout cấp"],
    "Nội tiết": ["Đái tháo đường type 2", "Cường giáp", "Rối loạn lipid máu"],
    "Thận – Tiết niệu": ["Nhiễm khuẩn đường tiết niệu", "Sỏi thận"],
    "Sản phụ khoa": ["Viêm âm đạo", "Rối loạn kinh nguyệt"],
    "Mắt": ["Viêm kết mạc", "Tật khúc xạ"],
}
SYMPTOMS = {
    "Nội tổng quát": "sốt nhẹ, mệt mỏi, đau mỏi người 2 ngày",
    "Tim mạch": "hồi hộp, đánh trống ngực, hay mệt khi leo cầu thang",
    "Tiêu hóa": "đau bụng vùng thượng vị, ợ chua sau ăn",
    "Hô hấp": "ho có đờm kéo dài hơn 1 tuần",
    "Thần kinh": "đau đầu vùng thái dương, chóng mặt khi đứng dậy",
    "Da liễu": "nổi mẩn đỏ ngứa ở tay và cổ",
    "Tai Mũi Họng": "nghẹt mũi, chảy mũi vàng, đau vùng trán",
    "Cơ xương khớp": "đau khớp gối khi đi lại, cứng khớp buổi sáng",
    "Nội tiết": "khát nước nhiều, tiểu nhiều, sụt cân",
    "Thận – Tiết niệu": "tiểu buốt, tiểu rắt 3 ngày",
    "Sản phụ khoa": "kinh nguyệt không đều 3 tháng nay",
    "Mắt": "mắt đỏ, cộm, chảy nước mắt",
}
# Độ chính xác giả lập của AI theo chuyên khoa (để trang thống kê có số liệu)
AI_ACC = {"Nội tổng quát": 0.9, "Tim mạch": 0.88, "Tiêu hóa": 0.85, "Hô hấp": 0.86, "Thần kinh": 0.72,
          "Da liễu": 0.93, "Tai Mũi Họng": 0.9, "Cơ xương khớp": 0.87, "Nội tiết": 0.6, "Thận – Tiết niệu": 0.8,
          "Sản phụ khoa": 0.82, "Mắt": 0.95}
CONFUSE = {"Nội tiết": "Nội tổng quát", "Thần kinh": "Tim mạch", "Tiêu hóa": "Nội tổng quát",
           "Tim mạch": "Hô hấp", "Hô hấp": "Tai Mũi Họng"}

LAST = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương"]
MID_M, MID_F = ["Văn", "Hữu", "Đức", "Minh", "Quang", "Thành"], ["Thị", "Ngọc", "Thu", "Kim", "Mỹ", "Thanh"]
FIRST_M = ["Hùng", "Dũng", "Tuấn", "Phong", "Khang", "Long", "Hiếu", "Tâm", "Quân", "Bảo", "Thắng", "Lộc"]
FIRST_F = ["Lan", "Hương", "Trang", "Vy", "Nhi", "Thảo", "Linh", "Hà", "Yến", "Ngân", "Châu", "Hạnh"]


def at(d, slot_or_time, minutes=0):
    if isinstance(slot_or_time, str):
        h, m = map(int, slot_or_time.split(":"))
        t = time(h, m)
    else:
        t = slot_or_time
    return datetime.combine(d, t, tzinfo=TZ) + timedelta(minutes=minutes)


def main():
    print("Tạo lại bảng...")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()

    db.add_all(SystemSetting(key=k, value=v, label=l) for k, v, l in SETTINGS)
    specs = {}
    for name, desc, general in SPECIALTIES:
        specs[name] = Specialty(name=name, description=desc, is_general=general)
        db.add(specs[name])
    depts = {}
    for name, room in DEPARTMENTS:
        depts[name] = Department(name=name, room=room)
        db.add(depts[name])
    db.flush()

    doctors = {}
    for u, n, sp, room in DOCTORS:
        doctors[u] = Staff(username=u, password_hash=PW, full_name=n, role="DOCTOR", specialty_id=specs[sp].id, room=room,
                           email=f"{u.replace('.', '')}@medcare.local")
        db.add(doctors[u])
    techs = {}
    for u, n, dep in TECHS:
        techs[u] = Staff(username=u, password_hash=PW, full_name=n, role="TECHNICIAN", department_id=depts[dep].id)
        db.add(techs[u])
    pharm = Staff(username="duocsi", password_hash=PW, full_name="DS. Phạm Thanh Hà", role="PHARMACIST")
    db.add_all([pharm, Staff(username="admin", password_hash=PW, full_name="Quản trị hệ thống", role="ADMIN")])

    services = {}
    for name, dep, price in LAB_SERVICES:
        services[name] = LabService(name=name, department_id=depts[dep].id, price=price)
        db.add(services[name])
    ings = {}
    for name, mx in INGREDIENTS:
        ings[name] = ActiveIngredient(name=name, max_daily_dose=mx, dose_unit="mg")
        db.add(ings[name])
    db.flush()
    meds = {}
    for name, strength, form, unit, price, mxq, comp in MEDICINES:
        m = Medicine(name=name, strength=strength, dosage_form=form, unit=unit, unit_price=price, max_daily_quantity=mxq)
        for ing, amt in comp:
            m.ingredients.append(MedicineIngredient(ingredient_id=ings[ing].id, amount=amt))
        meds[name] = m
        db.add(m)

    print("Nạp ViMedical_Disease...")
    kb = load_csv()
    db.add_all(DiseaseKnowledge(name=r["name"], symptoms=r["symptoms"], specialty_hint=r["specialty_hint"]) for r in kb)
    db.flush()
    print(f"  {len(kb)} bệnh")

    # ── Bệnh nhân ──
    demo = Patient(phone="0901234567", password_hash=PW, full_name="Nguyễn Văn Hùng", birth_year=1968, gender="NAM",
                   email="hung.demo@example.com", address="Quận 5, TP. HCM")
    mai = Patient(phone="0912345678", password_hash=PW, full_name="Trần Thị Mai", birth_year=1990, gender="NU",
                  email="mai.demo@example.com")
    nam = Patient(phone="0987654321", password_hash=PW, full_name="Lê Hoàng Nam", birth_year=1985, gender="NAM")
    db.add_all([demo, mai, nam])
    crowd = []
    phones = set()
    for _ in range(60):
        g = random.choice(["NAM", "NU"])
        name = f"{random.choice(LAST)} {random.choice(MID_M if g == 'NAM' else MID_F)} " \
               f"{random.choice(FIRST_M if g == 'NAM' else FIRST_F)}"
        ph = "09" + "".join(random.choice("0123456789") for _ in range(8))
        while ph in phones or ph in ("0901234567", "0912345678", "0987654321"):
            ph = "09" + "".join(random.choice("0123456789") for _ in range(8))
        phones.add(ph)
        crowd.append(Patient(phone=ph, password_hash=PW, full_name=name, birth_year=random.randint(1950, 2010), gender=g))
    db.add_all(crowd)
    db.flush()

    doc_by_spec = {}
    for d in doctors.values():
        doc_by_spec.setdefault(d.specialty_id, []).append(d)
    spec_names = list(specs)
    weights = [16, 10, 9, 8, 7, 11, 9, 8, 5, 5, 6, 4]

    def triage_for(patient, spec_name, when, text=None, urgency="BINH_THUONG"):
        s = TriageSession(id=str(uuid.uuid4()), patient_id=patient.id, provider="offline", state="DONE",
                          age_group=None, gender=patient.gender, vitals={}, red_flags=[], rag_context=[],
                          urgency=urgency, specialty_id=specs[spec_name].id, created_at=when, updated_at=when)
        text = text or SYMPTOMS[spec_name]
        s.messages = [{"role": "user", "text": text, "kind": "text", "ts": when.isoformat()}]
        s.result = {"chuyen_khoa": spec_name, "muc_do": urgency,
                    "tom_tat": f"{'Nam' if patient.gender == 'NAM' else 'Nữ'} {now().year - patient.birth_year} tuổi, {text}",
                    "ly_do": f"Triệu chứng thường được khám tại chuyên khoa {spec_name}.", "can_hoi_them": [],
                    "nguon": "offline"}
        db.add(s)
        return s

    def make_appt(patient, doctor, d, slot, status, created, triage=None, urgency=None):
        a = Appointment(code=gen_code(), patient_id=patient.id, doctor_id=doctor.id, specialty_id=doctor.specialty_id,
                        date=d, slot=slot, status=status, hold_expires_at=created + timedelta(minutes=5),
                        triage_session_id=triage.id if triage else None, urgency=urgency or (triage.urgency if triage else None),
                        is_general=triage is None, deposit_amount=100000, consultation_fee=150000, created_at=created)
        db.add(a)
        db.flush()
        audit(db, "APPOINTMENT", a.id, "STATUS_CHANGE", "PATIENT", patient.id, patient.full_name, to_status="HOLD")
        return a

    def pay_deposit(a, when):
        db.add(Payment(appointment_id=a.id, kind="DEPOSIT", amount=a.deposit_amount, method="PAYOS", gateway="PAYOS",
                       gateway_txn_id=f"SEED:{a.code}", status="SUCCESS", content=a.code, created_at=when))

    # ── Lịch sử 8 tuần (cho thống kê) ──
    print("Sinh lịch sử khám 8 tuần...")
    d = today() - timedelta(days=56)
    while d < today():
        if is_working_day(d):
            for _ in range(random.randint(3, 8)):
                sp = random.choices(spec_names, weights)[0]
                doc = random.choice(doc_by_spec[specs[sp].id])
                p = random.choice(crowd)
                slot = random.choice(SLOTS)
                created = at(d, slot) - timedelta(days=random.randint(1, 5), minutes=random.randint(0, 600))
                r = random.random()
                use_ai = random.random() < 0.85
                tri = triage_for(p, sp, created) if use_ai else None
                if r < 0.10:
                    a = make_appt(p, doc, d, slot, "EXPIRED", created, tri)
                    continue
                pay_deposit(a := make_appt(p, doc, d, slot, "CONFIRMED", created, tri), created + timedelta(minutes=2))
                if r < 0.17:
                    a.status = "NO_SHOW"
                    continue
                if r < 0.21:
                    a.status = "CANCELLED"
                    continue
                a.status = "PAID"
                a.checked_in_at = at(d, slot, -10)
                diag = random.choice(DIAGNOSES[sp])
                db.add(MedicalRecord(appointment_id=a.id, patient_id=p.id, doctor_id=doc.id, diagnosis=diag,
                                     advice="Tái khám nếu triệu chứng không cải thiện.", is_locked=True,
                                     locked_at=at(d, slot, 25)))
                if tri:
                    ok = random.random() < AI_ACC[sp]
                    tri.doctor_feedback_correct = ok
                    if not ok:
                        tri.doctor_feedback_specialty_id = specs[CONFUSE.get(sp, "Nội tổng quát")].id
                db.add(Payment(appointment_id=a.id, kind="FINAL", amount=150000, method="CASH", status="SUCCESS",
                               created_at=at(d, slot, 40)))
        d += timedelta(days=1)
    db.flush()

    # ── Một lần khám cũ đầy đủ của bệnh nhân demo (để bác sĩ xem lịch sử) ──
    past = working_days(today() - timedelta(days=24), 1)[0]
    tri = triage_for(demo, "Nội tổng quát", at(past, "07:30") - timedelta(days=1),
                     "đau họng, sốt 38 độ, nuốt vướng 2 ngày")
    a = make_appt(demo, doctors["bs.an"], past, "09:00", "PAID", at(past, "07:30") - timedelta(days=1), tri)
    pay_deposit(a, a.created_at)
    a.checked_in_at = at(past, "08:50")
    tri.doctor_feedback_correct = True
    rec = MedicalRecord(appointment_id=a.id, patient_id=demo.id, doctor_id=doctors["bs.an"].id,
                        clinical_notes="Họng đỏ, amidan sưng nhẹ, không giả mạc. Nhiệt độ 38,2°C.",
                        diagnosis="Viêm họng cấp", advice="Uống nhiều nước ấm, súc họng nước muối. Tái khám nếu sốt quá 3 ngày.",
                        is_locked=True, locked_at=at(past, "09:40"))
    db.add(rec)
    o = LabOrder(appointment_id=a.id, service_id=services["Công thức máu toàn phần"].id,
                 department_id=services["Công thức máu toàn phần"].department_id, ordered_by=doctors["bs.an"].id,
                 technician_id=techs["ktv.xetnghiem"].id, status="DONE", price=90000, claimed_at=at(past, "09:12"),
                 completed_at=at(past, "09:30"), created_at=at(past, "09:10"))
    db.add(o)
    db.flush()
    db.add(LabResult(lab_order_id=o.id, files=[], note="Bạch cầu 11,2 G/L (tăng nhẹ), Neutrophil 78%. Hồng cầu, tiểu cầu trong giới hạn.",
                     is_locked=True))
    rx = Prescription(appointment_id=a.id, doctor_id=doctors["bs.an"].id, is_locked=True)
    for med, dose, times, days in (("Augmentin 625mg", 1, 2, 7), ("Panadol 500mg", 1, 3, 3)):
        m = meds[med]
        q = dose * times * days
        rx.details.append(PrescriptionDetail(medicine_id=m.id, dose_per_time=dose, times_per_day=times, days=days,
                                             timing="SAU_AN", quantity=q, unit_price=m.unit_price, amount=q * m.unit_price))
    rx.total_amount = sum(x.amount for x in rx.details)
    db.add(rx)
    db.add(Payment(appointment_id=a.id, kind="FINAL", amount=150000 + 90000 + rx.total_amount - 100000, method="CASH",
                   status="SUCCESS", created_at=at(past, "09:50")))

    # ── Hôm nay ──
    t0 = today()
    print(f"Sinh ca hôm nay ({t0})...")
    # bs.an: 2 bệnh nhân đã check-in, đang chờ khám
    tri_mai = triage_for(mai, "Nội tổng quát", now() - timedelta(days=1),
                         "sốt 38,5 độ từ hôm qua, ho khan, đau mỏi người")
    tri_mai.vitals = {"temp": 38.5}
    tri_mai.result["tom_tat"] = "Nữ 36 tuổi, sốt 38,5°C từ hôm qua, ho khan, đau mỏi người"
    a1 = make_appt(mai, doctors["bs.an"], t0, "08:00", "CHECKED_IN", now() - timedelta(days=1), tri_mai)
    pay_deposit(a1, a1.created_at)
    a1.checked_in_at = now() - timedelta(minutes=30)
    a2 = make_appt(nam, doctors["bs.an"], t0, "08:30", "CHECKED_IN", now() - timedelta(days=2))
    pay_deposit(a2, a2.created_at)
    a2.checked_in_at = now() - timedelta(minutes=20)

    # bs.an: bệnh nhân demo cũng đã check-in (để chạy hết luồng F3 -> F4 -> thanh toán)
    tri_h = triage_for(demo, "Nội tổng quát", now() - timedelta(hours=20),
                       "đau đầu âm ỉ 3 ngày, sốt nhẹ, mệt, uống paracetamol không đỡ", "KHAM_SOM")
    tri_h.result["tom_tat"] = "Nam 58 tuổi, đau đầu âm ỉ 3 ngày, sốt nhẹ, đã tự uống paracetamol không đỡ"
    a3 = make_appt(demo, doctors["bs.an"], t0, "09:00", "CHECKED_IN", now() - timedelta(hours=20), tri_h)
    pay_deposit(a3, a3.created_at)
    a3.checked_in_at = now() - timedelta(minutes=10)

    # bs.cuong: ca đang chờ CLS (phiếu ở phòng X-quang và Siêu âm – Điện tim) -> demo cho kỹ thuật viên
    p_c = crowd[0]
    tri_c = triage_for(p_c, "Tim mạch", now() - timedelta(days=1), "đau ngực trái khi gắng sức 2 ngày, nghỉ thì đỡ",
                       "KHAM_SOM")
    a4 = make_appt(p_c, doctors["bs.cuong"], t0, "08:00", "WAITING_LAB", now() - timedelta(days=1), tri_c)
    pay_deposit(a4, a4.created_at)
    a4.checked_in_at = now() - timedelta(minutes=50)
    db.add(MedicalRecord(appointment_id=a4.id, patient_id=p_c.id, doctor_id=doctors["bs.cuong"].id,
                         clinical_notes="HA 145/90 mmHg, mạch 88 l/p, tim đều."))
    for svc in ("Điện tâm đồ (ECG)", "X-quang ngực thẳng"):
        s = services[svc]
        db.add(LabOrder(appointment_id=a4.id, service_id=s.id, department_id=s.department_id,
                        ordered_by=doctors["bs.cuong"].id, price=s.price, doctor_note="Đau ngực khi gắng sức, loại trừ thiếu máu cơ tim"))
    # bs.khoa: ca chờ xét nghiệm máu -> phiếu của phòng Xét nghiệm (KTV X-quang mở bằng URL sẽ bị 403)
    p_k = crowd[1]
    tri_k = triage_for(p_k, "Tiêu hóa", now() - timedelta(days=1), "đau bụng thượng vị, ợ chua, buồn nôn 1 tuần")
    a5 = make_appt(p_k, doctors["bs.khoa"], t0, "08:30", "WAITING_LAB", now() - timedelta(days=1), tri_k)
    pay_deposit(a5, a5.created_at)
    a5.checked_in_at = now() - timedelta(minutes=45)
    db.add(MedicalRecord(appointment_id=a5.id, patient_id=p_k.id, doctor_id=doctors["bs.khoa"].id))
    s = services["Chức năng gan (AST, ALT)"]
    db.add(LabOrder(appointment_id=a5.id, service_id=s.id, department_id=s.department_id, ordered_by=doctors["bs.khoa"].id,
                    price=s.price, doctor_note="Kiểm tra men gan"))

    # Quầy thuốc: 3 ca đã chốt đang chờ gọi số
    for i, (pt, docu, diag, items) in enumerate([
        (crowd[2], "bs.binh", "Viêm phế quản cấp", [("Acemuc 200mg", 1, 3, 5), ("Hapacol 500", 1, 3, 3)]),
        (crowd[3], "bs.giang", "Mề đay cấp", [("Telfast 180mg", 1, 1, 7)]),
        (crowd[4], "bs.phuc", "Thoái hóa khớp gối", [("Mobic 7.5mg", 1, 1, 10), ("Omeprazole 20mg", 1, 1, 10)]),
    ], start=1):
        doc = doctors[docu]
        sp_name = next(k for k, v in specs.items() if v.id == doc.specialty_id)
        tri = triage_for(pt, sp_name, now() - timedelta(days=1))
        tri.doctor_feedback_correct = True
        a = make_appt(pt, doc, t0, SLOTS[i], "COMPLETED", now() - timedelta(days=1), tri)
        pay_deposit(a, a.created_at)
        a.checked_in_at = now() - timedelta(minutes=90 - i * 10)
        db.add(MedicalRecord(appointment_id=a.id, patient_id=pt.id, doctor_id=doc.id, diagnosis=diag,
                             advice="Uống thuốc đúng giờ, tái khám sau 1 tuần.", is_locked=True, locked_at=now()))
        rx = Prescription(appointment_id=a.id, doctor_id=doc.id, is_locked=True)
        for med, dose, times, days in items:
            m = meds[med]
            q = dose * times * days
            rx.details.append(PrescriptionDetail(medicine_id=m.id, dose_per_time=dose, times_per_day=times, days=days,
                                                 timing="SAU_AN", quantity=q, unit_price=m.unit_price,
                                                 amount=q * m.unit_price))
        rx.total_amount = sum(x.amount for x in rx.details)
        db.add(rx)
        db.flush()
        db.add(PharmacyQueue(appointment_id=a.id, queue_date=t0, number=i, position=i))

    # ── Ngày làm việc kế tiếp: khung 09:00 của bs.giang đã có 2 người (demo giành chỗ thứ 3, demo bác sĩ nghỉ) ──
    nxt = working_days(t0 + timedelta(days=1), 1)[0]
    for pt in (crowd[5], crowd[6]):
        tri = triage_for(pt, "Da liễu", now() - timedelta(hours=3), "nổi mẩn ngứa khắp người sau khi ăn hải sản")
        a = make_appt(pt, doctors["bs.giang"], nxt, "09:00", "CONFIRMED", now() - timedelta(hours=3), tri)
        pay_deposit(a, a.created_at + timedelta(minutes=1))
    db.commit()
    db.close()
    print("Xong. Mật khẩu mọi tài khoản: 123456")
    print(f"  Khung 09:00 ngày {nxt} của BS. Hoàng Thu Giang (Da liễu) còn đúng 1 chỗ để demo giành chỗ.")


if __name__ == "__main__":
    main()

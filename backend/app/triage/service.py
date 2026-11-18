"""F1 – điều phối 3 lớp: Luật cứng -> RAG -> LLM, kèm hỏi tuổi/giới (nếu chưa đăng nhập) và câu hỏi làm rõ."""
import uuid

from sqlalchemy.orm import Session

from ..models import Patient, Specialty, TriageSession
from ..utils import now
from . import llm, rules
from .rag import disease_index

AGE_OPTIONS = ["Dưới 16 tuổi", "16–40 tuổi", "41–60 tuổi", "Trên 60 tuổi"]
GENDER_OPTIONS = ["Nam", "Nữ"]
MAX_CLARIFY = 2
DISCLAIMER = "Kết quả chỉ mang tính tham khảo, không thay thế chẩn đoán của bác sĩ."
GREETING = ("Xin chào, tôi là trợ lý của Phòng khám MedCare. Bạn hãy kể triệu chứng bằng lời của mình, "
            "ví dụ: “đau đầu từ sáng, đo huyết áp 160/100”. Tôi sẽ gợi ý chuyên khoa và giờ khám phù hợp.")


def age_group(birth_year: int) -> str:
    age = now().year - birth_year
    if age < 16:
        return AGE_OPTIONS[0]
    if age <= 40:
        return AGE_OPTIONS[1]
    if age <= 60:
        return AGE_OPTIONS[2]
    return AGE_OPTIONS[3]


def _msg(role: str, text: str, kind: str = "text", options=None, data=None, answer_for=None) -> dict:
    m = {"role": role, "text": text, "kind": kind, "ts": now().isoformat()}
    if options:
        m["options"] = options
    if data is not None:
        m["data"] = data
    if answer_for:
        m["answer_for"] = answer_for
    return m


def create_session(db: Session, patient: Patient | None) -> TriageSession:
    s = TriageSession(id=str(uuid.uuid4()), messages=[_msg("assistant", GREETING)], vitals={}, red_flags=[],
                      rag_context=[])
    if patient:
        s.patient_id = patient.id
        s.age_group = age_group(patient.birth_year)
        s.gender = patient.gender
    db.add(s)
    db.commit()
    return s


def _gender_label(g: str | None) -> str | None:
    return {"NAM": "Nam", "NU": "Nữ"}.get(g or "")


def _vitals_text(v: dict) -> str:
    parts = []
    if "bp" in v:
        parts.append(f"huyết áp {v['bp']['systolic']}/{v['bp']['diastolic']} mmHg")
    if "temp" in v:
        parts.append(f"nhiệt độ {v['temp']:g}°C")
    if "spo2" in v:
        parts.append(f"SpO2 {v['spo2']}%")
    return ", ".join(parts)


def _context(s: TriageSession, msgs: list[dict]) -> dict:
    symptom_msgs = [m["text"] for m in msgs if m["role"] == "user" and not m.get("answer_for")]
    answers, last_q = [], None
    for m in msgs:
        if m["role"] == "assistant" and m["kind"] == "question" and m.get("data", {}).get("field") == "clarify":
            last_q = m["text"]
        if m["role"] == "user" and m.get("answer_for") == "clarify" and last_q:
            answers.append({"q": last_q, "a": m["text"]})
    return {
        "symptom_messages": symptom_msgs,
        "symptom_text": ". ".join(symptom_msgs),
        "answers": answers,
        "age_group": s.age_group,
        "gender_label": _gender_label(s.gender),
        "vitals_text": _vitals_text(s.vitals or {}),
        "rag": [],
    }


def _rule_text(ctx: dict) -> str:
    """Văn bản cho Lớp 1: lời kể + câu hỏi mà bệnh nhân trả lời 'Có' (vd 'Bạn có khó thở không?' -> 'Có')."""
    extra = [a["q"] for a in ctx["answers"] if a["a"].strip().lower().startswith("có")]
    return ". ".join(ctx["symptom_messages"] + extra)


def handle_message(db: Session, s: TriageSession, text: str) -> TriageSession:
    text = " ".join(text.split())[:1000]
    msgs = list(s.messages or [])
    pending = s.pending or {}
    field = pending.get("field")
    msgs.append(_msg("user", text, answer_for=field))
    s.pending = None

    if field == "age":
        s.age_group = next((o for o in AGE_OPTIONS if o.lower() == text.lower()), text[:20])
    elif field == "gender":
        low = text.lower()
        s.gender = "NU" if low.startswith("nữ") or low.startswith("nu") else "NAM"

    specialties = [sp.name for sp in db.query(Specialty).filter(Specialty.is_active).order_by(Specialty.id)]
    ctx = _context(s, msgs)

    # ── Lớp 1: luật cứng (chạy trước, không phụ thuộc AI) ──
    r = rules.evaluate(_rule_text(ctx))
    s.vitals, s.red_flags = r["vitals"], r["flags"]
    ctx["vitals_text"] = _vitals_text(s.vitals)
    if r["flags"]:
        spec_name = r["flags"][0]["specialty"] if r["flags"][0]["specialty"] in specialties else specialties[0]
        s.result = {
            "chuyen_khoa": spec_name, "muc_do": "CAP_CUU",
            "tom_tat": ctx["symptom_text"][:300],
            "ly_do": "Phát hiện dấu hiệu nguy hiểm: " + "; ".join(f["finding"] for f in r["flags"]),
            "can_hoi_them": [], "nguon": "LUAT_CUNG",
        }
        _finish(db, s, msgs, spec_name, "CAP_CUU", provider="rules")
        return s

    if not ctx["symptom_messages"]:
        msgs.append(_msg("assistant", "Bạn hãy kể triệu chứng đang gặp để tôi gợi ý chuyên khoa phù hợp nhé."))
        return _save(db, s, msgs)

    # Hỏi nhanh tuổi / giới tính bằng nút bấm nếu chưa đăng nhập
    if not s.age_group:
        s.pending = {"field": "age"}
        msgs.append(_msg("assistant", "Bạn thuộc nhóm tuổi nào?", "question", AGE_OPTIONS, data={"field": "age"}))
        return _save(db, s, msgs)
    if not s.gender:
        s.pending = {"field": "gender"}
        msgs.append(_msg("assistant", "Giới tính của bạn?", "question", GENDER_OPTIONS, data={"field": "gender"}))
        return _save(db, s, msgs)

    # ── Lớp 2: RAG ──
    hits = disease_index.search(ctx["symptom_text"] + " " + " ".join(a["a"] for a in ctx["answers"]), 5)
    ctx["rag"] = hits
    s.rag_context = [{"id": h["id"], "name": h["name"], "specialty_hint": h["specialty_hint"], "score": h["score"]}
                     for h in hits]

    # ── Lớp 3: LLM + kiểm tra đầu ra ──
    remaining = MAX_CLARIFY - (s.clarify_count or 0)
    result, provider = llm.classify(ctx, specialties, remaining)
    if result["can_hoi_them"] and remaining > 0:
        q = result["can_hoi_them"][0]
        s.clarify_count = (s.clarify_count or 0) + 1
        s.pending = {"field": "clarify"}
        s.provider = provider
        msgs.append(_msg("assistant", q["cau_hoi"], "question", q["lua_chon"], data={"field": "clarify"}))
        return _save(db, s, msgs)

    result["nguon"] = provider
    s.result = result
    _finish(db, s, msgs, result["chuyen_khoa"], result["muc_do"], provider)
    return s


def _finish(db, s: TriageSession, msgs, spec_name: str, urgency: str, provider: str):
    sp = db.query(Specialty).filter(Specialty.name == spec_name).first()
    s.specialty_id = sp.id if sp else None
    s.urgency = urgency
    s.provider = provider
    s.state = "EMERGENCY" if urgency == "CAP_CUU" else "DONE"
    payload = {**(s.result or {}), "specialty_id": s.specialty_id, "red_flags": s.red_flags, "vitals": s.vitals,
               "disclaimer": DISCLAIMER}
    kind = "emergency" if urgency == "CAP_CUU" else "result"
    msgs.append(_msg("assistant", (s.result or {}).get("ly_do", ""), kind, data=payload))
    _save(db, s, msgs)


def _save(db, s: TriageSession, msgs) -> TriageSession:
    s.messages = msgs
    db.commit()
    return s


def serialize(s: TriageSession) -> dict:
    return {
        "id": s.id, "state": s.state, "messages": s.messages, "vitals": s.vitals, "red_flags": s.red_flags,
        "result": s.result, "urgency": s.urgency, "specialty_id": s.specialty_id,
        "emergency_acknowledged": s.emergency_acknowledged, "pending": s.pending, "provider": s.provider,
        "age_group": s.age_group, "gender": s.gender, "disclaimer": DISCLAIMER,
    }

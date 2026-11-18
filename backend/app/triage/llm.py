"""F1 – Lớp 3: LLM (openai client, cấu hình base_url + model) trả JSON theo schema cố định, có kiểm tra đầu ra.

- JSON sai schema / chuyên khoa không có trong danh mục -> gọi lại 1 lần; vẫn lỗi -> Khám tổng quát.
- Không có API key -> bộ phân loại dự phòng offline (bỏ phiếu theo 5 kết quả RAG), đầu ra vẫn qua cùng validator.
- Đầu ra chưa qua validate() không bao giờ được trả ra ngoài.
"""
import json
import logging
import re

from openai import OpenAI

from ..config import settings
from ..utils import strip_accents

log = logging.getLogger("medcare.llm")
URGENCY = ("CAP_CUU", "KHAM_SOM", "BINH_THUONG")

SYSTEM_PROMPT = """Bạn là trợ lý phân loại triệu chứng (triage) của một phòng khám tư tại Việt Nam.
Nhiệm vụ DUY NHẤT: từ lời kể của bệnh nhân, chọn MỘT chuyên khoa phù hợp nhất trong danh sách của phòng khám
và đánh giá mức độ khẩn. Tuyệt đối KHÔNG chẩn đoán bệnh, KHÔNG gợi ý thuốc hay cách điều trị.

Mức độ:
- CAP_CUU: có dấu hiệu đe dọa tính mạng, cần đến cơ sở cấp cứu ngay.
- KHAM_SOM: nên được khám trong 24–48 giờ (triệu chứng nặng lên, kéo dài, người cao tuổi có bệnh nền...).
- BINH_THUONG: có thể đặt lịch khám thông thường.

Chỉ trả về MỘT đối tượng JSON, không kèm chữ nào khác, đúng schema:
{"chuyen_khoa": string, "muc_do": "CAP_CUU"|"KHAM_SOM"|"BINH_THUONG", "tom_tat": string, "ly_do": string,
 "can_hoi_them": [{"cau_hoi": string, "lua_chon": [string, ...]}]}

Quy tắc:
- chuyen_khoa phải là tên CHÍNH XÁC trong danh sách chuyên khoa được cung cấp. Luôn điền dự đoán tốt nhất.
- tom_tat: 1 câu cho bác sĩ đọc trước khi khám (giới, tuổi, triệu chứng chính, thời gian, chỉ số nếu có).
- ly_do: 1–2 câu bằng lời dễ hiểu cho người không có chuyên môn, không khẳng định tên bệnh.
- can_hoi_them: chỉ dùng khi thật sự thiếu thông tin để chọn chuyên khoa hoặc mức độ. Tối đa 1 câu mỗi lượt,
  câu hỏi ngắn, dễ hiểu, kèm 2–4 lựa chọn trả lời ngắn để bệnh nhân chỉ cần bấm (vd "Có"/"Không",
  "Vài giờ"/"Vài ngày"/"Hơn 1 tuần"). Không đủ lượt hỏi thì để [].
"""


def _provider() -> str:
    p = settings.llm_provider.lower()
    if p == "auto":
        return "openai" if settings.openai_api_key else "offline"
    return p


_THINK = re.compile(r"<think>.*?</think>", re.S)
_client: OpenAI | None = None


def _extract_json(text: str) -> str:
    """Qwen và các model suy luận có thể chèn <think>…</think> hoặc bọc JSON trong ```json — chỉ lấy đối tượng JSON."""
    text = _THINK.sub("", text or "").strip()
    start, end = text.find("{"), text.rfind("}")
    return text[start:end + 1] if 0 <= start < end else text


def _call_llm(prompt: str) -> str:
    global _client
    if _client is None:
        # max_retries=0: việc gọi lại đã do classify() đảm nhiệm (kèm nhắc lỗi schema)
        _client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url or None,
                         timeout=settings.llm_timeout, max_retries=0)
    # Không gửi response_format: nhiều máy chủ tương thích OpenAI không hỗ trợ. JSON do prompt + validate() bảo đảm.
    resp = _client.chat.completions.create(
        model=settings.openai_model, temperature=0.2,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}])
    return _extract_json(resp.choices[0].message.content or "")


def validate(raw, specialties: list[str], allow_questions: bool) -> tuple[dict | None, str | None]:
    """Kiểm tra schema. Trả (kết quả sạch, None) hoặc (None, mô tả lỗi)."""
    try:
        obj = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return None, "Không phải JSON hợp lệ"
    if not isinstance(obj, dict):
        return None, "JSON phải là một object"
    for key in ("chuyen_khoa", "muc_do", "tom_tat", "ly_do", "can_hoi_them"):
        if key not in obj:
            return None, f"Thiếu trường {key}"
    canon = {strip_accents(s).strip(): s for s in specialties}
    spec = canon.get(strip_accents(str(obj["chuyen_khoa"])).strip())
    if not spec:
        return None, f"Chuyên khoa \"{obj['chuyen_khoa']}\" không có trong danh mục"
    if obj["muc_do"] not in URGENCY:
        return None, "muc_do không hợp lệ"
    if not isinstance(obj["tom_tat"], str) or not obj["tom_tat"].strip():
        return None, "tom_tat rỗng"
    if not isinstance(obj["ly_do"], str):
        return None, "ly_do phải là chuỗi"
    qs = obj["can_hoi_them"]
    if not isinstance(qs, list):
        return None, "can_hoi_them phải là mảng"
    clean_qs = []
    for q in qs:
        if not isinstance(q, dict) or not isinstance(q.get("cau_hoi"), str) or not isinstance(q.get("lua_chon"), list):
            return None, "Mỗi câu hỏi cần có cau_hoi và lua_chon"
        opts = [str(o).strip()[:40] for o in q["lua_chon"] if str(o).strip()]
        if not 2 <= len(opts) <= 4:
            return None, "Mỗi câu hỏi cần 2–4 lựa chọn"
        clean_qs.append({"cau_hoi": q["cau_hoi"].strip()[:200], "lua_chon": opts})
    return {
        "chuyen_khoa": spec,
        "muc_do": obj["muc_do"],
        "tom_tat": obj["tom_tat"].strip()[:500],
        "ly_do": obj["ly_do"].strip()[:500],
        "can_hoi_them": clean_qs[:1] if allow_questions else [],
    }, None


# ───────────── Bộ phân loại dự phòng khi không có API key ─────────────

_SEVERE = ["du doi", "dot ngot", "ngay cang nang", "nang hon", "khong do", "ra mau", "rat dau", "sot cao",
           "khong chiu noi", "lien tuc", "tang dan"]
_DURATION = ["gio", "ngay", "tuan", "thang", "nam", "hom qua", "tu sang", "tu toi", "moi", "lau roi", "sang nay"]


def offline_classify(ctx: dict, specialties: list[str], allow_questions: bool) -> dict:
    text = strip_accents(ctx["symptom_text"])
    answers = " ".join(a["a"] for a in ctx["answers"])
    votes: dict[str, float] = {}
    for h in ctx["rag"]:
        spec = h["specialty_hint"] if h["specialty_hint"] in specialties else "Nội tổng quát"
        votes[spec] = votes.get(spec, 0) + max(h["score"], 0)
    spec = max(votes, key=votes.get) if votes else "Nội tổng quát"
    top_score = max((h["score"] for h in ctx["rag"]), default=0)
    if top_score < 0.2:
        spec = "Nội tổng quát"

    questions = []
    has_duration = any(re.search(r"\b" + d + r"\b", text) for d in _DURATION) or ctx["answers"]
    if allow_questions and not has_duration:
        questions = [{"cau_hoi": "Triệu chứng này đã kéo dài bao lâu?",
                      "lua_chon": ["Vài giờ", "Vài ngày", "Hơn 1 tuần"]}]

    severe = any(s in text for s in _SEVERE)
    elderly = ctx.get("age_group") == "Trên 60 tuổi" and spec in ("Tim mạch", "Hô hấp", "Thần kinh")
    long = "hon 1 tuan" in strip_accents(answers)
    urgency = "KHAM_SOM" if (severe or elderly or (long and spec != "Da liễu")) else "BINH_THUONG"

    who = ", ".join(x for x in [ctx.get("gender_label"), ctx.get("age_group")] if x)
    duration = f", thời gian: {ctx['answers'][0]['a'].lower()}" if ctx["answers"] else ""
    summary = f"{who}: {ctx['symptom_text'][:200]}{duration}" if who else ctx["symptom_text"][:200]
    names = ", ".join(h["name"] for h in ctx["rag"][:3])
    reason = (f"Mô tả của bạn gần với nhóm triệu chứng thường được khám tại chuyên khoa {spec}"
              f"{' (tham chiếu: ' + names + ')' if names else ''}.")
    if urgency == "KHAM_SOM":
        reason += " Bạn nên được khám sớm."
    return {"chuyen_khoa": spec, "muc_do": urgency, "tom_tat": summary, "ly_do": reason,
            "can_hoi_them": questions}


def build_prompt(ctx: dict, specialties: list[str], remaining_questions: int) -> str:
    lines = [f"Danh sách chuyên khoa của phòng khám: {', '.join(specialties)}."]
    lines.append(f"Bệnh nhân: giới tính {ctx.get('gender_label') or 'không rõ'}, nhóm tuổi {ctx.get('age_group') or 'không rõ'}.")
    if ctx.get("vitals_text"):
        lines.append(f"Chỉ số bệnh nhân tự đo (hệ thống đã tách): {ctx['vitals_text']}.")
    lines.append("Lời kể của bệnh nhân:")
    lines += [f'- "{t}"' for t in ctx["symptom_messages"]]
    if ctx["answers"]:
        lines.append("Các câu đã hỏi thêm:")
        lines += [f"- Hỏi: {a['q']} | Đáp: {a['a']}" for a in ctx["answers"]]
    lines.append("Tri thức tham khảo (ViMedical_Diseases – 5 bệnh có mô tả gần nhất, chỉ để tham khảo):")
    for i, h in enumerate(ctx["rag"], 1):
        lines.append(f"{i}. {h['name']} (thường khám: {h['specialty_hint']}) – {h['symptoms'][:250]}")
    if remaining_questions > 0:
        lines.append(f"Còn được hỏi thêm tối đa {remaining_questions} câu.")
    else:
        lines.append("KHÔNG được hỏi thêm nữa: can_hoi_them phải là [].")
    return "\n".join(lines)


def classify(ctx: dict, specialties: list[str], remaining_questions: int) -> tuple[dict, str]:
    """Trả (kết quả đã kiểm tra, nguồn). Nguồn: llm | offline | fallback."""
    allow_q = remaining_questions > 0
    provider = _provider()
    if provider == "offline":
        out, err = validate(offline_classify(ctx, specialties, allow_q), specialties, allow_q)
        if out:
            return out, "offline"
    else:
        prompt = build_prompt(ctx, specialties, remaining_questions)
        for attempt in range(2):  # gọi lần đầu + gọi lại 1 lần
            try:
                raw = _call_llm(prompt)
            except Exception as e:  # lỗi mạng / quota
                log.warning("LLM lỗi (lần %s): %s", attempt + 1, e)
                continue
            out, err = validate(raw, specialties, allow_q)
            if out:
                return out, "llm"
            log.warning("LLM trả sai schema (lần %s): %s", attempt + 1, err)
            prompt += f"\n\nLần trả lời trước không hợp lệ: {err}. Hãy trả lại đúng schema JSON."
    general = next((s for s in specialties if strip_accents(s) == "noi tong quat"), specialties[0])
    return {
        "chuyen_khoa": general, "muc_do": "BINH_THUONG",
        "tom_tat": ctx["symptom_text"][:300] or "Bệnh nhân chưa mô tả rõ triệu chứng",
        "ly_do": "Hệ thống chưa xác định được chuyên khoa phù hợp, bạn nên khám tổng quát để bác sĩ đánh giá.",
        "can_hoi_them": [],
    }, "fallback"

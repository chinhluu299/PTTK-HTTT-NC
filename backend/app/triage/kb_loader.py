"""Nạp ViMedical_Disease.csv vào DISEASE_KNOWLEDGE_BASE.

Bộ dữ liệu gồm 603 bệnh × ~20 câu hỏi mô tả triệu chứng, KHÔNG có cột chuyên khoa.
Cột specialty_hint được gán tự động bằng từ khóa trên tên bệnh (thứ tự luật có ý nghĩa: luật trước thắng)
để làm ngữ cảnh cho LLM và cho bộ phân loại dự phòng. Nhóm nên rà soát lại trước khi dùng thật.
"""
import csv
import re
from collections import OrderedDict
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "ViMedical_Disease.csv"

# (chuyên khoa, danh sách mẫu regex trên tên bệnh viết thường, CÓ dấu)
SPECIALTY_RULES: list[tuple[str, list[str]]] = [
    ("Thần kinh", [r"tai biến", r"đột quỵ", r"não", r"thần kinh", r"parkinson", r"alzheimer", r"động kinh",
                   r"đau đầu", r"nửa đầu", r"migraine", r"đỉnh đầu", r"chóng mặt", r"tiền đình", r"mất ngủ",
                   r"giấc ngủ", r"trầm cảm", r"lo âu", r"lưỡng cực", r"phân ly", r"trí tuệ", r"liệt mặt",
                   r"tê bì", r"moyamoya", r"nhược cơ", r"sinh ba", r"tuyến tùng", r"tuy sống"]),
    ("Mắt", [r"\bmắt\b", r"cận thị", r"viễn thị", r"loạn thị", r"khúc xạ", r"glaucoma", r"giác mạc",
             r"võng mạc", r"kết mạc", r"thủy tinh thể", r"bồ đào", r"mù màu", r"bờ mi"]),
    ("Tai Mũi Họng", [r"\btai\b", r"mũi", r"họng", r"xoang", r"amidan", r"thanh quản", r"thanh quảng",
                      r"khàn tiếng", r"giọng nói", r"nghe kém", r"ngủ ngáy", r"luân nhĩ", r"nước bọt",
                      r"xương chũm", r"màng nhĩ"]),
    ("Tim mạch", [r"\btim\b", r"\bvan\b", r"mạch vành", r"huyết áp", r"\bnhịp\b", r"động mạch",
                  r"thông liên", r"fallot", r"brugada", r"tái cực", r"tâm thu", r"rung nhĩ", r"nhanh thất",
                  r"nhanh nhĩ", r"thất phải", r"tĩnh mạch", r"xơ vữa", r"mỡ máu", r"lipid", r"đau thắt ngực",
                  r"áp phổi"]),
    ("Hô hấp", [r"phổi", r"phế", r"hen", r"suyễn", r"hô hấp", r"khó thở", r"bệnh ho", r"\blao\b",
                r"cúm", r"metapneumovirus", r"omicron", r"trung thất", r"lồng ngực", r"ngưng thở"]),
    ("Cơ xương khớp", [r"khớp", r"xương", r"cột sống", r"đĩa đệm", r"gout", r"tophi", r"acid uric",
                       r"cổ tay", r"cổ chân", r"gối", r"khuỷu", r"gót chân", r"ngón tay", r"đốt sống",
                       r"sudeck", r"mông chết", r"teo cơ"]),
    ("Tiêu hóa", [r"dạ dày", r"tá tràng", r"\bgan\b", r"\bmật\b", r"tụy", r"ruột", r"đại tràng", r"trực tràng",
                  r"hậu môn", r"\btrĩ\b", r"tiêu hóa", r"tiêu chảy", r"táo bón", r"chướng bụng", r"đầy hơi",
                  r"không tiêu", r"thực quản", r"hang vị", r"crohn", r"\blỵ\b", r"khe hoành", r"salmonella",
                  r"thực phẩm", r"giun", r"\bsán\b", r"ký sinh", r"thoát vị bẹn"]),
    ("Da liễu", [r"\bda\b", r"mụn", r"chàm", r"mề đay", r"\bnám\b", r"sẹo", r"nốt ruồi", r"rụng tóc", r"herpes",
                 r"thủy đậu", r"đậu mùa", r"dạng đĩa", r"vảy nến", r"stevens", r"phát ban", r"ngứa", r"mồ hôi",
                 r"giang mai", r"\blậu\b", r"sùi mào gà", r"\bhpv\b", r"rận", r"u mềm", r"u máu", r"xơ cứng bi",
                 r"tay chân miệng", r"chlamydia", r"u nhú"]),
    ("Nội tiết", [r"giáp", r"bướu cổ", r"basedow", r"đái tháo đường", r"tiểu đường", r"đường huyết",
                  r"insulinoma", r"nội tiết", r"béo phì", r"thượng thận", r"testosterone", r"dậy thì",
                  r"kallmann", r"klinefelter", r"swyer", r"ceton", r"chuyển hóa", r"nữ hóa"]),
    ("Thận – Tiết niệu", [r"thận", r"tiết niệu", r"bàng quang", r"niệu", r"\btiểu\b", r"tuyến tiền liệt",
                          r"tinh hoàn", r"tính hoàn", r"dương vật", r"quy đầu", r"tinh trùng", r"thừng tinh",
                          r"dẫn tinh", r"xuất tinh", r"cương dương", r"yếu sinh lý", r"fournier", r"mào tinh",
                          r"phúc tinh mạc", r"són tiểu"]),
    ("Sản phụ khoa", [r"thai", r"sau sinh", r"sinh non", r"chuyển dạ", r"\bnhau\b", r"\brau\b", r"buồng trứng",
                      r"tử cung", r"âm đạo", r"kinh nguyệt", r"chậm kinh", r"rong kinh", r"bụng kinh", r"mãn kinh",
                      r"\bvú\b", r"\bối\b", r"phôi", r"vòi trứng", r"hiếm muộn", r"vô sinh", r"nghén", r"tia sữa",
                      r"hellp", r"estrogen", r"sàn chậu", r"tạng chậu", r"băng huyết", r"sản", r"dây rốn",
                      r"cơn gò", r"túi ngực"]),
]


def guess_specialty(name: str) -> str:
    n = name.lower()
    for spec, patterns in SPECIALTY_RULES:
        if any(re.search(p, n) for p in patterns):
            return spec
    return "Nội tổng quát"


_PREFIX = re.compile(
    r"^(tôi|mình|em)\s+(hiện\s+)?(đang\s+)?(có\s+)?(cảm thấy|bị|có|hay|thường|thấy|gặp)?\s*"
    r"(các\s+triệu\s+chứng\s+như|triệu\s+chứng\s+như|các\s+triệu\s+chứng|những\s+triệu\s+chứng\s+như)?\s*",
    re.IGNORECASE)
_SUFFIX = re.compile(r"[.?!\s]*(tôi|mình|em)\s+(có thể\s+)?(đang\s+)?(bị|mắc)\s+(bệnh\s+)?gì.*$", re.IGNORECASE)


def clean_question(q: str) -> str:
    q = " ".join(q.split())
    q = _SUFFIX.sub("", q)
    q = _PREFIX.sub("", q)
    return q.strip(" .,")


def load_csv(path: Path = CSV_PATH) -> list[dict]:
    groups: "OrderedDict[str, list[str]]" = OrderedDict()
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row["Disease"].strip()
            q = clean_question(row["Question"])
            if q:
                groups.setdefault(name, []).append(q)
    return [{"name": name, "symptoms": "; ".join(dict.fromkeys(qs)), "specialty_hint": guess_specialty(name)}
            for name, qs in groups.items()]

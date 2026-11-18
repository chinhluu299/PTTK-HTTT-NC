"""F1 – Lớp 2: truy xuất tri thức (RAG) trên ViMedical_Diseases, vector lưu trong FAISS.

Vector hóa: TF-IDF (từ đơn + cặp từ, trên văn bản bỏ dấu) -> giảm chiều LSA -> chuẩn hóa L2,
tìm kiếm cosine bằng faiss.IndexFlatIP. Chạy hoàn toàn offline, xây lại chỉ mục khi khởi động.
"""
import threading

import faiss
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from ..utils import strip_accents


class DiseaseIndex:
    def __init__(self):
        self.lock = threading.Lock()
        self.rows: list[dict] = []
        self.vectorizer = None
        self.svd = None
        self.index = None

    def build(self, rows: list[dict]):
        """rows: [{id, name, symptoms, specialty_hint}]"""
        if not rows:
            return
        texts = [f"{r['name']}. {r['name']}. {r['symptoms']}" for r in rows]
        vec = TfidfVectorizer(preprocessor=strip_accents, ngram_range=(1, 2), sublinear_tf=True, min_df=1)
        X = vec.fit_transform(texts)
        n_comp = min(300, X.shape[0] - 1, X.shape[1] - 1)
        svd = TruncatedSVD(n_components=n_comp, random_state=42)
        Z = normalize(svd.fit_transform(X)).astype("float32")
        index = faiss.IndexFlatIP(Z.shape[1])
        index.add(Z)
        with self.lock:
            self.rows, self.vectorizer, self.svd, self.index = rows, vec, svd, index

    def search(self, query: str, k: int = 5) -> list[dict]:
        if not self.index or not query.strip():
            return []
        q = normalize(self.svd.transform(self.vectorizer.transform([query]))).astype("float32")
        scores, ids = self.index.search(q, k)
        out = []
        for score, i in zip(scores[0], ids[0]):
            if i < 0:
                continue
            r = self.rows[int(i)]
            out.append({"id": r["id"], "name": r["name"], "specialty_hint": r["specialty_hint"],
                        "symptoms": r["symptoms"][:400], "score": round(float(score), 3)})
        return out


disease_index = DiseaseIndex()


def build_from_db(db):
    from ..models import DiseaseKnowledge
    rows = [{"id": d.id, "name": d.name, "symptoms": d.symptoms, "specialty_hint": d.specialty_hint}
            for d in db.query(DiseaseKnowledge).all()]
    disease_index.build(rows)
    return len(rows)


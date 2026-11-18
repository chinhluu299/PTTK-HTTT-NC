"""Kiểm thử end-to-end các kịch bản demo ở mục IX của đặc tả (F1–F4, thanh toán, phân quyền).

Yêu cầu: backend đang chạy ở http://localhost:8000 và vừa chạy `python seed.py`.
Chạy:  .venv/bin/python tests/e2e_demo.py
"""
import concurrent.futures as cf
import random
import sys

import httpx

B = "http://localhost:8000"
c = httpx.Client(base_url=B, timeout=30)
ok_count = 0


def check(cond, label, extra=""):
    global ok_count
    if cond:
        ok_count += 1
        print(f"  PASS {label}")
    else:
        print(f"  FAIL {label} {extra}")
        sys.exit(1)


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


def staff(u):
    r = c.post("/api/auth/staff/login", json={"username": u, "password": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


print("F1 – emergency rule layer")
s = c.post("/api/triage/sessions").json()
r = c.post(f"/api/triage/sessions/{s['id']}/messages", json={"text": "huyết áp 200/120, đau đầu"}).json()
check(r["state"] == "EMERGENCY" and r["provider"] == "rules", "popup đỏ ngay, không gọi LLM", r)
check(r["vitals"]["bp"] == {"systolic": 200, "diastolic": 120}, "tách chỉ số huyết áp")
r2 = c.post(f"/api/triage/sessions/{s['id']}/messages", json={"text": "dau nguc nhung khong kho tho"}).json()
s2 = c.post("/api/triage/sessions").json()
r3 = c.post(f"/api/triage/sessions/{s2['id']}/messages", json={"text": "đau ngực nhưng không khó thở"}).json()
check(r3["state"] != "EMERGENCY", "phủ định 'không khó thở' không kích hoạt cấp cứu", r3)

print("F1 – Da liễu")
s = c.post("/api/triage/sessions").json()
sid = s["id"]
r = c.post(f"/api/triage/sessions/{sid}/messages", json={"text": "nổi mẩn ngứa sau khi ăn hải sản"}).json()
check(r["messages"][-1]["kind"] == "question" and r["pending"]["field"] == "age", "hỏi nhóm tuổi bằng nút")
r = c.post(f"/api/triage/sessions/{sid}/messages", json={"text": "16–40 tuổi"}).json()
check(r["pending"]["field"] == "gender", "hỏi giới tính")
r = c.post(f"/api/triage/sessions/{sid}/messages", json={"text": "Nữ"}).json()
if r["pending"] and r["pending"]["field"] == "clarify":
    print("   clarify:", r["messages"][-1]["text"], r["messages"][-1]["options"])
    r = c.post(f"/api/triage/sessions/{sid}/messages", json={"text": r["messages"][-1]["options"][0]}).json()
check(r["state"] == "DONE" and r["result"]["chuyen_khoa"] == "Da liễu", "gợi ý Da liễu", r.get("result"))
spec_id = r["specialty_id"]

print("F2 – suggest + register + hold + webhook")
sug = c.get("/api/booking/suggest", params={"specialty_id": spec_id}).json()["suggestion"]
check(sug and sug["doctor"], "có đề xuất khung giờ + bác sĩ", sug)
phone = "09" + "".join(random.choice("0123456789") for _ in range(8))
reg = c.post("/api/auth/patient/register", json={"phone": phone, "password": "123456", "full_name": "Test Bệnh Nhân",
                                                 "birth_year": 1995, "gender": "NU", "triage_session_id": sid}).json()
ptok = reg["token"]
hold = c.post("/api/appointments/hold", headers=h(ptok), json={
    "specialty_id": spec_id, "doctor_id": sug["doctor"]["id"], "date": sug["date"], "slot": sug["slot"],
    "triage_session_id": sid})
check(hold.status_code == 200 and hold.json()["status"] == "HOLD", "tạo HOLD", hold.text)
appt = hold.json()
check(appt["payment"]["vietqr"].startswith("000201") and len(appt["code"]) == 12, "VietQR + mã 12 ký tự")
sim = c.post("/api/payments/dev/simulate", json={"code": appt["code"], "transaction_id": "TXN-E2E-1"}).json()
check(sim["result"] == "confirmed", "webhook -> CONFIRMED", sim)
sim2 = c.post("/api/payments/dev/simulate", json={"code": appt["code"], "transaction_id": "TXN-E2E-1"}).json()
check(sim2["result"] == "duplicate", "webhook trùng bị bỏ qua (idempotent)", sim2)
det = c.get(f"/api/appointments/{appt['id']}", headers=h(ptok)).json()
check(det["status"] == "CONFIRMED" and det["deposit_paid"] == 100000, "chỉ ghi nhận cọc 1 lần", det["deposit_paid"])

print("F2 – race on 3rd slot (bs.giang 09:00 ngày kế tiếp)")
avail = c.get("/api/booking/availability", params={"specialty_id": spec_id}).json()
giang_slot = None
for day in avail:
    for sl in day["slots"]:
        for dct in sl["doctors"]:
            if dct["name"] == "BS. Hoàng Thu Giang" and dct["left"] == 1 and sl["slot"] == "09:00":
                giang_slot = (day["date"], sl["slot"], dct["id"])
                break
        if giang_slot: break
    if giang_slot: break
check(giang_slot is not None, "tìm thấy khung còn đúng 1 chỗ", "")
toks = []
for i in range(2):
    ph = "09" + "".join(random.choice("0123456789") for _ in range(8))
    sx = c.post("/api/triage/sessions").json()["id"]
    for t in ["nổi mẩn ngứa khắp người", "16–40 tuổi", "Nam", "Vài ngày", "Vài ngày"]:
        rr = c.post(f"/api/triage/sessions/{sx}/messages", json={"text": t}).json()
        if rr["state"] == "DONE":
            break
    tk = c.post("/api/auth/patient/register", json={"phone": ph, "password": "123456", "full_name": f"Race {i}",
                                                    "birth_year": 1990, "gender": "NAM", "triage_session_id": sx}).json()["token"]
    toks.append((tk, sx))


def grab(args):
    tk, sx = args
    with httpx.Client(base_url=B, timeout=30) as cc:
        return cc.post("/api/appointments/hold", headers=h(tk), json={
            "specialty_id": spec_id, "doctor_id": giang_slot[2], "date": giang_slot[0], "slot": giang_slot[1],
            "triage_session_id": sx})


with cf.ThreadPoolExecutor(2) as ex:
    res = list(ex.map(grab, toks))
codes = sorted(r.status_code for r in res)
check(codes == [200, 409], "chỉ 1 người giữ được chỗ thứ 3", [(r.status_code, r.text[:80]) for r in res])
print("   ->", [r.json().get("detail") for r in res if r.status_code == 409][0])

print("Leave preview (bs.giang nghỉ sáng ngày đó)")
gt = staff("bs.giang")
pv = c.post("/api/leaves/preview", headers=h(gt), json={"date": giang_slot[0], "session": "MORNING"}).json()
check(len(pv["affected"]) >= 3 and all(a["replacement"] for a in pv["affected"] if a["status"] == "CONFIRMED"),
      "liệt kê BN bị ảnh hưởng + bác sĩ thay thế", pv)

print("Kiosk + F3 + F4 với bệnh nhân demo (đã CHECKED_IN, bs.an)")
dt = staff("bs.an")
q = c.get("/api/doctor/queue", headers=h(dt)).json()
case = next(i for i in q["items"] if i["patient"]["phone"] == "0901234567")
cid = case["id"]
check(c.post(f"/api/doctor/cases/{cid}/open", headers=h(dt)).status_code == 200, "mở ca")
other = staff("bs.cuong")
check(c.get(f"/api/doctor/cases/{cid}", headers=h(other)).status_code == 403, "bác sĩ khác xem ca -> 403")
cd = c.get(f"/api/doctor/cases/{cid}", headers=h(dt)).json()
check(cd["triage"]["result"]["tom_tat"] and len(cd["history"]) >= 1, "có tóm tắt trước khám + lịch sử")
check(c.put(f"/api/doctor/cases/{cid}/record", headers=h(dt), json={"diagnosis": "Sốt siêu vi", "advice": "Nghỉ ngơi"}).status_code == 200, "ghi chẩn đoán")
labs = c.get("/api/catalog/lab-services", headers=h(dt)).json()
xq = next(l for l in labs if l["name"] == "X-quang ngực thẳng")
xn = next(l for l in labs if l["name"] == "Công thức máu toàn phần")
r = c.post(f"/api/doctor/cases/{cid}/lab-orders", headers=h(dt), json={"service_ids": [xq["id"], xn["id"]], "note": "Sốt, ho"})
check(r.status_code == 200, "chỉ định 2 CLS", r.text)
order_ids = r.json()["created"]
r = c.post(f"/api/doctor/cases/{cid}/complete", headers=h(dt), json={"ai_correct": True})
check(r.status_code == 409, "chốt ca khi còn phiếu -> bị chặn", r.text)
print("   ->", r.json()["detail"])
x1 = staff("ktv.xquang")
r = c.get(f"/api/lab/orders/{order_ids[1]}", headers=h(x1))
check(r.status_code == 403, "KTV X-quang mở phiếu Xét nghiệm bằng URL -> 403", r.text)
print("   ->", r.json()["detail"])
x2 = staff("ktv.xquang2")
with cf.ThreadPoolExecutor(2) as ex:
    cl = list(ex.map(lambda t: httpx.post(f"{B}/api/lab/orders/{order_ids[0]}/claim", headers=h(t)), [x1, x2]))
check(sorted(r.status_code for r in cl) == [200, 409], "2 KTV cùng nhận phiếu -> 1 người được", [r.status_code for r in cl])
winner = x1 if cl[0].status_code == 200 else x2
loser = x2 if winner == x1 else x1
check(c.put(f"/api/lab/orders/{order_ids[0]}/note", headers=h(loser), json={"note": "x"}).status_code == 403, "KTV khác không sửa được phiếu đã có người nhận")
png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
r = c.post(f"/api/lab/orders/{order_ids[0]}/files", headers=h(winner), files=[("files", ("xq.png", png, "image/png"))])
check(r.status_code == 200 and r.json()["files"], "upload ảnh kết quả", r.text)
c.put(f"/api/lab/orders/{order_ids[0]}/note", headers=h(winner), json={"note": "Phổi sáng, không thâm nhiễm"})
check(c.post(f"/api/lab/orders/{order_ids[0]}/complete", headers=h(winner)).json()["case_ready"] is False, "XQ xong, ca vẫn chờ XN")
xt = staff("ktv.xetnghiem")
c.post(f"/api/lab/orders/{order_ids[1]}/claim", headers=h(xt))
c.put(f"/api/lab/orders/{order_ids[1]}/note", headers=h(xt), json={"note": "BC 9,8 G/L bình thường"})
r = c.post(f"/api/lab/orders/{order_ids[1]}/complete", headers=h(xt)).json()
check(r["case_ready"] is True, "mọi phiếu DONE -> ca về IN_CONSULTATION")
r = c.post(f"/api/lab/orders/{order_ids[1]}/amend", headers=h(xt), data={"reason": "Nhập nhầm chỉ số", "note": "BC 8,9 G/L bình thường", "keep_urls": "[]"})
check(r.status_code == 200, "sửa kết quả sau khóa có lý do", r.text)

print("F4 – Panadol + Efferalgan")
meds = c.get("/api/catalog/medicines", headers=h(dt), params={"q": "para"}).json()
pan = next(m for m in meds if m["name"] == "Panadol 500mg")
eff = next(m for m in meds if m["name"] == "Efferalgan 500mg")
items = [{"medicine_id": pan["id"], "dose_per_time": 2, "times_per_day": 3, "days": 3, "timing": "SAU_AN"},
         {"medicine_id": eff["id"], "dose_per_time": 1, "times_per_day": 3, "days": 3, "timing": "SAU_AN"}]
ev = c.post("/api/doctor/prescriptions/check", headers=h(dt), json={"items": items}).json()
types = sorted(w["type"] for w in ev["warnings"])
check("DUPLICATE" in types and "OVERDOSE" in types, "cảnh báo trùng hoạt chất + vượt liều", ev["warnings"])
od = next(w for w in ev["warnings"] if w["type"] == "OVERDOSE" and w.get("ingredient") == "Paracetamol")
check(od["total"] == 4500 and od["max"] == 4000, "4.500 mg > 4.000 mg/ngày")
check(ev["lines"][0]["quantity"] == 18 and ev["lines"][0]["amount"] == 27000, "tự tính số lượng + thành tiền")
r = c.put(f"/api/doctor/cases/{cid}/prescription", headers=h(dt), json={"items": items, "duplicate_ack": True})
check(r.status_code == 422, "lưu khi chưa nhập lý do vượt liều -> chặn", r.text)
r = c.put(f"/api/doctor/cases/{cid}/prescription", headers=h(dt), json={"items": items, "duplicate_ack": True,
                                                                      "overdose_reason": "Sốt cao, theo dõi sát chức năng gan"})
check(r.status_code == 200, "lưu đơn có lý do", r.text)
r = c.post(f"/api/doctor/cases/{cid}/complete", headers=h(dt), json={})
check(r.status_code == 400, "chốt ca bắt buộc trả lời đánh giá AI")
r = c.post(f"/api/doctor/cases/{cid}/complete", headers=h(dt), json={"ai_correct": True})
check(r.status_code == 200 and r.json()["queue_number"] >= 1, "chốt ca, tự cấp số thứ tự", r.text)
qn = r.json()["queue_number"]
r = c.post(f"/api/doctor/cases/{cid}/amend", headers=h(dt), json={"reason": "Bổ sung chẩn đoán", "diagnosis": "Sốt siêu vi – theo dõi sốt xuất huyết"})
check(r.status_code == 200 and r.json()["is_amended"], "sửa bệnh án sau khóa -> nhãn Đã chỉnh sửa")

print("Bệnh nhân xem hồ sơ")
pt = c.post("/api/auth/patient/login", json={"phone": "0901234567", "password": "123456"}).json()["token"]
det = c.get(f"/api/appointments/{cid}", headers=h(pt)).json()
check(det["queue"]["number"] == qn and det["visit"]["prescription"]["schedule"], "thấy số thứ tự + lịch uống thuốc")
check(len(det["visit"]["amendments"]) >= 2, "thấy lịch sử chỉnh sửa", det["visit"]["amendments"])
check(c.get(f"/api/appointments/{appt['id']}", headers=h(pt)).status_code == 403, "BN xem lịch người khác -> 403")

print("Quầy thuốc")
ph_t = staff("duocsi")
qq = c.get("/api/pharmacy/queue", headers=h(ph_t)).json()
check(any(t["number"] == qn for t in qq["waiting"]), "số mới vào hàng chờ")
r = c.post("/api/pharmacy/queue/call-next", headers=h(ph_t)).json()
tid = r["id"]
c.post(f"/api/pharmacy/queue/{tid}/call", headers=h(ph_t)); c.post(f"/api/pharmacy/queue/{tid}/call", headers=h(ph_t))
check(c.post(f"/api/pharmacy/queue/{tid}/call", headers=h(ph_t)).status_code == 409, "tối đa gọi 3 lần")
r = c.post(f"/api/pharmacy/queue/{tid}/skip", headers=h(ph_t)).json()
check(r["status"] == "WAITING" and r["skip_count"] == 1, "vắng 3 lần -> chuyển cuối hàng")
bill = c.get(f"/api/pharmacy/appointments/{cid}", headers=h(ph_t)).json()
inv = bill["invoice"]
check(inv["due"] == inv["consultation_fee"] + inv["lab_total"] + inv["medicine_total"] - inv["deposit"], "hóa đơn = khám + CLS + thuốc − cọc", inv)
r = c.post(f"/api/pharmacy/appointments/{cid}/pay", headers=h(ph_t), json={"method": "CASH"})
check(r.status_code == 200, "đã thanh toán -> PAID")
check(c.get("/api/pharmacy/appointments/999999", headers=h(ph_t)).status_code == 404, "404 ca không tồn tại")

print("Admin")
at = staff("admin")
st = c.get("/api/admin/stats", headers=h(at), params={"period": "week"}).json()
check(st["kpi"]["cases"] > 50 and st["ai_accuracy"], "thống kê có số liệu", st["kpi"])
check(c.get(f"/api/doctor/cases/{cid}", headers=h(at)).status_code == 403, "admin không xem nội dung khám")
print(f"\nALL {ok_count} CHECKS PASSED")

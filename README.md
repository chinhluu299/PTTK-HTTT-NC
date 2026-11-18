# MedCare AI

Hệ thống quản lý phòng khám và đặt lịch khám, có trợ lý AI phân loại triệu chứng. Xây dựng theo
`docs/MedCare_AI_Dac_ta_ban_chinh_sua.docx`.

| Thành phần | Công nghệ |
|---|---|
| Backend | FastAPI, SQLAlchemy 2, PostgreSQL 17, APScheduler, SSE |
| AI (F1) | Luật cứng (regex) → RAG trên ViMedical_Disease (TF‑IDF + LSA, chỉ mục FAISS) → LLM qua openai client (qwen3.5-9b), đầu ra JSON có kiểm tra schema |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Thanh toán | VietQR (tự sinh chuỗi EMVCo) + webhook SePay |

```
backend/
  app/
    models.py          20 bảng của mục VII (+ SYSTEM_SETTINGS)
    state.py           máy trạng thái lịch hẹn/phiếu CLS + nhật ký AUDIT_LOGS
    booking.py         F2: lịch trống, gợi ý bác sĩ cân tải, giữ chỗ FOR UPDATE, webhook idempotent, bác sĩ nghỉ
    prescribing.py     F4: kiểm tra trùng hoạt chất, cộng dồn liều, tính số lượng và tiền
    triage/            F1: rules.py (lớp 1), rag.py (lớp 2), llm.py (lớp 3), service.py (điều phối)
    jobs.py            job mỗi phút: HOLD hết hạn → EXPIRED, trễ 15 phút → NO_SHOW, nhắc tái khám
    routers/           API theo từng vai trò
  seed.py              tạo lại CSDL + dữ liệu mẫu
  tests/e2e_demo.py    47 kiểm tra cho các kịch bản demo ở mục IX
  data/ViMedical_Disease.csv
frontend/src/app/      các trang (xem bảng bên dưới)
```

## Chạy dự án

Cần Python 3.12+, Node 20.9+ và PostgreSQL (cài sẵn trên máy).

### 1. CSDL PostgreSQL
Dùng PostgreSQL cài sẵn trên máy (Homebrew, Postgres.app hoặc bộ cài chính thức), chỉ cần tạo một CSDL trống:
```bash
createdb medcare
```

### 2. Backend
Tạo `backend/.env` với đường dẫn tới CSDL vừa tạo (thay `<user>`, `<mật khẩu>` cho đúng máy của bạn).
Muốn dùng LLM thật thì thêm ba dòng `OPENAI_*` (máy chủ nào tương thích OpenAI cũng được); bỏ trống `OPENAI_API_KEY` thì AI chạy chế độ offline. Mọi tham số còn lại đã có giá trị mặc định ở `backend/app/config.py`.
```
DATABASE_URL=postgresql+psycopg://<user>:<mật khẩu>@localhost:5432/medcare
OPENAI_API_KEY=<key>
OPENAI_BASE_URL=<địa chỉ máy chủ LLM, dạng https://.../v1>
OPENAI_MODEL=qwen3.5-9b
```
```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python seed.py      # tạo bảng + dữ liệu mẫu (chạy lại bất cứ lúc nào để làm mới)
.venv/bin/uvicorn app.main:app --port 8000 --reload
```
Tài liệu API (Swagger): http://localhost:8000/docs

### 3. Frontend
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```
Mở http://localhost:3000

> Dữ liệu "hôm nay" trong seed (bệnh nhân đã check-in, hàng chờ quầy thuốc, phiếu CLS) tính theo ngày chạy `seed.py`.
> Sang ngày mới thì chạy lại `seed.py` trước khi demo.

## Tài khoản mẫu

Mật khẩu chung `123456`. Trang đăng nhập nhân viên có sẵn nút đăng nhập nhanh.

| Vai trò | Tài khoản |
|---|---|
| Bệnh nhân | `0901234567` (Nguyễn Văn Hùng, đã check-in hôm nay, có 1 lần khám cũ) |
| Bác sĩ | `bs.an` (Nội tổng quát), `bs.cuong` (Tim mạch), `bs.giang` / `bs.hai` (Da liễu), … 15 bác sĩ, 12 chuyên khoa |
| Kỹ thuật viên | `ktv.xquang`, `ktv.xquang2` (Phòng X‑quang), `ktv.xetnghiem`, `ktv.sieuam` |
| Dược sĩ | `duocsi` |
| Quản trị | `admin` |

## Các màn hình

| Đường dẫn | Ai dùng | Nội dung |
|---|---|---|
| `/` | Bệnh nhân | Vào trợ lý, khám tổng quát, cảnh báo khi nào phải gọi 115 |
| `/kham` | Bệnh nhân | F1: trò chuyện (gõ hoặc nói), nút trả lời nhanh, bảng chỉ số tách được, popup cấp cứu |
| `/dat-lich` | Bệnh nhân | F2: đề xuất sẵn khung sớm nhất + bác sĩ, hoặc chọn ngày/giờ/bác sĩ; đăng ký nhanh 5 thông tin |
| `/lich-hen/[id]` | Bệnh nhân | VietQR + đếm ngược 5 phút, QR check-in, xử lý khi bác sĩ nghỉ, số thứ tự quầy thuốc, kết quả và lịch uống thuốc |
| `/ho-so` | Bệnh nhân | Lịch hẹn, các lần khám, sửa thông tin cá nhân |
| `/kiosk` | Máy tính bảng ở quầy | Check-in bằng quét QR (camera), số điện thoại hoặc mã khám |
| `/man-hinh-cho` | Màn hình quầy thuốc | Số đang gọi, hàng chờ, đọc số bằng giọng nói |
| `/nhan-vien/bac-si` | Bác sĩ | Danh sách khám trong ngày, cập nhật realtime |
| `/nhan-vien/bac-si/ca/[id]` | Bác sĩ | Tóm tắt AI trước khám, lịch sử, bệnh án, chỉ định CLS, kê đơn có kiểm tra, chốt ca, sửa sau khóa, nhật ký |
| `/nhan-vien/cls` | Kỹ thuật viên | Phiếu của phòng: chờ nhận / đang làm / xong |
| `/nhan-vien/quay-thuoc` | Dược sĩ | Gọi số, gọi lại tối đa 3 lần, chuyển cuối hàng, hóa đơn, thu tiền |
| `/nhan-vien/lich-nghi` | BS, KTV, DS | Đăng ký nghỉ; bác sĩ xem trước bệnh nhân bị ảnh hưởng |
| `/nhan-vien/quan-tri/*` | Quản trị | Thống kê (gồm độ chính xác AI), danh mục, nhân viên, khóa tài khoản bệnh nhân, hoàn cọc, tham số |

## Kịch bản demo (mục IX của đặc tả)

Chạy `.venv/bin/python tests/e2e_demo.py` để kiểm tra tự động toàn bộ các kịch bản dưới đây qua API.

**F1**
1. `/kham` → gõ *"huyết áp 200/120, đau đầu"* → popup đỏ hiện ngay. Bác sĩ sẽ thấy nguồn là "luật cứng": không gọi LLM.
2. Bắt đầu lại → *"nổi mẩn ngứa sau khi ăn hải sản"* → trả lời bằng nút → gợi ý **Da liễu** → bấm "Chọn giờ khám" thì form đặt lịch đã điền sẵn chuyên khoa.

**F2**
1. Seed để sẵn khung **09:00 ngày làm việc kế tiếp của BS. Hoàng Thu Giang** còn đúng 1 chỗ. Mở hai trình duyệt (một cửa sổ ẩn danh), cùng chọn khung này với bác sĩ đó và bấm giữ chỗ gần như cùng lúc → chỉ một người thành công, người kia nhận "Khung giờ vừa hết chỗ".
2. Để trang thanh toán quá 5 phút → job chuyển sang EXPIRED và trả chỗ. Bấm "Giả lập ngân hàng báo tiền về" sau đó → hệ thống ghi nhận tiền và khôi phục lịch nếu còn chỗ.
3. Webhook gửi trùng: gọi `POST /api/payments/dev/simulate` hai lần với cùng `transaction_id` → lần hai bị bỏ qua.
4. Đăng nhập `bs.giang` → Lịch nghỉ → chọn ngày đó, buổi sáng → "Kiểm tra lịch hẹn bị ảnh hưởng" → thấy danh sách bệnh nhân và bác sĩ thay thế đề xuất. Bệnh nhân bị ảnh hưởng thấy ba lựa chọn trên trang lịch hẹn.

**F3**
1. Đăng nhập `ktv.xquang`, mở `/nhan-vien/cls/<id phiếu của Phòng Xét nghiệm>` bằng URL → màn hình 403 do máy chủ từ chối.
2. `bs.an` mở ca Nguyễn Văn Hùng → chỉ định CLS → bấm "Chốt ca" → hộp thoại chỉ rõ còn phiếu chưa xong và máy chủ từ chối.
3. KTV nhận phiếu, tải ảnh, hoàn thành → bác sĩ nhận thông báo realtime, ca tự quay về "Đang khám".
4. Sau khi chốt ca: "Sửa bệnh án (cần lý do)" hoặc KTV "Sửa kết quả" → nhãn "Đã chỉnh sửa" + lịch sử thay đổi (bác sĩ và bệnh nhân đều xem được).

**F4**: trong ca, thêm Panadol 500mg (2 viên × 3 lần/ngày) và Efferalgan 500mg (1 viên × 3 lần/ngày) → cảnh báo trùng paracetamol và vượt liều 4.500 > 4.000 mg/ngày, phải xác nhận và nhập lý do mới lưu được. Số lượng và tiền tự cập nhật.

**Chuỗi xuyên suốt**: bệnh nhân `0901234567` → `bs.an` khám, chỉ định CLS, kê đơn, chốt ca (đánh giá AI) → số thứ tự hiện trên trang lịch hẹn của bệnh nhân → `duocsi` gọi số (mở `/man-hinh-cho` để nghe đọc số) → thu tiền → bệnh nhân thấy lịch uống thuốc theo buổi.

## Tích hợp bên ngoài

Tất cả đều chạy được khi không có tài khoản thật:

| Tích hợp | Khi chưa cấu hình | Cấu hình thật |
|---|---|---|
| LLM | Bộ phân loại offline: bỏ phiếu theo 5 kết quả RAG, vẫn đi qua cùng bộ kiểm tra JSON | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| Thanh toán | Nút "Giả lập ngân hàng báo tiền về" gọi đúng luồng webhook | Trỏ webhook SePay về `POST /api/payments/sepay-webhook`, đặt `SEPAY_API_KEY`, `PAYMENT_DEV_MODE=false`; sửa số tài khoản ở Quản trị → Tham số |
| Lưu file kết quả CLS | Thư mục `backend/uploads/` | `CLOUDINARY_URL` |
| Email | Ghi file HTML (kèm ảnh QR) vào `backend/outbox/` | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` |

## Những điểm hiểu đặc tả theo cách riêng

Nhóm nên rà lại các điểm này khi viết báo cáo:

1. **Bảng thứ 21, `SYSTEM_SETTINGS`**: lưu tiền cọc, phí khám, tài khoản nhận tiền do quản trị viên cấu hình (mục V nhắc tới "tham số" nhưng danh sách 20 bảng chưa có chỗ chứa).
2. **Email bệnh nhân**: đặc tả gửi email xác nhận/nhắc tái khám nhưng PATIENTS không có cột email. Đã thêm cột email *không bắt buộc*. Form đăng ký vẫn chỉ hỏi 5 thông tin, email nằm sau một liên kết "thêm email".
3. **Khóa dòng khi giữ chỗ**: không có bảng khung giờ, nên transaction khóa dòng **bác sĩ** (`SELECT … FROM staff WHERE id = … FOR UPDATE`) rồi đếm chỗ. Kết quả tương đương khóa khung giờ của bác sĩ đó.
4. **Liều tối đa**: lưu ở cả hai mức. Mức hoạt chất (`ACTIVE_INGREDIENTS.max_daily_dose`) dùng cho phép cộng dồn qua mọi thuốc. Mức mặt hàng (`MEDICINES.max_daily_quantity`, đơn vị/ngày) là cột mà đặc tả đặt trên bảng MEDICINES.
5. **ViMedical_Disease không có cột chuyên khoa**: `specialty_hint` được gán tự động bằng từ khóa trên tên bệnh (`app/triage/kb_loader.py`), cần rà soát lại.
6. **Vector RAG**: dùng TF‑IDF + LSA (chạy offline, không cần tải mô hình) và lưu trong FAISS. Có thể thay bằng embedding của một mô hình thật ở `app/triage/rag.py`.
7. **Tuổi khi chưa đăng nhập**: AI hỏi *nhóm tuổi* bằng nút bấm, không hỏi năm sinh.
8. **Gọi 3 lần không đến**: sau lần gọi thứ 3, dược sĩ bấm "Chuyển cuối". Máy chủ chặn thao tác này nếu chưa gọi đủ 3 lần.
9. **Ngưỡng dấu hiệu đỏ** lấy đúng bảng ví dụ trong đặc tả. Cần đối chiếu và ghi nguồn tài liệu y khoa như đặc tả đã lưu ý.

## Giao diện

- Một hành động chính mỗi màn hình. Phía bệnh nhân dùng nút cao 48–64 px và chữ 16–17 px.
- Màu chỉ dùng để mang nghĩa: **đỏ** chỉ cho cấp cứu/nguy hiểm, **vàng cam** cho cảnh báo, **xanh lá** cho hoàn tất. Trạng thái luôn có chữ đi kèm, không dùng màu đơn thuần.
- Focus bàn phím kiểu biển báo (viền vàng + viền tối), thấy được trên mọi nền.
- Font Be Vietnam Pro (thiết kế cho tiếng Việt). Mã khám và số tài khoản dùng font đơn cách để dễ đọc từng ký tự.
- Mỗi biểu đồ ở trang thống kê có bảng số liệu thay thế ("Xem dạng bảng").

# MedCare – Frontend (Next.js 16)

Xem hướng dẫn đầy đủ ở [README gốc](../README.md).

```bash
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev        # http://localhost:3000
```

- `src/app/` – các trang (bệnh nhân ở gốc, nhân viên dưới `nhan-vien/`)
- `src/components/ui.tsx` – nút, ô nhập, nhãn trạng thái, hộp thoại dùng chung
- `src/components/rx-editor.tsx` – trình kê đơn có kiểm tra (F4)
- `src/components/charts.tsx` – biểu đồ SVG cho trang thống kê
- `src/app/globals.css` – design tokens (màu, font, focus)

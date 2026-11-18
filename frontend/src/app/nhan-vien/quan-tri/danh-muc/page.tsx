"use client";
import { useEffect, useState } from "react";
import { ActiveTag, Crud } from "@/components/crud";
import { PageHead, StaffShell } from "@/components/staff-shell";
import { Segmented, Tag } from "@/components/ui";
import { api } from "@/lib/api";
import { num, vnd } from "@/lib/format";

type Tab = "spec" | "dept" | "svc" | "ing" | "med";
interface Spec { id: number; name: string; description: string | null; is_general: boolean; is_active: boolean; doctors: number }
interface Dept { id: number; name: string; room: string | null; is_active: boolean }
interface Svc { id: number; name: string; department_id: number; department: string; price: number; is_active: boolean }
interface Ing { id: number; name: string; max_daily_dose: number | null; dose_unit: string }
interface Med { id: number; name: string; strength: string; dosage_form: string; unit: string; unit_price: number; max_daily_quantity: number | null; is_active: boolean; ingredients: { ingredient_id: number; name: string; amount: number; unit: string }[] }

export default function Page() {
  return <StaffShell roles={["ADMIN"]}>{() => <Catalog />}</StaffShell>;
}

function Catalog() {
  const [tab, setTab] = useState<Tab>("spec");
  const [depts, setDepts] = useState<Dept[]>([]);
  const [ings, setIngs] = useState<Ing[]>([]);
  useEffect(() => {
    api<Dept[]>("/api/admin/departments", { auth: "staff" }).then(setDepts).catch(() => {});
    api<Ing[]>("/api/admin/ingredients", { auth: "staff" }).then(setIngs).catch(() => {});
  }, [tab]);
  return (
    <>
      <PageHead eyebrow="Quản trị" title="Danh mục" sub="Chuyên khoa, phòng và dịch vụ cận lâm sàng, hoạt chất và thuốc."
        actions={<Segmented value={tab} onChange={setTab} name="Danh mục" options={[
          { value: "spec", label: "Chuyên khoa" }, { value: "dept", label: "Phòng CLS" }, { value: "svc", label: "Dịch vụ CLS" },
          { value: "ing", label: "Hoạt chất" }, { value: "med", label: "Thuốc" }]} />} />
      {tab === "spec" && (
        <Crud<Spec> key="spec" endpoint="/api/admin/specialties" title="Chuyên khoa" empty={{ name: "", description: "", is_active: true }}
          cols={[{ label: "Tên", render: (r) => <span className="font-semibold">{r.name} {r.is_general && <Tag className="ml-1 border-brand-tint-2 bg-brand-tint text-brand-strong">Khám tổng quát</Tag>}</span> },
            { label: "Mô tả", render: (r) => <span className="text-ink-2">{r.description}</span> },
            { label: "Bác sĩ", render: (r) => <span className="num">{r.doctors}</span>, className: "w-20" },
            { label: "Trạng thái", render: (r) => <ActiveTag on={r.is_active} />, className: "w-28" }]}
          fields={[{ key: "name", label: "Tên chuyên khoa", required: true, wide: true }, { key: "description", label: "Mô tả (giúp AI hiểu phạm vi)", type: "textarea" }, { key: "is_active", label: "Đang hoạt động", type: "checkbox" }]} />
      )}
      {tab === "dept" && (
        <Crud<Dept> key="dept" endpoint="/api/admin/departments" title="Phòng cận lâm sàng" empty={{ name: "", room: "", is_active: true }}
          cols={[{ label: "Tên phòng", render: (r) => <span className="font-semibold">{r.name}</span> }, { label: "Số phòng", render: (r) => r.room },
            { label: "Trạng thái", render: (r) => <ActiveTag on={r.is_active} />, className: "w-28" }]}
          fields={[{ key: "name", label: "Tên phòng", required: true }, { key: "room", label: "Số phòng" }, { key: "is_active", label: "Đang hoạt động", type: "checkbox" }]} />
      )}
      {tab === "svc" && (
        <Crud<Svc> key="svc" endpoint="/api/admin/lab-services" title="Dịch vụ cận lâm sàng" empty={{ name: "", department_id: "", price: "", is_active: true }}
          cols={[{ label: "Dịch vụ", render: (r) => <span className="font-semibold">{r.name}</span> }, { label: "Phòng thực hiện", render: (r) => r.department },
            { label: "Giá", render: (r) => <span className="num">{vnd(r.price)}</span>, className: "w-32 text-right" },
            { label: "Trạng thái", render: (r) => <ActiveTag on={r.is_active} />, className: "w-28" }]}
          fields={[{ key: "name", label: "Tên dịch vụ", required: true, wide: true },
            { key: "department_id", label: "Phòng thực hiện", type: "select", required: true, options: depts.map((d) => ({ value: d.id, label: d.name })) },
            { key: "price", label: "Giá (đ)", type: "number", required: true }, { key: "is_active", label: "Đang hoạt động", type: "checkbox" }]} />
      )}
      {tab === "ing" && (
        <Crud<Ing> key="ing" endpoint="/api/admin/ingredients" title="Hoạt chất" empty={{ name: "", max_daily_dose: "", dose_unit: "mg" }}
          cols={[{ label: "Hoạt chất", render: (r) => <span className="font-semibold">{r.name}</span> },
            { label: "Liều tối đa / ngày", render: (r) => <span className="num">{r.max_daily_dose ? `${num(r.max_daily_dose)} ${r.dose_unit}` : "—"}</span> }]}
          fields={[{ key: "name", label: "Tên hoạt chất", required: true, wide: true },
            { key: "max_daily_dose", label: "Liều tối đa mỗi ngày", type: "number", hint: "Dùng để cảnh báo vượt liều khi kê đơn (cộng dồn mọi thuốc)" },
            { key: "dose_unit", label: "Đơn vị", required: true }]} />
      )}
      {tab === "med" && (
        <Crud<Med> key="med" endpoint="/api/admin/medicines" title="Thuốc" ingredientOptions={ings.map((i) => ({ value: i.id, label: i.name }))}
          empty={{ name: "", strength: "", dosage_form: "", unit: "viên", unit_price: "", max_daily_quantity: "", is_active: true, ingredients: [{ ingredient_id: "", amount: "" }] }}
          toForm={(r) => ({ ...r, ingredients: r.ingredients.map((i) => ({ ingredient_id: i.ingredient_id, amount: i.amount })) })}
          cols={[{ label: "Mặt hàng", render: (r) => <><p className="font-semibold">{r.name}</p><p className="text-[13px] text-ink-3">{r.dosage_form}</p></> },
            { label: "Hoạt chất", render: (r) => <span className="text-ink-2">{r.ingredients.map((i) => `${i.name} ${num(i.amount)}${i.unit}`).join(" + ")}</span> },
            { label: "Đơn giá", render: (r) => <span className="num">{vnd(r.unit_price)}/{r.unit}</span>, className: "w-36 text-right" },
            { label: "Tối đa/ngày", render: (r) => <span className="num">{r.max_daily_quantity ? `${num(r.max_daily_quantity)} ${r.unit}` : "—"}</span>, className: "w-28" },
            { label: "Trạng thái", render: (r) => <ActiveTag on={r.is_active} />, className: "w-28" }]}
          fields={[{ key: "name", label: "Tên mặt hàng", required: true, wide: true, hint: "Mỗi hàm lượng là một mặt hàng riêng, vd “Paracetamol 500mg viên nén”" },
            { key: "strength", label: "Hàm lượng hiển thị", required: true }, { key: "dosage_form", label: "Dạng bào chế", required: true },
            { key: "unit", label: "Đơn vị tính", required: true }, { key: "unit_price", label: "Đơn giá (đ)", type: "number", required: true },
            { key: "max_daily_quantity", label: "Tối đa đơn vị / ngày", type: "number" },
            { key: "ingredients", label: "Thành phần hoạt chất (mg trong 1 đơn vị)", type: "ingredients" },
            { key: "is_active", label: "Đang kinh doanh", type: "checkbox" }]} />
      )}
    </>
  );
}

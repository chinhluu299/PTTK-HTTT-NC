"use client";
import { useEffect, useState } from "react";
import { ActiveTag, Crud } from "@/components/crud";
import { PageHead, ROLE_LABEL, StaffShell } from "@/components/staff-shell";
import { api } from "@/lib/api";

interface Row { id: number; username: string; full_name: string; role: string; specialty: string | null; department: string | null; room: string | null; email: string | null; is_active: boolean; specialty_id: number | null; department_id: number | null }

export default function Page() {
  return <StaffShell roles={["ADMIN"]}>{() => <StaffList />}</StaffShell>;
}

function StaffList() {
  const [specs, setSpecs] = useState<{ id: number; name: string }[]>([]);
  const [depts, setDepts] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    api<{ id: number; name: string }[]>("/api/admin/specialties", { auth: "staff" }).then(setSpecs).catch(() => {});
    api<{ id: number; name: string }[]>("/api/admin/departments", { auth: "staff" }).then(setDepts).catch(() => {});
  }, []);
  return (
    <>
      <PageHead eyebrow="Quản trị" title="Tài khoản nhân viên" sub="Bác sĩ gắn với chuyên khoa, kỹ thuật viên gắn với phòng cận lâm sàng." />
      <Crud<Row> endpoint="/api/admin/staff" title="Nhân viên"
        empty={{ username: "", password: "", full_name: "", role: "DOCTOR", specialty_id: "", department_id: "", room: "", email: "", is_active: true }}
        toForm={(r) => ({ ...r, password: "" })}
        cols={[{ label: "Họ tên", render: (r) => <><p className="font-semibold">{r.full_name}</p><p className="mono text-[13px] text-ink-3">{r.username}</p></> },
          { label: "Vai trò", render: (r) => ROLE_LABEL[r.role] },
          { label: "Chuyên khoa / phòng", render: (r) => r.specialty ?? r.department ?? "—" },
          { label: "Phòng khám", render: (r) => r.room ?? "—", className: "w-28" },
          { label: "Trạng thái", render: (r) => <ActiveTag on={r.is_active} />, className: "w-28" }]}
        fields={[
          { key: "full_name", label: "Họ tên", required: true, wide: true },
          { key: "username", label: "Tên đăng nhập", required: true, createOnly: true },
          { key: "password", label: "Mật khẩu", type: "password", hint: "Để trống nếu không đổi" },
          { key: "role", label: "Vai trò", type: "select", required: true, options: Object.entries(ROLE_LABEL).map(([v, l]) => ({ value: v, label: l })) },
          { key: "specialty_id", label: "Chuyên khoa", type: "select", required: true, options: specs.map((s) => ({ value: s.id, label: s.name })), show: (f) => f.role === "DOCTOR" },
          { key: "room", label: "Phòng khám", show: (f) => f.role === "DOCTOR" },
          { key: "department_id", label: "Phòng CLS", type: "select", required: true, options: depts.map((d) => ({ value: d.id, label: d.name })), show: (f) => f.role === "TECHNICIAN" },
          { key: "email", label: "Email" },
          { key: "is_active", label: "Tài khoản đang hoạt động", type: "checkbox" },
        ]} />
    </>
  );
}

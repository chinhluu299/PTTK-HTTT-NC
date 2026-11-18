"use client";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { PageHead, StaffShell } from "@/components/staff-shell";
import { Button, Input, Spinner, Tag } from "@/components/ui";
import { toast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { dmy } from "@/lib/format";

interface Row { id: number; full_name: string; phone: string; birth_year: number; is_locked: boolean; created_at: string }

export default function Page() {
  return <StaffShell roles={["ADMIN"]}>{() => <Patients />}</StaffShell>;
}

function Patients() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = useCallback((query = "") => api<Row[]>(`/api/admin/patients?q=${encodeURIComponent(query)}`, { auth: "staff" }).then(setRows).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  async function toggle(r: Row) {
    try {
      await api(`/api/admin/patients/${r.id}/lock`, { body: { locked: !r.is_locked }, auth: "staff" });
      toast(r.is_locked ? `Đã mở khóa ${r.full_name}` : `Đã khóa ${r.full_name}`, { tone: "ok" });
      load(q);
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    }
  }
  return (
    <>
      <PageHead eyebrow="Quản trị" title="Tài khoản bệnh nhân" sub="Bệnh nhân tự đăng ký và tự quản lý hồ sơ. Quản trị viên chỉ khóa tài khoản vi phạm, không xem nội dung khám." />
      <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="mb-4 flex max-w-md gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc số điện thoại" aria-label="Tìm bệnh nhân" />
        <Button type="submit" variant="secondary" aria-label="Tìm"><Search className="size-4" /></Button>
      </form>
      {!rows ? <Spinner /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full min-w-[640px] text-[14.5px]">
            <thead><tr className="border-b border-line text-left bg-paper text-[12.5px] font-semibold text-ink-3">
              <th className="px-4 py-2.5">Họ tên</th><th className="px-4 py-2.5">Số điện thoại</th><th className="px-4 py-2.5">Năm sinh</th><th className="px-4 py-2.5">Đăng ký</th><th className="px-4 py-2.5">Trạng thái</th><th className="w-32" />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-2 last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{r.full_name}</td>
                  <td className="num px-4 py-2.5">{r.phone}</td>
                  <td className="num px-4 py-2.5">{r.birth_year}</td>
                  <td className="num px-4 py-2.5">{dmy(r.created_at)}</td>
                  <td className="px-4 py-2.5">{r.is_locked ? <Tag className="border-danger/30 bg-danger-tint text-danger">Đã khóa</Tag> : <Tag className="border-ok/30 bg-ok-tint text-ok">Hoạt động</Tag>}</td>
                  <td className="px-4 py-2 text-right"><Button size="sm" variant={r.is_locked ? "secondary" : "quiet"} onClick={() => toggle(r)}>{r.is_locked ? "Mở khóa" : "Khóa"}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

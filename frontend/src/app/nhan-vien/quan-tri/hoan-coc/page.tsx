"use client";
import { useCallback, useEffect, useState } from "react";
import { PageHead, StaffShell } from "@/components/staff-shell";
import { Button, Empty, Spinner, Tag } from "@/components/ui";
import { toast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { dateTime, vnd } from "@/lib/format";

interface Row { id: number; amount: number; status: string; note: string | null; content: string | null; created_at: string; code: string | null; patient: string | null; phone: string | null }
const LABEL: Record<string, [string, string]> = {
  REFUND_PENDING: ["Chờ hoàn", "border-warn-line bg-warn-tint text-warn"],
  AMOUNT_MISMATCH: ["Sai số tiền", "border-danger/30 bg-danger-tint text-danger"],
  UNMATCHED: ["Không khớp mã", "border-line bg-paper text-ink-2"],
};

export default function Page() {
  return <StaffShell roles={["ADMIN"]}>{() => <Refunds />}</StaffShell>;
}

function Refunds() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = useCallback(() => api<Row[]>("/api/admin/refunds", { auth: "staff" }).then(setRows).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  async function done(r: Row) {
    try {
      await api(`/api/admin/refunds/${r.id}/done`, { method: "POST", auth: "staff" });
      toast(`Đã đánh dấu hoàn ${vnd(r.amount)}`, { tone: "ok" });
      load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    }
  }
  return (
    <>
      <PageHead eyebrow="Quản trị" title="Khoản tiền cần hoàn / đối soát" sub="Cọc được hoàn khi hủy sớm, bác sĩ nghỉ, hoặc tiền về sau khi khung giờ đã hết chỗ." />
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty title="Không có khoản nào cần xử lý" /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <table className="w-full min-w-[760px] text-[14.5px]">
            <thead><tr className="border-b border-line text-left bg-paper text-[12.5px] font-semibold text-ink-3">
              <th className="px-4 py-2.5">Thời điểm</th><th className="px-4 py-2.5">Bệnh nhân</th><th className="px-4 py-2.5">Mã khám</th><th className="px-4 py-2.5 text-right">Số tiền</th><th className="px-4 py-2.5">Tình trạng</th><th className="w-40" />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-2 last:border-0 align-top">
                  <td className="num px-4 py-2.5">{dateTime(r.created_at)}</td>
                  <td className="px-4 py-2.5">{r.patient ? <><p className="font-semibold">{r.patient}</p><p className="num text-[13px] text-ink-3">{r.phone}</p></> : <span className="text-ink-3">—</span>}</td>
                  <td className="mono px-4 py-2.5">{r.code ?? r.content}</td>
                  <td className="num px-4 py-2.5 text-right font-semibold">{vnd(r.amount)}</td>
                  <td className="px-4 py-2.5"><Tag className={LABEL[r.status]?.[1]}>{LABEL[r.status]?.[0] ?? r.status}</Tag>{r.note && <p className="mt-1 text-[13px] text-ink-3">{r.note}</p>}</td>
                  <td className="px-4 py-2 text-right"><Button size="sm" variant="secondary" onClick={() => done(r)}>Đã hoàn tiền</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

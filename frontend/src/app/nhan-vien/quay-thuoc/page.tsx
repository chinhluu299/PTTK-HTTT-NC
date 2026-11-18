"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, Banknote, ExternalLink, Megaphone, QrCode, Search } from "lucide-react";
import { QR } from "@/components/brand";
import { PageHead, StaffShell } from "@/components/staff-shell";
import { Alert, Button, Empty, Input, Segmented, Spinner, StatusTag, cx } from "@/components/ui";
import { MedSchedule } from "@/components/visit-view";
import { toast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { vnd } from "@/lib/format";
import { useStaffEvents } from "@/lib/hooks";
import type { Appointment, PrescriptionT } from "@/lib/types";

interface Ticket { id: number; number: number; status: string; call_count: number; skip_count: number; appointment_id: number; code: string; patient: string; phone: string; has_prescription: boolean; last_called_at: string | null }
interface Bill {
  appointment: Appointment; patient: { full_name: string; phone: string; birth_year: number }; prescription: PrescriptionT | null; ticket: Ticket | null;
  invoice: { consultation_fee: number; labs: { name: string; price: number }[]; lab_total: number; medicines: { name: string; quantity: number; unit: string; unit_price: number; amount: number }[]; medicine_total: number; gross: number; deposit: number; paid_final: number; due: number; refund: number };
  vietqr?: { payload: string; amount: number; content: string; account: string; bank_name: string };
}

export default function Page() {
  return <StaffShell roles={["PHARMACIST"]} full>{() => <Counter />}</StaffShell>;
}

function Counter() {
  const [q, setQ] = useState<{ waiting: Ticket[]; served: Ticket[] } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<(Appointment & { patient: string; queue_number: number | null })[] | null>(null);
  const load = useCallback(() => api<{ waiting: Ticket[]; served: Ticket[] }>("/api/pharmacy/queue", { auth: "staff" }).then(setQ).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useStaffEvents({ queue_updated: (d) => { if (d.number) toast(`Số ${d.number} vừa vào hàng chờ`); load(); } });

  async function act(path: string, label: string, t?: Ticket) {
    setBusy(label);
    try {
      const r = await api<Ticket>(path, { method: "POST", auth: "staff" });
      if (label !== "skip") setSel(r.appointment_id);
      else toast(`Đã chuyển số ${t?.number} xuống cuối hàng`);
      load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }
  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    try {
      setFound(await api(`/api/pharmacy/lookup?q=${encodeURIComponent(search)}`, { auth: "staff" }));
    } catch (e2) {
      toast(errMsg(e2), { tone: "danger" });
    }
  }
  if (!q) return <Spinner />;
  const calling = q.waiting.filter((t) => t.status === "CALLED");
  return (
    <>
      <PageHead title="Quầy thuốc · Thu ngân" sub={`${q.waiting.length} số đang chờ · ${q.served.length} đã phục vụ hôm nay`}
        actions={<Link href="/man-hinh-cho" target="_blank" className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong px-4 font-semibold hover:border-brand/50">Mở màn hình chờ<ExternalLink className="size-4" aria-hidden /></Link>} />
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-4">
          <Button size="xl" block loading={busy === "next"} disabled={!q.waiting.some((t) => t.status === "WAITING")} onClick={() => act("/api/pharmacy/queue/call-next", "next")}>
            <Megaphone className="size-6" aria-hidden />Gọi số tiếp theo
          </Button>
          <section className="rounded-lg border border-line bg-surface shadow-card">
            <h2 className="border-b border-line-2 px-4 py-2.5 font-bold">Hàng chờ</h2>
            {q.waiting.length === 0 ? <p className="px-4 py-6 text-center text-ink-3">Không có ai chờ</p> : (
              <ul className="divide-y divide-line-2">
                {q.waiting.map((t) => (
                  <li key={t.id} className={cx("flex items-center gap-3 px-3 py-2.5", sel === t.appointment_id && "bg-brand-tint", t.status === "CALLED" && "border-l-4 border-ok")}>
                    <button onClick={() => setSel(t.appointment_id)} className="num w-14 text-left text-[30px] leading-none font-bold">{t.number}</button>
                    <button onClick={() => setSel(t.appointment_id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate font-semibold">{t.patient}</p>
                      <p className="text-[13px] text-ink-3">
                        {t.status === "CALLED" ? <span className="font-semibold text-ok">Đang gọi · lần {t.call_count}/3</span> : "Chờ"}
                        {t.skip_count > 0 && ` · đã chuyển cuối ${t.skip_count} lần`}
                        {!t.has_prescription && " · không có thuốc"}
                      </p>
                    </button>
                    {t.status === "CALLED" && (t.call_count < 3
                      ? <Button size="sm" variant="secondary" loading={busy === `call${t.id}`} onClick={() => act(`/api/pharmacy/queue/${t.id}/call`, `call${t.id}`)}>Gọi lại</Button>
                      : <Button size="sm" variant="secondary" loading={busy === "skip"} onClick={() => act(`/api/pharmacy/queue/${t.id}/skip`, "skip", t)} title="Gọi 3 lần không thấy đến"><ArrowDownToLine className="size-4" aria-hidden />Chuyển cuối</Button>)}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <form onSubmit={lookup} className="rounded-lg border border-line bg-surface shadow-card p-3">
            <label htmlFor="lk" className="text-sm font-semibold">Tra theo mã khám hoặc số điện thoại</label>
            <div className="mt-1.5 flex gap-2">
              <Input id="lk" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ABC1234ABC09 / 0901234567" />
              <Button type="submit" variant="secondary" aria-label="Tra cứu"><Search className="size-4" /></Button>
            </div>
            {found && (
              <ul className="mt-2 divide-y divide-line-2">
                {found.length === 0 && <li className="py-2 text-sm text-ink-3">Không tìm thấy ca đã chốt</li>}
                {found.map((f) => (
                  <li key={f.id}><button onClick={() => setSel(f.id)} className="flex w-full items-center justify-between gap-2 py-2 text-left text-[14.5px] hover:text-brand">
                    <span><b>{f.patient}</b> · <span className="num">{f.date.slice(5).split("-").reverse().join("/")}</span>{f.queue_number ? ` · số ${f.queue_number}` : ""}</span><StatusTag status={f.status} />
                  </button></li>
                ))}
              </ul>
            )}
          </form>
          {q.served.length > 0 && (
            <details className="rounded-lg border border-line bg-surface shadow-card">
              <summary className="cursor-pointer px-4 py-2.5 font-semibold">Đã phục vụ ({q.served.length})</summary>
              <ul className="divide-y divide-line-2 border-t border-line-2">
                {q.served.map((t) => <li key={t.id}><button onClick={() => setSel(t.appointment_id)} className="flex w-full gap-3 px-4 py-2 text-left text-[14.5px]"><span className="num w-8 font-bold">{t.number}</span>{t.patient}</button></li>)}
              </ul>
            </details>
          )}
        </div>
        <div>
          {sel ? <BillView key={sel} id={sel} onPaid={() => { load(); }} calling={calling.map((c) => c.appointment_id)} />
            : <Empty title="Chọn một số trong hàng chờ" icon={<Megaphone className="size-8" />}>Bấm “Gọi số tiếp theo”. Số được hiển thị và đọc trên màn hình chờ.</Empty>}
        </div>
      </div>
    </>
  );
}

function BillView({ id, onPaid, calling }: { id: number; onPaid: () => void; calling: number[] }) {
  const [b, setB] = useState<Bill | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [method, setMethod] = useState<"CASH" | "VIETQR">("CASH");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Bill>(`/api/pharmacy/appointments/${id}`, { auth: "staff" }).then(setB).catch((e) => setErr(errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);
  if (err) return <Alert tone="danger">{err}</Alert>;
  if (!b) return <Spinner />;
  const inv = b.invoice;
  const paid = b.appointment.status === "PAID";

  async function pay() {
    setBusy(true);
    try {
      const r = await api<{ paid: number }>(`/api/pharmacy/appointments/${id}/pay`, { body: { method }, auth: "staff" });
      toast(`Đã thu ${vnd(r.paid)} · giao thuốc xong`, { tone: "ok" });
      load();
      onPaid();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-4 border-b border-line-2 px-5 py-4">
        {b.ticket && <p className="num text-[44px] leading-none font-bold">{b.ticket.number}</p>}
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-bold">{b.patient.full_name}</p>
          <p className="text-ink-3">Sinh {b.patient.birth_year} · <span className="num">{b.patient.phone}</span> · mã <span className="mono">{b.appointment.code}</span> · {b.appointment.doctor.full_name}</p>
        </div>
        <StatusTag status={b.appointment.status} />
        {calling.includes(id) && <span className="text-sm font-semibold text-ok">Đang được gọi</span>}
      </header>
      <div className="grid gap-6 p-5 xl:grid-cols-[1fr_340px]">
        <div>
          <h3 className="mb-2 font-bold">Thuốc cần giao</h3>
          {b.prescription?.items.length ? (
            <>
              <table className="w-full text-[14.5px]">
                <thead><tr className="border-b-2 border-ink text-left"><th className="py-2">Thuốc</th><th className="py-2 text-right">SL</th><th className="py-2 text-right">Đơn giá</th><th className="py-2 text-right">Thành tiền</th></tr></thead>
                <tbody>
                  {b.prescription.items.map((x) => (
                    <tr key={x.medicine_id} className="border-b border-line-2">
                      <td className="py-2"><p className="font-semibold">{x.name}</p><p className="text-[13px] text-ink-3">{x.dose_per_time} {x.unit} × {x.times_per_day} lần/ngày × {x.days} ngày · {x.timing_label}</p></td>
                      <td className="num py-2 text-right text-[17px] font-bold">{x.quantity} <span className="text-[13px] font-normal text-ink-3">{x.unit}</span></td>
                      <td className="num py-2 text-right">{vnd(x.unit_price)}</td>
                      <td className="num py-2 text-right">{vnd(x.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {b.prescription.overdose_reason && <Alert tone="warn" className="mt-3" title="Bác sĩ kê vượt liều có lý do">{b.prescription.overdose_reason}</Alert>}
              <details className="mt-4 rounded-md border border-line">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Lịch uống để dặn bệnh nhân</summary>
                <div className="border-t border-line-2 p-3"><MedSchedule rx={b.prescription} /></div>
              </details>
            </>
          ) : <p className="text-ink-3">Bác sĩ không kê thuốc. Chỉ thu phí khám và cận lâm sàng.</p>}
          <p className="mt-3 text-[13px] text-ink-3">Dược sĩ không sửa được đơn. Cần thay đổi, liên hệ bác sĩ kê đơn.</p>
        </div>
        <aside className="self-start overflow-hidden rounded-xl border border-line bg-surface shadow-raised">
          <h3 className="border-b border-line bg-paper px-4 py-2.5 font-semibold text-ink">Hóa đơn</h3>
          <dl className="space-y-1.5 px-4 py-3 text-[15px]">
            <Line k="Phí khám" v={inv.consultation_fee} />
            {inv.labs.map((l) => <Line key={l.name} k={l.name} v={l.price} sub />)}
            <Line k="Tiền thuốc" v={inv.medicine_total} />
            <div className="rule !my-2" />
            <Line k="Tổng" v={inv.gross} bold />
            <Line k="Trừ tiền cọc" v={-inv.deposit} />
            {inv.paid_final > 0 && <Line k="Đã chuyển khoản" v={-inv.paid_final} />}
          </dl>
          <div className="border-t-2 border-ink px-4 py-3">
            <p className="text-sm font-semibold text-ink-3">{paid ? "ĐÃ THANH TOÁN" : "CẦN THU"}</p>
            <p className="num text-[34px] leading-tight font-bold">{vnd(paid ? 0 : inv.due)}</p>
            {inv.refund > 0 && <p className="text-sm font-semibold text-warn">Trả lại bệnh nhân {vnd(inv.refund)}</p>}
          </div>
          {!paid && (
            <div className="space-y-3 border-t border-line-2 px-4 py-3">
              {inv.due > 0 && (
                <Segmented value={method} onChange={setMethod} name="Hình thức" options={[
                  { value: "CASH", label: <span className="flex items-center gap-1.5"><Banknote className="size-4" aria-hidden />Tiền mặt</span> },
                  { value: "VIETQR", label: <span className="flex items-center gap-1.5"><QrCode className="size-4" aria-hidden />VietQR</span> }]} />
              )}
              {method === "VIETQR" && b.vietqr && (
                <div className="flex flex-col items-center gap-1 rounded-md border border-line p-3">
                  <QR value={b.vietqr.payload} size={180} label="Mã VietQR thanh toán" />
                  <p className="mono text-sm">{b.vietqr.content}</p>
                </div>
              )}
              <Button size="lg" block variant="success" loading={busy} onClick={pay}>Đã thu tiền &amp; giao thuốc</Button>
            </div>
          )}
          {paid && <p className="border-t border-line-2 px-4 py-3 text-sm font-semibold text-ok">Đã thu tiền và giao thuốc</p>}
        </aside>
      </div>
    </div>
  );
}

function Line({ k, v, bold, sub }: { k: string; v: number; bold?: boolean; sub?: boolean }) {
  return (
    <div className={cx("flex justify-between gap-3", sub && "pl-3 text-[14px] text-ink-2", bold && "font-bold")}>
      <dt className="min-w-0">{k}</dt><dd className="num shrink-0">{v < 0 ? `− ${vnd(-v)}` : vnd(v)}</dd>
    </div>
  );
}

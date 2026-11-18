"use client";
import { useEffect, useRef, useState } from "react";
import { CircleAlert, Plus, Search, Trash2, TriangleAlert } from "lucide-react";
import { Alert, Button, Textarea, cx } from "./ui";
import { toast } from "./toast";
import { api, errMsg } from "@/lib/api";
import { num, vnd } from "@/lib/format";
import type { PrescriptionT, RxEvaluation } from "@/lib/types";

interface Med { id: number; name: string; strength: string; dosage_form: string; unit: string; unit_price: number; ingredients: { name: string; amount: number; unit: string }[] }
interface Item { key: number; medicine_id: number; name: string; unit: string; ingredients: string; dose_per_time: string; times_per_day: string; days: string; timing: string; note: string }

const TIMINGS = [["SAU_AN", "Sau ăn"], ["TRUOC_AN", "Trước ăn"], ["TRONG_AN", "Trong bữa ăn"], ["KHONG_PHU_THUOC", "Bất kỳ lúc nào"]];
let k = 0;

export function RxEditor({ caseId, initial, editable, onSaved, onDirty }: {
  caseId: number; initial: PrescriptionT | null; editable: boolean; onSaved: () => void; onDirty: (d: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>(() => (initial?.items ?? []).map((i) => ({
    key: ++k, medicine_id: i.medicine_id, name: i.name, unit: i.unit, ingredients: "",
    dose_per_time: String(i.dose_per_time), times_per_day: String(i.times_per_day), days: String(i.days), timing: i.timing, note: i.note ?? "",
  })));
  const [evRaw, setEv] = useState<RxEvaluation | null>(initial?.evaluation ?? null);
  const [ack, setAck] = useState(!!initial?.duplicate_ack);
  const [reason, setReason] = useState(initial?.overdose_reason ?? "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const markDirty = () => { setDirty(true); onDirty(true); };
  const hasValid = items.some((i) => Number(i.dose_per_time) > 0 && Number(i.times_per_day) >= 1 && Number(i.days) >= 1);
  const ev = hasValid ? evRaw : null;

  // Kiểm tra ngay khi thêm/sửa từng thuốc
  useEffect(() => {
    const valid = items.filter((i) => Number(i.dose_per_time) > 0 && Number(i.times_per_day) >= 1 && Number(i.days) >= 1);
    if (!valid.length) return;
    const t = setTimeout(() => {
      api<RxEvaluation>("/api/doctor/prescriptions/check", { auth: "staff", body: { items: valid.map(toBody) } })
        .then(setEv).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [items]);

  const lineOf = (it: Item) => {
    const valid = items.filter((i) => Number(i.dose_per_time) > 0 && Number(i.times_per_day) >= 1 && Number(i.days) >= 1);
    const idx = valid.indexOf(it);
    return idx >= 0 ? ev?.lines[idx] : undefined;
  };
  const lineWarn = (it: Item) => {
    const valid = items.filter((i) => Number(i.dose_per_time) > 0 && Number(i.times_per_day) >= 1 && Number(i.days) >= 1);
    const idx = valid.indexOf(it);
    const ws = ev?.warnings.filter((w) => w.lines.includes(idx)) ?? [];
    return ws.some((w) => w.type === "OVERDOSE") ? "danger" : ws.length ? "warn" : null;
  };

  function update(key: number, patch: Partial<Item>) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    markDirty();
  }

  function add(m: Med) {
    setItems((xs) => [...xs, { key: ++k, medicine_id: m.id, name: m.name, unit: m.unit,
      ingredients: m.ingredients.map((i) => `${i.name} ${num(i.amount)}${i.unit}`).join(" + "),
      dose_per_time: "1", times_per_day: "2", days: "5", timing: "SAU_AN", note: "" }]);
    markDirty();
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/doctor/cases/${caseId}/prescription`, { method: "PUT", auth: "staff",
        body: { items: items.map(toBody), duplicate_ack: ack, overdose_reason: reason || null } });
      setDirty(false);
      onDirty(false);
      toast("Đã lưu đơn thuốc", { tone: "ok" });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const dup = ev?.warnings.filter((w) => w.type === "DUPLICATE") ?? [];
  const over = ev?.warnings.filter((w) => w.type === "OVERDOSE") ?? [];
  const blocked = (dup.length > 0 && !ack) || (over.length > 0 && reason.trim().length < 5);

  if (!editable) {
    return items.length ? (
      <div>
        <RxTable items={items} lineOf={lineOf} lineWarn={lineWarn} />
        {initial?.overdose_reason && <Alert tone="danger" className="mt-3" title="Lý do kê vượt liều đã ghi">{initial.overdose_reason}</Alert>}
        <p className="mt-3 text-right font-semibold">Tổng tiền thuốc: <span className="num text-lg">{vnd(initial?.total_amount)}</span></p>
      </div>
    ) : <p className="text-ink-3">Không kê thuốc.</p>;
  }

  return (
    <div>
      <MedSearch onPick={add} />
      {items.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-[14.5px]">
            <thead>
              <tr className="border-b border-line text-left bg-paper text-[12.5px] font-semibold text-ink-3">
                <th className="py-2 pr-2">Thuốc</th>
                <th className="w-[84px] px-1 py-2">Liều/lần</th>
                <th className="w-[84px] px-1 py-2">Lần/ngày</th>
                <th className="w-[84px] px-1 py-2">Số ngày</th>
                <th className="w-[150px] px-1 py-2">Thời điểm</th>
                <th className="w-[80px] px-2 py-2 text-right">SL</th>
                <th className="w-[110px] px-2 py-2 text-right">Thành tiền</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const l = lineOf(it);
                const w = lineWarn(it);
                return (
                  <tr key={it.key} className={cx("border-b border-line-2 align-top", w === "danger" && "bg-danger-tint/60", w === "warn" && "bg-warn-tint/60")}>
                    <td className={cx("border-l-[3px] py-2 pr-2 pl-2", w === "danger" ? "border-danger" : w === "warn" ? "border-warn-line" : "border-transparent")}>
                      <p className="font-semibold">{it.name}</p>
                      <p className="text-[12.5px] text-ink-3">{l ? l.ingredients.map((i) => `${i.name} ${num(i.amount)}${i.unit}`).join(" + ") : it.ingredients}</p>
                    </td>
                    {(["dose_per_time", "times_per_day", "days"] as const).map((f) => (
                      <td key={f} className="px-1 py-2">
                        <input aria-label={f} inputMode="decimal" value={it[f]}
                          onChange={(e) => update(it.key, { [f]: e.target.value.replace(",", ".").replace(/[^\d.]/g, "") })}
                          className="field-input num !min-h-9 !px-2 !py-1 text-center" />
                      </td>
                    ))}
                    <td className="px-1 py-2">
                      <select aria-label="Thời điểm dùng" value={it.timing} onChange={(e) => update(it.key, { timing: e.target.value })} className="field-input !min-h-9 !px-2 !py-1 text-[14px]">
                        {TIMINGS.map(([v, l2]) => <option key={v} value={v}>{l2}</option>)}
                      </select>
                    </td>
                    <td className="num px-2 py-2 text-right font-semibold">{l ? `${l.quantity}` : "—"}<span className="ml-1 text-[12px] font-normal text-ink-3">{it.unit}</span></td>
                    <td className="num px-2 py-2 text-right">{l ? vnd(l.amount) : "—"}</td>
                    <td className="py-2 text-right">
                      <button aria-label={`Xóa ${it.name}`} onClick={() => { setItems((xs) => xs.filter((x) => x.key !== it.key)); markDirty(); }}
                        className="rounded p-1.5 text-ink-3 hover:bg-danger-tint hover:text-danger"><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-[12.5px] text-ink-3">Số lượng = liều mỗi lần × số lần/ngày × số ngày (làm tròn lên). Thành tiền = số lượng × đơn giá.</p>
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-line px-4 py-6 text-center text-ink-3">Chưa có thuốc. Tìm theo tên thuốc hoặc hoạt chất ở ô trên.</p>
      )}

      {(dup.length > 0 || over.length > 0) && (
        <div className="mt-4 space-y-3">
          {over.map((w, i) => (
            <div key={`o${i}`} role="alert" className="rounded-lg border border-danger/50 bg-danger-tint p-3">
              <p className="flex items-start gap-2 font-semibold text-danger"><CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />{w.message}</p>
            </div>
          ))}
          {over.length > 0 && (
            <div className="rounded-md border border-danger/40 bg-surface p-3">
              <label htmlFor="od" className="text-sm font-semibold">Lý do kê vượt liều <span className="text-danger">*</span> <span className="font-normal text-ink-3">— được lưu vào đơn</span></label>
              <Textarea id="od" rows={2} className="mt-1.5" value={reason} onChange={(e) => { setReason(e.target.value); markDirty(); }} placeholder="Ví dụ: sốt cao, theo dõi chức năng gan, giảm liều sau 2 ngày" aria-invalid={reason.trim().length < 5} />
            </div>
          )}
          {dup.map((w, i) => (
            <div key={`d${i}`} className="rounded-md border border-warn-line bg-warn-tint p-3">
              <p className="flex items-start gap-2 font-semibold"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />{w.message}</p>
            </div>
          ))}
          {dup.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-warn-line bg-surface p-3">
              <input type="checkbox" checked={ack} onChange={(e) => { setAck(e.target.checked); markDirty(); }} className="mt-0.5 size-5 accent-[#875100]" />
              <span className="text-[15px]">Tôi xác nhận giữ cả các thuốc trùng hoạt chất trong đơn.</span>
            </label>
          )}
        </div>
      )}

      {err && <Alert tone="danger" className="mt-3">{err}</Alert>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-4">
        <p className="font-semibold">Tổng tiền thuốc <span className="num ml-2 text-[20px]">{vnd(ev?.total ?? 0)}</span></p>
        <div className="flex items-center gap-3">
          {dirty ? <span className="text-sm font-semibold text-warn">Chưa lưu</span> : initial && <span className="text-sm text-ink-3">Đã lưu</span>}
          <Button onClick={save} loading={busy} disabled={blocked || !dirty} title={blocked ? "Cần xác nhận cảnh báo trước khi lưu" : undefined}>Lưu đơn thuốc</Button>
        </div>
      </div>
    </div>
  );
}

function toBody(i: Item) {
  return { medicine_id: i.medicine_id, dose_per_time: Number(i.dose_per_time), times_per_day: Math.round(Number(i.times_per_day)),
    days: Math.round(Number(i.days)), timing: i.timing, note: i.note || null };
}

function RxTable({ items, lineOf, lineWarn }: { items: Item[]; lineOf: (i: Item) => RxEvaluation["lines"][number] | undefined; lineWarn: (i: Item) => string | null }) {
  return (
    <table className="w-full text-[14.5px]">
      <thead>
        <tr className="border-b border-line text-left bg-paper text-[12.5px] font-semibold text-ink-3">
          <th className="py-2">Thuốc</th><th className="py-2">Cách dùng</th><th className="py-2 text-right">SL</th><th className="py-2 text-right">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const l = lineOf(it);
          const w = lineWarn(it);
          return (
            <tr key={it.key} className={cx("border-b border-line-2", w === "danger" && "bg-danger-tint/50", w === "warn" && "bg-warn-tint/50")}>
              <td className="py-2 font-semibold">{it.name}</td>
              <td className="py-2 text-ink-2">{it.dose_per_time} {it.unit} × {it.times_per_day} lần/ngày × {it.days} ngày · {TIMINGS.find((t) => t[0] === it.timing)?.[1]}</td>
              <td className="num py-2 text-right">{l?.quantity ?? "—"} {it.unit}</td>
              <td className="num py-2 text-right">{l ? vnd(l.amount) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MedSearch({ onPick }: { onPick: (m: Med) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Med[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api<Med[]>(`/api/catalog/medicines?q=${encodeURIComponent(q)}`, { auth: "staff" }).then((r) => { setRes(r); setHi(0); }).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  function pick(m: Med) {
    onPick(m);
    setQ("");
    setOpen(false);
  }
  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, res.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter" && res[hi]) { e.preventDefault(); pick(res[hi]); }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Thêm thuốc: gõ tên thuốc hoặc hoạt chất (vd: para, amox)…" aria-label="Tìm thuốc"
        className="field-input !pl-9" role="combobox" aria-expanded={open} aria-controls="med-list" />
      {open && res.length > 0 && (
        <ul id="med-list" role="listbox" className="absolute z-30 mt-1 max-h-[320px] w-full overflow-y-auto rounded-md border border-line bg-surface shadow-[0_12px_32px_rgba(15,27,42,0.16)]">
          {res.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === hi}>
              <button type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(m)}
                className={cx("flex w-full items-center gap-3 px-3 py-2 text-left", i === hi && "bg-brand-tint")}>
                <Plus className="size-4 text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{m.name} <span className="font-normal text-ink-3">· {m.dosage_form}</span></span>
                  <span className="block text-[12.5px] text-ink-3">{m.ingredients.map((x) => `${x.name} ${num(x.amount)}${x.unit}`).join(" + ")}</span>
                </span>
                <span className="num text-sm text-ink-2">{vnd(m.unit_price)}/{m.unit}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";
import { FileText, History } from "lucide-react";
import { AmendedTag, Panel, cx } from "./ui";
import { dateTime, dmy, num, vnd } from "@/lib/format";
import type { AuditT, LabOrderT, PrescriptionT, RecordT } from "@/lib/types";

const SESSIONS = ["Sáng", "Trưa", "Chiều", "Tối"];

export function MedSchedule({ rx }: { rx: PrescriptionT }) {
  const extra = rx.schedule.some((r) => r.sessions.some((s) => !SESSIONS.includes(s)));
  const cols = extra ? [...SESSIONS, "Trước ngủ"] : SESSIONS;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[15px]">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className="py-2 pr-3 font-semibold">Thuốc</th>
            {cols.map((c) => <th key={c} className="w-[86px] px-2 py-2 text-center font-semibold">{c}</th>)}
            <th className="py-2 pl-2 font-semibold">Cách dùng</th>
          </tr>
        </thead>
        <tbody>
          {rx.schedule.map((r, i) => (
            <tr key={i} className="border-b border-line-2 align-top">
              <td className="py-2.5 pr-3"><p className="font-semibold">{r.medicine}</p><p className="text-sm text-ink-3">{r.days} ngày</p></td>
              {cols.map((c) => (
                <td key={c} className="px-2 py-2.5 text-center">
                  {r.sessions.includes(c) ? (
                    <span className="inline-flex min-w-[52px] flex-col items-center rounded-md bg-brand-tint px-1.5 py-1">
                      <span className="num font-bold text-brand-strong">{num(r.dose)}</span>
                      <span className="text-[11.5px] text-ink-2">{r.unit}</span>
                    </span>
                  ) : <span className="text-line" aria-label="Không uống">—</span>}
                </td>
              ))}
              <td className="py-2.5 pl-2 text-ink-2">{r.timing}{r.note ? ` · ${r.note}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LabResultView({ o, compact }: { o: LabOrderT; compact?: boolean }) {
  const r = o.result;
  return (
    <div className={cx("rounded-md border border-line", compact ? "p-3" : "p-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{o.service.name}</p>
        {r?.is_amended && <AmendedTag />}
        <span className="ml-auto text-sm text-ink-3">{o.department.name}{o.completed_at ? ` · ${dateTime(o.completed_at)}` : ""}</span>
      </div>
      {r?.note && <p className="mt-2 text-[15px] whitespace-pre-wrap">{r.note}</p>}
      {!!r?.files?.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.files.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-md border border-line hover:border-brand/50">
              {f.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.name || "Ảnh kết quả"} className="h-24 w-32 bg-paper object-cover" />
              ) : (
                <span className="flex h-24 w-32 flex-col items-center justify-center gap-1 bg-paper text-sm text-ink-2"><FileText className="size-6" aria-hidden />PDF</span>
              )}
            </a>
          ))}
        </div>
      )}
      {!r?.note && !r?.files?.length && <p className="mt-2 text-sm text-ink-3">Chưa có kết quả</p>}
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  diagnosis: "Chẩn đoán", advice: "Lời dặn", clinical_notes: "Khám lâm sàng", follow_up_date: "Ngày tái khám", note: "Nhận xét", files: "File kết quả",
};

export function AmendHistory({ items }: { items: AuditT[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-3">
      {items.map((h) => (
        <div key={h.id} className="rounded-md border border-warn-line bg-warn-tint/50 p-3 text-[14.5px]">
          <p className="flex flex-wrap items-center gap-x-2 font-semibold">
            <History className="size-4 text-warn" aria-hidden />
            {h.entity_type === "LAB_RESULT" ? "Sửa kết quả cận lâm sàng" : "Sửa bệnh án"}
            <span className="font-normal text-ink-3">· {h.actor_name} · {dateTime(h.created_at)}</span>
          </p>
          <p className="mt-1"><span className="text-ink-3">Lý do:</span> {h.reason}</p>
          <div className="mt-2 grid gap-1">
            {Object.keys(h.new_value ?? {}).map((k) => (
              <div key={k} className="grid gap-x-3 sm:grid-cols-[120px_1fr]">
                <span className="text-ink-3">{FIELD_LABEL[k] ?? k}</span>
                <span>
                  <del className="text-ink-3">{fmt(h.old_value?.[k])}</del>
                  <span className="mx-1.5 text-ink-3">→</span>
                  <ins className="font-medium no-underline">{fmt(h.new_value?.[k])}</ins>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(trống)";
  if (Array.isArray(v)) return `${v.length} file`;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dmy(v);
  return String(v);
}

export function VisitBody({ record, labs, rx, amendments, showSchedule = true }: {
  record: RecordT | null; labs: LabOrderT[]; rx: PrescriptionT | null; amendments: AuditT[]; showSchedule?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Panel eyebrow="Kết luận của bác sĩ" title={<span className="flex flex-wrap items-center gap-2">{record?.diagnosis ?? "—"}{record?.is_amended && <AmendedTag />}</span>}>
        <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
          <div className="sm:col-span-2"><dt className="text-sm text-ink-3">Lời dặn</dt><dd className="whitespace-pre-wrap">{record?.advice || "—"}</dd></div>
          <div><dt className="text-sm text-ink-3">Ngày tái khám</dt><dd className="font-semibold">{record?.follow_up_date ? dmy(record.follow_up_date) : "Không hẹn"}</dd></div>
        </dl>
      </Panel>
      {rx && rx.items.length > 0 && showSchedule && (
        <Panel title="Lịch uống thuốc" eyebrow="Theo đơn của bác sĩ" actions={<span className="text-sm text-ink-3">Tổng {vnd(rx.total_amount)}</span>}>
          <MedSchedule rx={rx} />
        </Panel>
      )}
      {labs.length > 0 && (
        <Panel title="Kết quả cận lâm sàng" eyebrow="Xét nghiệm, chẩn đoán hình ảnh">
          <div className="grid gap-3">{labs.map((o) => <LabResultView key={o.id} o={o} />)}</div>
        </Panel>
      )}
      {amendments.length > 0 && (
        <Panel title="Lịch sử chỉnh sửa">
          <AmendHistory items={amendments} />
        </Panel>
      )}
    </div>
  );
}

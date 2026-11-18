"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Bot, ChevronLeft, CircleCheck, CircleX, FlaskConical, History, Lock, Pencil, ShieldAlert } from "lucide-react";
import { RxEditor } from "@/components/rx-editor";
import { StaffShell } from "@/components/staff-shell";
import { Alert, AmendedTag, Button, Dialog, Field, Forbidden, Input, LabTag, Panel, Segmented, Select, Spinner, StatusTag, Textarea, URGENCY, UrgencyTag, cx } from "@/components/ui";
import { AmendHistory, LabResultView } from "@/components/visit-view";
import { toast } from "@/components/toast";
import { ApiError, api, errMsg } from "@/lib/api";
import { dateTime, dmy, genderLabel, num, todayISO, vnd } from "@/lib/format";
import { useStaffEvents } from "@/lib/hooks";
import type { Appointment, AuditT, ChatMessage, LabOrderT, Patient, PrescriptionT, RecordT, RedFlag, Specialty, Visit, Vitals } from "@/lib/types";

interface Case {
  appointment: Appointment; patient: Patient; record: RecordT | null; lab_orders: LabOrderT[]; prescription: PrescriptionT | null;
  history: Visit[]; audit: AuditT[]; can_edit: boolean;
  triage: null | { id: string; result: { chuyen_khoa: string; muc_do: keyof typeof URGENCY; tom_tat: string; ly_do: string; nguon?: string } | null;
    vitals: Vitals; red_flags: RedFlag[]; urgency: keyof typeof URGENCY | null; rag_context: { name: string; specialty_hint: string; score: number }[];
    messages: ChatMessage[]; provider: string | null; specialty: string | null; feedback: { correct: boolean; specialty_id: number | null } | null };
}

const LIFECYCLE = [["CHECKED_IN", "Check-in"], ["IN_CONSULTATION", "Đang khám"], ["WAITING_LAB", "Chờ CLS"], ["COMPLETED", "Chốt ca"], ["PAID", "Thanh toán"]];
const PROVIDER: Record<string, string> = { rules: "luật cứng", offline: "offline", llm: "LLM", fallback: "dự phòng" };

export default function Page() {
  return <StaffShell roles={["DOCTOR"]} full>{() => <Suspense fallback={<Spinner />}><CaseView /></Suspense>}</StaffShell>;
}

function CaseView() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<Case | null>(null);
  const [err, setErr] = useState<{ status: number; msg: string } | null>(null);
  const [rxDirty, setRxDirty] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      setC(await api<Case>(`/api/doctor/cases/${id}`, { auth: "staff" }));
    } catch (e) {
      setErr({ status: e instanceof ApiError ? e.status : 0, msg: errMsg(e) });
    }
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() bất đồng bộ: setState chạy sau await
  useEffect(() => { load(); }, [load]);
  useStaffEvents({
    lab_done: (d) => {
      if (Number(d.appointment_id) !== Number(id)) return;
      toast(`Đã có kết quả ${d.service}`, { tone: "ok", body: d.case_ready ? "Mọi phiếu CLS đã xong, ca đã quay về trạng thái Đang khám" : undefined });
      load();
    },
    lab_amended: (d) => { if (Number(d.appointment_id) === Number(id)) { toast(`Kết quả ${d.service} vừa được chỉnh sửa`); load(); } },
  });

  if (err) return err.status === 403 ? <Forbidden message={err.msg} back={<Link href="/nhan-vien/bac-si" className="font-semibold text-brand underline">Về danh sách khám</Link>} /> : <Alert tone="danger">{err.msg}</Alert>;
  if (!c) return <Spinner />;
  const a = c.appointment;
  const p = c.patient;

  async function openCase() {
    setOpening(true);
    try {
      await api(`/api/doctor/cases/${a.id}/open`, { method: "POST", auth: "staff" });
      load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setOpening(false);
    }
  }

  const stage = LIFECYCLE.findIndex(([s]) => s === a.status);
  const pendingLabs = c.lab_orders.filter((o) => o.status === "ORDERED" || o.status === "IN_PROGRESS");
  return (
    <>
      <Link href="/nhan-vien/bac-si" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Danh sách khám</Link>

      <header className="mb-5 rounded-lg border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em]">{p.full_name}</h1>
              <StatusTag status={a.status} />
              <UrgencyTag u={a.urgency} />
            </div>
            <p className="mt-1 text-ink-2">
              {genderLabel(p.gender)} · {p.age} tuổi (sinh {p.birth_year}) · <span className="num">{p.phone}</span> · Hẹn <b className="num">{a.slot}</b> {dmy(a.date)} · Mã <span className="mono">{a.code}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {a.status === "CHECKED_IN" && <Button size="lg" loading={opening} onClick={openCase}>Mở ca khám</Button>}
            {(a.status === "IN_CONSULTATION" || a.status === "WAITING_LAB") && (
              <Button size="lg" variant={a.status === "WAITING_LAB" ? "secondary" : "primary"} onClick={() => setCompleteOpen(true)}>
                <Lock className="size-4" aria-hidden />Chốt ca
              </Button>
            )}
            {(a.status === "COMPLETED" || a.status === "PAID") && c.record?.is_locked && (
              <Button variant="secondary" onClick={() => setAmendOpen(true)}><Pencil className="size-4" aria-hidden />Sửa bệnh án (cần lý do)</Button>
            )}
          </div>
        </div>
        <ol className="flex overflow-x-auto border-t border-line text-[13px] font-medium" aria-label="Tiến trình ca khám">
          {LIFECYCLE.map(([s, label], i) => (
            <li key={s} className={cx("flex flex-1 items-center gap-2 px-4 py-2 whitespace-nowrap",
              i < stage && "bg-ok-tint/60 text-ok", i === stage && "bg-brand font-semibold text-white", i > stage && "text-ink-3")}>
              <span className={cx("num flex size-5 items-center justify-center rounded-full text-[11px] font-bold", i === stage ? "bg-white/20" : i < stage ? "bg-ok/15" : "bg-paper-2")}>{i + 1}</span>{label}
            </li>
          ))}
        </ol>
      </header>

      {a.status === "WAITING_LAB" && (
        <Alert tone="info" className="mb-5" icon={<FlaskConical className="size-5 text-lab" />} title={`Đang chờ ${pendingLabs.length} kết quả cận lâm sàng`}>
          Bệnh án tạm khóa trong lúc chờ. Khi mọi phiếu hoàn thành, ca tự quay về trạng thái Đang khám và bạn nhận được thông báo.
        </Alert>
      )}
      {a.status === "CHECKED_IN" && <Alert tone="info" className="mb-5" title="Bệnh nhân đang chờ trước phòng">Bấm “Mở ca khám” để bắt đầu ghi bệnh án.</Alert>}

      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <div className="flex flex-col gap-5">
          <AiSummary c={c} />
          <HistoryPanel items={c.history} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <RecordPanel key={JSON.stringify([c.record, c.can_edit])} c={c} onSaved={load} />
          <LabPanel c={c} onChange={load} />
          <Panel title="Đơn thuốc" eyebrow="Tự kiểm tra trùng hoạt chất và tổng liều trong ngày" actions={c.prescription?.is_locked ? <span className="flex items-center gap-1 text-sm text-ink-3"><Lock className="size-4" aria-hidden />Đã khóa</span> : null}>
            <RxEditor key={`${c.prescription?.id ?? "new"}-${c.can_edit}`} caseId={a.id} initial={c.prescription} editable={c.can_edit} onSaved={load} onDirty={setRxDirty} />
          </Panel>
          <AuditPanel items={c.audit} />
        </div>
      </div>

      {completeOpen && <CompleteDialog open c={c} rxDirty={rxDirty} onClose={() => setCompleteOpen(false)} onDone={() => { setCompleteOpen(false); load(); }} />}
      {c.record && amendOpen && <AmendDialog open caseId={a.id} record={c.record} onClose={() => setAmendOpen(false)} onDone={() => { setAmendOpen(false); load(); }} />}
    </>
  );
}

function AiSummary({ c }: { c: Case }) {
  const t = c.triage;
  if (!t?.result) {
    return (
      <Panel title="Tóm tắt trước khám" eyebrow={c.appointment.is_general ? "Khám tổng quát, không qua trợ lý" : "Đặt lịch trực tiếp, không qua trợ lý"}>
        <p className="text-ink-2">
          {c.appointment.is_general
            ? "Bệnh nhân chọn khám tổng quát, không trò chuyện với trợ lý. Hệ thống gán chuyên khoa Nội tổng quát."
            : `Bệnh nhân tự chọn chuyên khoa ${c.appointment.specialty.name} khi đặt lịch, không trò chuyện với trợ lý. Hỏi bệnh từ đầu.`}
        </p>
      </Panel>
    );
  }
  const r = t.result;
  const v = t.vitals ?? {};
  return (
    <Panel title="Tóm tắt trước khám"
      eyebrow={<span className="flex items-center gap-1.5"><Bot className="size-3.5" aria-hidden />Gợi ý {r.chuyen_khoa} · nguồn {PROVIDER[t.provider ?? ""] ?? t.provider}</span>} actions={<UrgencyTag u={t.urgency} />} tone={t.red_flags?.length ? "danger" : "default"}>
      <p className="text-[16px] leading-relaxed font-semibold">{r.tom_tat}</p>
      {t.red_flags?.length > 0 && (
        <div className="mt-3 rounded-md border border-danger/40 bg-danger-tint p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-danger"><ShieldAlert className="size-4" aria-hidden />Dấu hiệu đỏ (luật cứng)</p>
          <ul className="mt-1 space-y-0.5 text-[14.5px]">{t.red_flags.map((f) => <li key={f.group}>• {f.finding} — {f.suspect}</li>)}</ul>
        </div>
      )}
      {(v.bp || v.temp || v.spo2) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {v.bp && <Chip k="Huyết áp" v={`${v.bp.systolic}/${v.bp.diastolic}`} />}
          {v.temp && <Chip k="Nhiệt độ" v={`${num(v.temp)}°C`} />}
          {v.spo2 && <Chip k="SpO2" v={`${v.spo2}%`} />}
        </div>
      )}
      <p className="mt-3 text-[14.5px] text-ink-2">{r.ly_do}</p>
      {t.rag_context?.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-1.5">Tham chiếu tri thức (ViMedical)</p>
          <ul className="space-y-1 text-[13.5px]">
            {t.rag_context.map((h) => (
              <li key={h.name} className="flex items-center gap-2">
                <span className="h-1.5 shrink-0 rounded-full bg-brand" style={{ width: `${Math.max(6, h.score * 60)}px` }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                <span className="text-ink-3">{h.specialty_hint}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-4 rounded-md border border-line-2">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Hội thoại gốc ({t.messages.filter((m) => m.role === "user").length} lượt)</summary>
        <div className="space-y-2 border-t border-line-2 px-3 py-2 text-[13.5px]">
          {t.messages.filter((m) => m.kind !== "result" && m.kind !== "emergency").map((m, i) => (
            <p key={i}><b className={m.role === "user" ? "text-brand-strong" : "text-ink-3"}>{m.role === "user" ? "BN" : "Trợ lý"}:</b> {m.text}</p>
          ))}
        </div>
      </details>
      {t.feedback && (
        <p className="mt-3 text-sm text-ink-3">Đánh giá khi chốt ca: {t.feedback.correct ? "chuyên khoa phù hợp ✓" : "chuyên khoa chưa phù hợp"}</p>
      )}
    </Panel>
  );
}

function Chip({ k, v }: { k: string; v: string }) {
  return <span className="inline-flex items-baseline gap-1.5 rounded-md border border-line bg-paper px-2.5 py-1 text-sm"><span className="text-ink-3">{k}</span><b className="num">{v}</b></span>;
}

function HistoryPanel({ items }: { items: Visit[] }) {
  return (
    <Panel title="Lịch sử khám" eyebrow={items.length ? `${items.length} lần khám trước` : "Chưa có lần khám trước"}>
      {items.length === 0 ? <p className="text-sm text-ink-3">Đây là lần đầu bệnh nhân khám tại phòng khám.</p> : (
        <ul className="space-y-2">
          {items.map((h) => (
            <li key={h.id}>
              <details className="rounded-md border border-line">
                <summary className="flex cursor-pointer items-start gap-3 px-3 py-2">
                  <span className="num pt-0.5 text-sm text-ink-3">{dmy(h.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{h.record?.diagnosis ?? "—"}</span>
                    <span className="text-[13px] text-ink-3">{h.specialty.name} · {h.doctor.full_name}</span>
                  </span>
                </summary>
                <div className="space-y-2 border-t border-line-2 px-3 py-2 text-[14px]">
                  {h.record?.advice && <p><span className="text-ink-3">Lời dặn:</span> {h.record.advice}</p>}
                  {h.prescription?.items.length ? (
                    <div><p className="text-ink-3">Đơn thuốc:</p>
                      <ul className="ml-4 list-disc">{h.prescription.items.map((x) => <li key={x.medicine_id}>{x.name} — {num(x.dose_per_time)} {x.unit} × {x.times_per_day} lần × {x.days} ngày</li>)}</ul>
                    </div>
                  ) : null}
                  {h.lab_orders.map((o) => <LabResultView key={o.id} o={o} compact />)}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

interface DiseaseHit { id: number; name: string; specialty_hint: string }

function RecordPanel({ c, onSaved }: { c: Case; onSaved: () => void }) {
  const r = c.record;
  const [f, setF] = useState({ clinical_notes: r?.clinical_notes ?? "", diagnosis: r?.diagnosis ?? "", diagnosis_kb_id: r?.diagnosis_kb_id ?? null as number | null, advice: r?.advice ?? "", follow_up_date: r?.follow_up_date ?? "" });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<DiseaseHit[]>([]);
  const [showHits, setShowHits] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!c.can_edit || query.trim().length < 2) return;
    const t = setTimeout(() => api<DiseaseHit[]>(`/api/catalog/diseases?q=${encodeURIComponent(query)}`, { auth: "staff" }).then(setHits).catch(() => {}), 220);
    return () => clearTimeout(t);
  }, [query, c.can_edit]);
  const shownHits = query.trim().length >= 2 ? hits : [];

  const set = (k: string, v: string | number | null) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };
  async function save() {
    setBusy(true);
    try {
      await api(`/api/doctor/cases/${c.appointment.id}/record`, { method: "PUT", auth: "staff",
        body: { ...f, follow_up_date: f.follow_up_date || null, diagnosis_kb_id: f.diagnosis_kb_id } });
      setDirty(false);
      toast("Đã lưu bệnh án", { tone: "ok" });
      onSaved();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }
  const ro = !c.can_edit;
  return (
    <Panel title={<span className="flex items-center gap-2">Bệnh án{r?.is_amended && <AmendedTag />}</span>} eyebrow="Khám lâm sàng, chẩn đoán và lời dặn"
      actions={r?.is_locked ? <span className="flex items-center gap-1 text-sm text-ink-3"><Lock className="size-4" aria-hidden />Đã khóa {dateTime(r.locked_at)}</span> : null}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Khám lâm sàng" htmlFor="cn" className="lg:col-span-2">
          <Textarea id="cn" rows={3} disabled={ro} value={f.clinical_notes} onChange={(e) => set("clinical_notes", e.target.value)} placeholder="Mạch, huyết áp, nhiệt độ, triệu chứng thực thể…" />
        </Field>
        <Field label="Chẩn đoán" htmlFor="dg" required hint={ro ? undefined : "Chọn từ cơ sở tri thức bệnh hoặc nhập tự do"} className="relative lg:col-span-2">
          <Input id="dg" disabled={ro} value={f.diagnosis} autoComplete="off"
            onChange={(e) => { set("diagnosis", e.target.value); set("diagnosis_kb_id", null); setQuery(e.target.value); setShowHits(true); }}
            onFocus={() => setShowHits(true)} onBlur={() => setTimeout(() => setShowHits(false), 150)} />
          {showHits && shownHits.length > 0 && (
            <ul className="absolute top-[72px] z-20 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-[0_12px_32px_rgba(15,27,42,0.16)]">
              {shownHits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="flex w-full justify-between px-3 py-2 text-left hover:bg-brand-tint"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setF((x) => ({ ...x, diagnosis: h.name, diagnosis_kb_id: h.id })); setDirty(true); setShowHits(false); setQuery(""); }}>
                    <span className="font-medium">{h.name}</span><span className="text-sm text-ink-3">{h.specialty_hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <Field label="Lời dặn" htmlFor="ad">
          <Textarea id="ad" rows={3} disabled={ro} value={f.advice} onChange={(e) => set("advice", e.target.value)} placeholder="Chế độ ăn, nghỉ ngơi, dấu hiệu cần quay lại…" />
        </Field>
        <Field label="Ngày tái khám" htmlFor="fu" hint="Email nhắc trước 1 ngày">
          <Input id="fu" type="date" disabled={ro} min={todayISO()} value={f.follow_up_date} onChange={(e) => set("follow_up_date", e.target.value)} />
        </Field>
      </div>
      {!ro && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {dirty && <span className="text-sm font-semibold text-warn">Chưa lưu</span>}
          <Button onClick={save} loading={busy} disabled={!dirty}>Lưu bệnh án</Button>
        </div>
      )}
    </Panel>
  );
}

interface Svc { id: number; name: string; price: number; department: { id: number; name: string } }

function LabPanel({ c, onChange }: { c: Case; onChange: () => void }) {
  const [svcs, setSvcs] = useState<Svc[] | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<LabOrderT | null>(null);
  const [reason, setReason] = useState("");
  const active = new Set(c.lab_orders.filter((o) => o.status !== "CANCELLED").map((o) => o.service.id));
  const canCancel = ["IN_CONSULTATION", "WAITING_LAB"].includes(c.appointment.status);

  async function send() {
    setBusy(true);
    try {
      await api(`/api/doctor/cases/${c.appointment.id}/lab-orders`, { auth: "staff", body: { service_ids: sel, note: note || null } });
      toast(`Đã gửi ${sel.length} phiếu chỉ định`, { tone: "ok", body: "Phiếu vào hàng chờ của từng phòng" });
      setSel([]); setNote(""); setSvcs(null);
      onChange();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!cancelling) return;
    setBusy(true);
    try {
      await api(`/api/doctor/lab-orders/${cancelling.id}/cancel`, { auth: "staff", body: { reason } });
      setCancelling(null); setReason("");
      onChange();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }
  const groups = svcs ? Object.entries(svcs.reduce<Record<string, Svc[]>>((m, s) => ((m[s.department.name] ??= []).push(s), m), {})) : [];
  const total = svcs?.filter((s) => sel.includes(s.id)).reduce((t, s) => t + s.price, 0) ?? 0;

  return (
    <Panel title="Cận lâm sàng" eyebrow="Chỉ định và kết quả"
      actions={c.can_edit && !svcs ? <Button size="sm" variant="secondary" onClick={() => api<Svc[]>("/api/catalog/lab-services", { auth: "staff" }).then(setSvcs)}><FlaskConical className="size-4" aria-hidden />Chỉ định</Button> : null}>
      {svcs && (
        <div className="mb-4 rounded-lg border border-lab/30 bg-lab-tint/40 p-4">
          <p className="mb-3 text-sm text-ink-2">Phiếu được gửi vào hàng chờ của <b>phòng</b> thực hiện. Kỹ thuật viên đang trực sẽ nhận phiếu.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {groups.map(([dept, list]) => (
              <fieldset key={dept}>
                <legend className="eyebrow mb-1.5">{dept}</legend>
                <div className="space-y-1">
                  {list.map((s) => {
                    const used = active.has(s.id);
                    return (
                      <label key={s.id} className={cx("flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-surface", used && "cursor-not-allowed opacity-50")}>
                        <input type="checkbox" disabled={used} checked={sel.includes(s.id)} className="mt-1 size-4 accent-[#56479a]"
                          onChange={(e) => setSel((x) => (e.target.checked ? [...x, s.id] : x.filter((y) => y !== s.id)))} />
                        <span className="flex-1 text-[14.5px]">{s.name}{used && " (đã chỉ định)"}</span>
                        <span className="num text-[13px] text-ink-3">{num(s.price / 1000)}k</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <Field label="Yêu cầu / ghi chú cho kỹ thuật viên" className="mt-3"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: đau ngực khi gắng sức, loại trừ thiếu máu cơ tim" /></Field>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-sm">Phí CLS: <b className="num">{vnd(total)}</b></span>
            <Button variant="secondary" onClick={() => { setSvcs(null); setSel([]); }}>Đóng</Button>
            <Button disabled={!sel.length} loading={busy} onClick={send}>Gửi {sel.length || ""} phiếu chỉ định</Button>
          </div>
        </div>
      )}
      {c.lab_orders.length === 0 ? <p className="text-ink-3">Chưa chỉ định cận lâm sàng.</p> : (
        <ul className="space-y-3">
          {c.lab_orders.map((o) => (
            <li key={o.id} className={cx("rounded-md border p-3", o.status === "CANCELLED" ? "border-line-2 opacity-60" : "border-line")}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{o.service.name}</p>
                <LabTag status={o.status} label={o.status_label} />
                {o.result?.is_amended && <AmendedTag />}
                <span className="text-sm text-ink-3">{o.department.name}{o.technician ? ` · ${o.technician.full_name}` : ""}</span>
                {canCancel && (o.status === "ORDERED" || o.status === "IN_PROGRESS") && (
                  <Button size="sm" variant="ghost" className="ml-auto !text-danger" onClick={() => setCancelling(o)}>Hủy phiếu</Button>
                )}
              </div>
              {o.status === "CANCELLED" && <p className="mt-1 text-sm text-ink-3">Lý do hủy: {o.cancel_reason}</p>}
              {o.status === "DONE" && <div className="mt-2"><LabResultView o={o} compact /></div>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!cancelling} onClose={() => setCancelling(null)} size="sm" title={`Hủy phiếu ${cancelling?.service.name ?? ""}?`}
        footer={<><Button variant="secondary" onClick={() => setCancelling(null)}>Giữ phiếu</Button><Button variant="danger" disabled={reason.trim().length < 3} loading={busy} onClick={cancel}>Hủy phiếu</Button></>}>
        <Field label="Lý do hủy" required><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: bệnh nhân không đồng ý chụp" /></Field>
      </Dialog>
    </Panel>
  );
}

function AuditPanel({ items }: { items: AuditT[] }) {
  const amends = items.filter((i) => i.action === "AMEND");
  const steps = items.filter((i) => i.action !== "AMEND");
  return (
    <Panel title={<span className="flex items-center gap-2"><History className="size-4 text-ink-3" aria-hidden />Nhật ký ca khám</span>} eyebrow="Mọi thay đổi trạng thái và chỉnh sửa">
      {amends.length > 0 && <div className="mb-4"><AmendHistory items={amends} /></div>}
      <ol className="relative space-y-2 border-l-2 border-line-2 pl-4">
        {steps.map((s) => (
          <li key={s.id} className="text-[14px]">
            <span className="absolute -left-[5px] mt-1.5 size-2 rounded-full bg-ink-3" aria-hidden />
            <span className="num text-ink-3">{dateTime(s.created_at)}</span>{" "}
            <b>{s.entity_type === "LAB_ORDER" ? `Phiếu CLS #${s.entity_id}: ` : ""}{s.from_label ? `${s.from_label} → ` : ""}{s.to_label ?? s.action}</b>
            <span className="text-ink-3"> · {s.actor_name ?? ({ SYSTEM: "Hệ thống", GATEWAY: "Cổng thanh toán", KIOSK: "Kiosk" } as Record<string, string>)[s.actor_type] ?? s.actor_type}</span>
            {s.reason && <span className="block text-ink-2">{s.reason}</span>}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function CompleteDialog({ open, c, rxDirty, onClose, onDone }: { open: boolean; c: Case; rxDirty: boolean; onClose: () => void; onDone: () => void }) {
  const [correct, setCorrect] = useState<"yes" | "no" | "">("");
  const [specId, setSpecId] = useState("");
  const [specs, setSpecs] = useState<Specialty[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Specialty[]>("/api/public/specialties").then(setSpecs).catch(() => {}); }, []);
  const pending = c.lab_orders.filter((o) => o.status === "ORDERED" || o.status === "IN_PROGRESS");
  const hasAi = !!c.triage?.result;
  const diag = c.record?.diagnosis?.trim();

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ queue_number: number }>(`/api/doctor/cases/${c.appointment.id}/complete`, { auth: "staff",
        body: { ai_correct: hasAi ? correct === "yes" ? true : correct === "no" ? false : null : null, ai_specialty_id: correct === "no" ? Number(specId) || null : null } });
      toast(`Đã chốt ca · số thứ tự quầy thuốc ${r.queue_number}`, { tone: "ok", body: "Bệnh án và đơn thuốc đã khóa, đã chuyển sang quầy thuốc" });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Chốt ca khám"
      footer={<><Button variant="secondary" onClick={onClose}>Quay lại</Button><Button loading={busy} onClick={submit} disabled={hasAi && (!correct || (correct === "no" && !specId))}><Lock className="size-4" aria-hidden />Chốt ca &amp; khóa bệnh án</Button></>}>
      <ul className="space-y-2 text-[15px]">
        <Check ok={!!diag}>{diag ? <>Chẩn đoán: <b>{diag}</b></> : "Chưa ghi chẩn đoán (nhớ bấm Lưu bệnh án)"}</Check>
        <Check ok={!pending.length}>{pending.length ? <>Còn {pending.length} phiếu CLS chưa xong: {pending.map((o) => o.service.name).join(", ")}</> : "Cận lâm sàng: không có phiếu đang chờ"}</Check>
        <Check ok={!rxDirty}>{rxDirty ? "Đơn thuốc có thay đổi chưa lưu" : c.prescription?.items.length ? `Đơn thuốc: ${c.prescription.items.length} thuốc · ${vnd(c.prescription.total_amount)}` : "Không kê thuốc"}</Check>
      </ul>
      {hasAi && (
        <div className="mt-5 rounded-md border border-line bg-paper p-4">
          <p className="font-semibold">Chuyên khoa trợ lý AI gợi ý <span className="text-brand-strong">“{c.triage!.result!.chuyen_khoa}”</span> có phù hợp không?</p>
          <p className="mb-3 text-sm text-ink-3">Câu trả lời dùng để đo độ chính xác của AI theo từng chuyên khoa.</p>
          <Segmented value={correct as "yes" | "no"} onChange={setCorrect} size="lg" name="Đánh giá AI" options={[{ value: "yes", label: "Có, phù hợp" }, { value: "no", label: "Không phù hợp" }]} />
          {correct === "no" && (
            <Field label="Chuyên khoa đúng là" className="mt-3">
              <Select value={specId} onChange={(e) => setSpecId(e.target.value)}>
                <option value="">— Chọn chuyên khoa —</option>
                {specs.filter((s) => s.name !== c.triage!.result!.chuyen_khoa).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}
      <p className="mt-4 text-sm text-ink-3">Sau khi chốt, bệnh án và đơn thuốc bị khóa. Muốn sửa phải nhập lý do và hệ thống lưu lại bản cũ. Bệnh nhân được cấp số thứ tự quầy thuốc tự động.</p>
      {err && <Alert tone="danger" className="mt-4" title="Máy chủ từ chối chốt ca">{err}</Alert>}
    </Dialog>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">{ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden /> : <CircleX className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />}<span>{children}</span></li>
  );
}

function AmendDialog({ open, caseId, record, onClose, onDone }: { open: boolean; caseId: number; record: RecordT; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ diagnosis: record.diagnosis ?? "", advice: record.advice ?? "", clinical_notes: record.clinical_notes ?? "", follow_up_date: record.follow_up_date ?? "", reason: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/doctor/cases/${caseId}/amend`, { auth: "staff", body: { ...f, follow_up_date: f.follow_up_date || null } });
      toast("Đã sửa bệnh án, bản cũ được lưu trong nhật ký", { tone: "ok" });
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const s = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onClose={onClose} title="Sửa bệnh án đã khóa" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={busy} disabled={f.reason.trim().length < 5} onClick={submit}>Lưu chỉnh sửa</Button></>}>
      <Alert tone="warn" className="mb-4">Dữ liệu cũ không bị xóa. Bản mới được gắn nhãn “Đã chỉnh sửa”, bác sĩ và bệnh nhân xem được lịch sử thay đổi.</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lý do chỉnh sửa" required className="sm:col-span-2"><Input value={f.reason} onChange={s("reason")} placeholder="Ví dụ: bổ sung chẩn đoán sau khi có kết quả xét nghiệm" /></Field>
        <Field label="Chẩn đoán" className="sm:col-span-2"><Input value={f.diagnosis} onChange={s("diagnosis")} /></Field>
        <Field label="Khám lâm sàng" className="sm:col-span-2"><Textarea rows={2} value={f.clinical_notes} onChange={s("clinical_notes")} /></Field>
        <Field label="Lời dặn"><Textarea rows={2} value={f.advice} onChange={s("advice")} /></Field>
        <Field label="Ngày tái khám"><Input type="date" value={f.follow_up_date} onChange={s("follow_up_date")} /></Field>
      </div>
      {err && <Alert tone="danger" className="mt-4">{err}</Alert>}
    </Dialog>
  );
}

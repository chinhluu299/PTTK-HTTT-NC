"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, CircleCheck, Mic, MicOff, Phone, RotateCcw, SendHorizontal, ShieldAlert, ShieldCheck } from "lucide-react";
import { PatientShell } from "@/components/patient-shell";
import { BrandMark } from "@/components/brand";
import { photos } from "@/components/photos";
import { Alert, Button, Dialog, Panel, Spinner, URGENCY, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useConfig } from "@/lib/hooks";
import type { ChatMessage, RedFlag, TriageSession, Vitals } from "@/lib/types";

const KEY = "mc.triage";
const EXAMPLES = ["Đau đầu từ sáng, đo huyết áp 160/100", "Nổi mẩn ngứa sau khi ăn hải sản", "Ho có đờm 1 tuần, sốt nhẹ về chiều"];

/* eslint-disable @typescript-eslint/no-explicit-any */
const noop = () => () => {};
function speechSupported(): boolean {
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}
function getRecognition(): any {
  if (typeof window === "undefined") return null;
  const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return R ? new R() : null;
}

export default function TriagePage() {
  const router = useRouter();
  const cfg = useConfig();
  const [s, setS] = useState<TriageSession | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const canSpeak = useSyncExternalStore(noop, speechSupported, () => false);
  const [reopenEm, setReopenEm] = useState(false);
  const recRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let sid: string | null = null;
    try { sid = localStorage.getItem(KEY); } catch { /* */ }
    (async () => {
      try {
        if (sid) {
          const old = await api<TriageSession>(`/api/triage/sessions/${sid}`, { auth: "patient" });
          setS(old);
          return;
        }
      } catch { /* phiên cũ không còn -> tạo mới */ }
      await start();
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [s]);
  // Cảnh báo cấp cứu tự mở và không đóng được cho tới khi bệnh nhân xác nhận đã đọc
  const emOpen = (s?.state === "EMERGENCY" && !s.emergency_acknowledged) || reopenEm;

  async function start() {
    const ns = await api<TriageSession>("/api/triage/sessions", { method: "POST", auth: "patient" });
    try { localStorage.setItem(KEY, ns.id); } catch { /* */ }
    setS(ns);
    setText("");
    setErr(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function send(t: string) {
    const msg = t.trim();
    if (!msg || !s || busy) return;
    setBusy(true);
    setErr(null);
    // hiển thị ngay câu của bệnh nhân
    setS({ ...s, messages: [...s.messages, { role: "user", text: msg, kind: "text", ts: new Date().toISOString() }] });
    setText("");
    try {
      setS(await api<TriageSession>(`/api/triage/sessions/${s.id}/messages`, { body: { text: msg }, auth: "patient" }));
    } catch (e) {
      setErr(errMsg(e));
      setS(s);
      setText(msg);
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    rec.lang = "vi-VN";
    rec.interimResults = true;
    rec.continuous = false;
    const base = text ? text.trimEnd() + " " : "";
    rec.onresult = (e: any) => {
      const said = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setText(base + said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function ack() {
    if (!s) return;
    try {
      setS(await api<TriageSession>(`/api/triage/sessions/${s.id}/ack-emergency`, { method: "POST", auth: "patient" }));
      setReopenEm(false);
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  function goBooking() {
    if (!s?.specialty_id) return;
    router.push(`/dat-lich?specialty=${s.specialty_id}&session=${s.id}`);
  }

  if (!s) return <PatientShell wide><Spinner label="Đang mở trợ lý…" /></PatientShell>;

  const last = s.messages[s.messages.length - 1];
  const awaitingChoice = last?.role === "assistant" && last.kind === "question" && !busy;
  const userCount = s.messages.filter((m) => m.role === "user").length;
  const done = s.state === "DONE" || (s.state === "EMERGENCY" && s.emergency_acknowledged);

  return (
    <PatientShell wide>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[14px]">
        <p className="text-ink-3">Trợ lý gợi ý chuyên khoa và mức độ cần khám. Có kết quả, bạn chọn giờ khám ngay.</p>
        <p className="text-ink-3">Đã biết khoa cần khám? <Link href="/dat-lich" className="font-semibold text-brand hover:underline">Đặt lịch trực tiếp</Link></p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="flex min-h-[calc(100dvh-260px)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card" aria-label="Trò chuyện với trợ lý">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-3">
              <BrandMark size={36} />
              <div>
                <h1 className="text-[16px] font-semibold leading-tight">Trợ lý phân loại triệu chứng</h1>
                <p className="mt-0.5 text-[13px] text-ink-3">Gợi ý chuyên khoa và mức độ cần khám · Không chẩn đoán, không kê thuốc</p>
              </div>
            </div>
            {userCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { try { localStorage.removeItem(KEY); } catch { /* */ } start(); }}>
                <RotateCcw className="size-4" aria-hidden /> Kể lại từ đầu
              </Button>
            )}
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto bg-paper/50 px-4 py-6 sm:px-6" aria-live="polite">
            {s.messages.map((m, i) => (
              <Message key={i} m={m} latest={i === s.messages.length - 1} onPick={send} busy={busy}
                onBook={goBooking} onShowEmergency={() => setReopenEm(true)} acknowledged={s.emergency_acknowledged} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 pl-11 text-[14.5px] text-ink-3">
                <span className="flex gap-1" aria-hidden>
                  {[0, 1, 2].map((k) => <span key={k} className="size-1.5 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${k * 120}ms` }} />)}
                </span>
                Trợ lý đang xem xét…
              </div>
            )}
            {userCount === 0 && (
              <div className="pl-11">
                <p className="mb-2 text-[13px] font-medium text-ink-3">Hoặc bắt đầu bằng một ví dụ</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((e) => (
                    <button key={e} onClick={() => send(e)} className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-left text-[14px] text-ink-2 shadow-xs transition-colors hover:border-brand/50 hover:bg-brand-tint hover:text-brand-strong">
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-line bg-surface p-3 sm:p-4">
            {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
            {done && (
              <p className="mb-2 text-[13px] text-ink-3">Bạn có thể kể thêm nếu còn triệu chứng khác, trợ lý sẽ xem lại.</p>
            )}
            <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-end gap-2">
              <label htmlFor="msg" className="sr-only">Mô tả triệu chứng</label>
              <textarea ref={inputRef} id="msg" rows={2} value={text} disabled={busy}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
                placeholder={awaitingChoice ? "Bấm một lựa chọn ở trên, hoặc gõ câu trả lời…" : "Ví dụ: đau đầu từ sáng, đo huyết áp 160/100"}
                className="field-input min-h-[52px] flex-1 resize-none" />
              {canSpeak && (
                <Button type="button" variant={listening ? "danger" : "secondary"} size="lg" onClick={toggleMic}
                  aria-label={listening ? "Dừng ghi âm" : "Nói thay vì gõ"} className="w-12 px-0">
                  {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </Button>
              )}
              <Button type="submit" size="lg" disabled={!text.trim()} loading={busy} aria-label="Gửi">
                <SendHorizontal className="size-5" aria-hidden /><span className="hidden sm:inline">Gửi</span>
              </Button>
            </form>
            {listening && <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-danger"><span className="size-2 animate-pulse rounded-full bg-danger" />Đang nghe… hãy nói triệu chứng của bạn</p>}
            <p className="mt-2 text-[12.5px] text-ink-3">{s.disclaimer}</p>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <SafetyPanel flags={s.red_flags} vitals={s.vitals} started={userCount > 0} />
          <Panel title="Về bạn">
            <dl className="grid grid-cols-2 gap-3 text-[15px]">
              <div><dt className="text-ink-3 text-sm">Nhóm tuổi</dt><dd className="font-semibold">{s.age_group ?? "—"}</dd></div>
              <div><dt className="text-ink-3 text-sm">Giới tính</dt><dd className="font-semibold">{s.gender === "NAM" ? "Nam" : s.gender === "NU" ? "Nữ" : "—"}</dd></div>
            </dl>
          </Panel>
          <Panel title="Kể thế nào cho dễ hiểu">
            <ol className="space-y-2.5 text-[14px] text-ink-2">
              {[["Bị gì, ở đâu", "“đau bụng bên phải”"], ["Từ khi nào", "“từ tối qua”"], ["Chỉ số tự đo, nếu có", "huyết áp, nhiệt độ, SpO2"]].map(([k, v], i) => (
                <li key={k} className="flex gap-2.5">
                  <span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-paper-2 text-[11.5px] font-bold text-ink-3">{i + 1}</span>
                  <span><span className="font-medium text-ink">{k}:</span> {v}</span>
                </li>
              ))}
            </ol>
          </Panel>
          <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div className="relative aspect-[16/10] bg-paper-2">
              <Image src={photos.checkup} alt="Bác sĩ đo huyết áp cho bệnh nhân" fill placeholder="blur" sizes="(min-width: 1024px) 320px, 100vw"
                className="object-cover object-[50%_22%]" />
            </div>
            <figcaption className="p-4 text-[13.5px] leading-relaxed text-ink-2">
              <span className="font-semibold text-ink">Bác sĩ đọc lại cuộc trò chuyện này</span> trước khi khám, nên bạn không phải kể lại từ đầu.
            </figcaption>
          </figure>
        </aside>
      </div>

      <EmergencyDialog open={emOpen} flags={s.red_flags} hotline={cfg?.hotline ?? "1900 1234"}
        acknowledged={s.emergency_acknowledged} onAck={ack} onClose={() => setReopenEm(false)} />
    </PatientShell>
  );
}

function Message({ m, latest, onPick, busy, onBook, onShowEmergency, acknowledged }: {
  m: ChatMessage; latest: boolean; onPick: (t: string) => void; busy: boolean; onBook: () => void;
  onShowEmergency: () => void; acknowledged: boolean;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="enter max-w-[80%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[15.5px] whitespace-pre-wrap text-white shadow-xs">{m.text}</p>
      </div>
    );
  }
  if (m.kind === "result" && m.data) {
    const u = URGENCY[m.data.muc_do];
    return (
      <div className="enter ml-11 overflow-hidden rounded-xl border border-brand/35 bg-surface shadow-raised">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-tint-2 bg-brand-tint px-5 py-2.5">
          <p className="text-[13px] font-semibold text-brand-strong">Gợi ý của trợ lý</p>
          <span className={cx("inline-flex h-6 items-center rounded-full border px-2.5 text-[12.5px] font-semibold", u.cls)}>{u.label}</span>
        </div>
        <div className="px-5 py-5">
          <p className="text-[13px] text-ink-3">Chuyên khoa phù hợp</p>
          <p className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-navy">{m.data.chuyen_khoa}</p>
          <p className="mt-1 font-semibold" style={{ color: m.data.muc_do === "KHAM_SOM" ? "var(--color-warn)" : "var(--color-ok)" }}>{u.long}</p>
          <p className="mt-3 text-[15px] text-ink-2">{m.text}</p>
          {latest && (
            <Button size="lg" className="mt-4 w-full sm:w-auto" onClick={onBook}>
              Chọn giờ khám {m.data.chuyen_khoa} <ArrowRight className="size-5" aria-hidden />
            </Button>
          )}
          <p className="mt-3 text-[12.5px] text-ink-3">{m.data.disclaimer}</p>
        </div>
      </div>
    );
  }
  if (m.kind === "emergency" && m.data) {
    return (
      <div className="enter ml-11 overflow-hidden rounded-xl border border-danger/50 bg-danger-tint shadow-raised">
        <div className="flex items-center gap-2 bg-danger px-4 py-2 text-white">
          <ShieldAlert className="size-5" aria-hidden />
          <p className="font-bold">Có dấu hiệu cần cấp cứu</p>
        </div>
        <div className="px-4 py-3">
          <ul className="space-y-1 text-[15px]">
            {(m.data.red_flags ?? []).map((f) => <li key={f.group}>• <b>{f.finding}</b> — nghi ngờ {f.suspect.toLowerCase()}</li>)}
            {!m.data.red_flags?.length && <li>{m.text}</li>}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="tel:115" className="inline-flex h-12 items-center gap-2 rounded-lg bg-danger px-5 font-bold text-white hover:bg-danger-strong">
              <Phone className="size-5" aria-hidden /> Gọi 115
            </a>
            {!acknowledged && <Button variant="secondary" size="lg" onClick={onShowEmergency}>Xem cảnh báo</Button>}
            {acknowledged && latest && m.data.specialty_id && (
              <Button variant="secondary" size="lg" onClick={onBook}>Tôi đã được cấp cứu, vẫn muốn đặt lịch {m.data.chuyen_khoa}</Button>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="enter flex max-w-[92%] gap-3">
      <span className="mt-0.5"><BrandMark size={32} /></span>
      <div className="min-w-0">
      <p className="w-fit rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-2.5 text-[15.5px] whitespace-pre-wrap shadow-xs">{m.text}</p>
      {m.kind === "question" && m.options && latest && (
        <div className={cx("mt-3 grid gap-2", m.options.length > 2 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:max-w-sm")}>
          {m.options.map((o) => (
            <Button key={o} variant="secondary" size="lg" disabled={busy} onClick={() => onPick(o)} className="hover:!border-brand/60 hover:!bg-brand-tint hover:!text-brand-strong">
              {o}
            </Button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

function SafetyPanel({ flags, vitals, started }: { flags: RedFlag[]; vitals: Vitals; started: boolean }) {
  const bpBad = vitals.bp && (vitals.bp.systolic >= 180 || vitals.bp.diastolic >= 120);
  const rows: [string, string | null, boolean][] = [
    ["Huyết áp", vitals.bp ? `${vitals.bp.systolic}/${vitals.bp.diastolic} mmHg` : null, !!bpBad],
    ["Nhiệt độ", vitals.temp ? `${String(vitals.temp).replace(".", ",")} °C` : null, (vitals.temp ?? 0) >= 40],
    ["SpO2", vitals.spo2 ? `${vitals.spo2}%` : null, (vitals.spo2 ?? 100) < 90],
  ];
  return (
    <Panel title="Chỉ số đã ghi nhận" eyebrow="Tự động tách từ lời kể của bạn" tone={flags.length ? "danger" : "default"}>
      {flags.length ? (
        <p className="mb-3 flex items-center gap-2 font-semibold text-danger"><ShieldAlert className="size-5" aria-hidden />Phát hiện dấu hiệu nguy hiểm</p>
      ) : (
        <p className="mb-3 flex items-center gap-2 text-[15px] text-ink-2">
          {started ? <ShieldCheck className="size-5 text-ok" aria-hidden /> : <CircleCheck className="size-5 text-ink-3" aria-hidden />}
          {started ? "Chưa phát hiện dấu hiệu nguy hiểm" : "Chỉ số bạn kể sẽ được tách tự động"}
        </p>
      )}
      <dl className="divide-y divide-line-2 overflow-hidden rounded-lg border border-line">
        {rows.map(([k, v, bad]) => (
          <div key={k} className={cx("flex items-center justify-between px-3 py-2", bad && "bg-danger-tint")}>
            <dt className="text-sm text-ink-3">{k}</dt>
            <dd className={cx("num font-semibold", bad ? "text-danger" : v ? "text-ink" : "text-ink-3")}>{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function EmergencyDialog({ open, flags, hotline, acknowledged, onAck, onClose }: {
  open: boolean; flags: RedFlag[]; hotline: string; acknowledged: boolean; onAck: () => void; onClose: () => void;
}) {
  const [read, setRead] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} tone="danger" dismissable={acknowledged} title="Cảnh báo: bạn có dấu hiệu cần cấp cứu">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-ink-3">Hệ thống phát hiện</p>
          <ul className="mt-1 space-y-1.5">
            {flags.map((f) => (
              <li key={f.group} className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2">
                <p className="font-semibold">{f.finding}</p>
                <p className="text-sm text-ink-2">Nghi ngờ: {f.suspect}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[17px] font-semibold">Đừng chờ lịch hẹn. Hãy gọi cấp cứu hoặc đến cơ sở cấp cứu gần nhất ngay bây giờ.</p>
        <a href="tel:115" className="pulse-danger flex h-16 items-center justify-center gap-3 rounded-lg bg-danger text-xl font-bold text-white hover:bg-danger-strong">
          <Phone className="size-6" aria-hidden /> Gọi 115
        </a>
        <a href={`tel:${hotline.replace(/\s/g, "")}`} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line-strong font-semibold hover:bg-paper">
          Gọi phòng khám <span className="num">{hotline}</span>
        </a>
        <ul className="space-y-1 text-[15px] text-ink-2">
          <li>• Ngồi hoặc nằm nghỉ, không tự lái xe.</li>
          <li>• Nhờ người thân đi cùng, mang theo thuốc đang dùng.</li>
        </ul>
        {!acknowledged && (
          <div className="rounded-md border border-line bg-paper p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-1 size-5 accent-[#0b5cab]" />
              <span className="text-[15px]">Tôi đã đọc cảnh báo và hiểu rằng kết quả này không thay thế chẩn đoán của bác sĩ.</span>
            </label>
            <Button variant="secondary" className="mt-3" block disabled={!read} onClick={onAck}>Tiếp tục</Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

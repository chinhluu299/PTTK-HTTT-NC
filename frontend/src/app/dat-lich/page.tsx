"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, ChevronLeft, Clock, DoorOpen, Stethoscope, UserRound } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { AssistantCard, SpecialtyGrid, useSpecialties } from "@/components/specialty-grid";
import { PatientShell } from "@/components/patient-shell";
import { Alert, Button, Dialog, Spinner, Steps, URGENCY, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { ApiError, api, errMsg, getToken } from "@/lib/api";
import { dayLabel, dayShort, relativeDay, vnd } from "@/lib/format";
import { useConfig } from "@/lib/hooks";
import type { AppointmentDetail, DaySlots, Specialty, Suggestion, TriageSession } from "@/lib/types";

const BOOKING_STEPS = ["Chọn chuyên khoa", "Chọn giờ", "Đặt cọc", "Xác nhận"];

interface Pick { date: string; slot: string; doctorId: number; doctorName: string; room: string | null }

export default function Page() {
  return <Suspense fallback={<PatientShell><Spinner /></PatientShell>}><Booking /></Suspense>;
}

function Booking() {
  const sp = useSearchParams();
  const router = useRouter();
  const cfg = useConfig();
  const general = sp.get("general") === "1";
  const sessionId = sp.get("session");
  const [spec, setSpec] = useState<Specialty | null>(null);
  const [triage, setTriage] = useState<TriageSession | null>(null);
  const [sug, setSug] = useState<Suggestion | null | undefined>(undefined);
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [mode, setMode] = useState<"suggest" | "pick">("suggest");
  const [dayIdx, setDayIdx] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [pending, setPending] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!general && !sp.get("specialty")) return; // đang ở bước chọn chuyên khoa
    setErr(null);
    setSug(undefined);
    setDays(null);
    const specs = await api<Specialty[]>("/api/public/specialties");
    let sid = Number(sp.get("specialty"));
    if (general) sid = specs.find((x) => x.is_general)?.id ?? 0;
    const s = specs.find((x) => x.id === sid) ?? null;
    setSpec(s);
    if (!s) throw new Error("Không tìm thấy chuyên khoa này. Vui lòng chọn lại ở trang Đặt lịch khám.");
    const [sg, av] = await Promise.all([
      api<{ suggestion: Suggestion | null }>(`/api/booking/suggest?specialty_id=${s.id}`),
      api<DaySlots[]>(`/api/booking/availability?specialty_id=${s.id}`),
    ]);
    setSug(sg.suggestion);
    setDays(av);
    setDayIdx(Math.max(0, av.findIndex((d) => d.slots.length > 0)));
  }, [sp, general]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() bất đồng bộ: setState chạy sau await
    load().catch((e) => setErr(errMsg(e)));
    if (sessionId) api<TriageSession>(`/api/triage/sessions/${sessionId}`, { auth: "patient" }).then(setTriage).catch(() => {});
  }, [load, sessionId]);

  const day = days?.[dayIdx];
  const slotInfo = useMemo(() => day?.slots.find((x) => x.slot === slot) ?? null, [day, slot]);
  const urgency = triage?.urgency;

  async function hold(p: Pick) {
    if (!spec) return;
    if (!getToken("patient")) {
      setPending(p);
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const a = await api<AppointmentDetail>("/api/appointments/hold", {
        auth: "patient",
        body: { specialty_id: spec.id, doctor_id: p.doctorId, date: p.date, slot: p.slot, triage_session_id: general ? null : sessionId, is_general: general },
      });
      router.push(`/lich-hen/${a.id}`);
    } catch (e) {
      const m = errMsg(e);
      setErr(m);
      toast(m, { tone: "danger" });
      if (e instanceof ApiError && e.status === 409) {
        setSlot(null);
        setDoctorId(null);
        load();
      }
      setBusy(false);
    }
  }

  // Chưa chọn chuyên khoa: hiện bước chọn chuyên khoa
  if (!general && !sp.get("specialty")) return <ChooseSpecialty />;

  return (
    <PatientShell>
      <div className="mb-5">
        <Steps steps={BOOKING_STEPS} current={1} />
      </div>
      <Link href={sessionId ? "/kham" : "/dat-lich"} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> {sessionId ? "Quay lại trợ lý" : "Đổi chuyên khoa"}
      </Link>
      <h1 className="text-[26px] leading-tight font-bold tracking-tight">Chọn giờ khám</h1>
      <p className="mt-1 text-ink-2">
        {general ? "Khám tổng quát" : "Chuyên khoa"} <b className="text-ink">{spec?.name ?? "…"}</b>
        {!general && sessionId && <span className="text-ink-3"> · do trợ lý gợi ý</span>}
      </p>
      {urgency === "KHAM_SOM" && (
        <Alert tone="warn" className="mt-4" title="Bạn nên được khám sớm">Hệ thống ưu tiên hiển thị khung giờ sớm nhất còn chỗ.</Alert>
      )}
      {urgency === "CAP_CUU" && (
        <Alert tone="danger" className="mt-4" title="Trợ lý đã cảnh báo dấu hiệu cấp cứu">Nếu triệu chứng còn, hãy gọi 115 thay vì chờ lịch hẹn.</Alert>
      )}
      {err && <Alert tone="danger" className="mt-4">{err}</Alert>}

      {sug === undefined ? (err ? null : <Spinner />) : !sug ? (
        <Alert tone="warn" className="mt-5" title="Chưa có khung giờ trống">Các bác sĩ chuyên khoa này đã kín lịch 2 tuần tới. Vui lòng gọi hotline để được hỗ trợ.</Alert>
      ) : mode === "suggest" ? (
        <section className="mt-6" aria-label="Đề xuất">
          <div className="overflow-hidden rounded-xl border border-brand/30 bg-surface shadow-raised">
            <div className="flex items-center justify-between gap-3 border-b border-brand-tint-2 bg-brand-tint px-5 py-2.5">
              <p className="text-[13.5px] font-semibold text-brand-strong">Đề xuất cho bạn · khung giờ sớm nhất còn chỗ</p>
              {urgency && urgency !== "CAP_CUU" && <span className="text-[12.5px] font-semibold text-warn">{URGENCY[urgency].label}</span>}
            </div>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-[auto_1fr] sm:gap-8">
              <div>
                <p className="num text-[56px] leading-none font-bold tracking-[-0.03em] text-navy">{sug.slot}</p>
                <p className="mt-2 font-semibold">{dayLabel(sug.date)}</p>
                {relativeDay(sug.date) && <p className="text-sm font-semibold text-brand">{relativeDay(sug.date)}</p>}
              </div>
              <dl className="grid content-start gap-2.5 text-[15px]">
                <div className="flex items-center gap-2"><UserRound className="size-4 text-ink-3" aria-hidden /><dt className="sr-only">Bác sĩ</dt><dd className="font-semibold">{sug.doctor.name}</dd></div>
                <div className="flex items-center gap-2"><Stethoscope className="size-4 text-ink-3" aria-hidden /><dt className="sr-only">Chuyên khoa</dt><dd>{spec?.name}</dd></div>
                <div className="flex items-center gap-2"><DoorOpen className="size-4 text-ink-3" aria-hidden /><dt className="sr-only">Phòng</dt><dd>Phòng {sug.doctor.room}</dd></div>
                <div className="flex items-center gap-2"><Clock className="size-4 text-ink-3" aria-hidden /><dt className="sr-only">Chỗ</dt><dd>Còn {sug.doctor.left}/{cfg?.slot_capacity ?? 3} chỗ ở khung này</dd></div>
              </dl>
            </div>
            <div className="ticket-edge relative h-4"><div className="absolute inset-x-4 top-1/2 border-t-2 border-dashed border-line" /></div>
            <div className="flex flex-col gap-3 px-5 pt-2 pb-5">
              <p className="text-[15px] text-ink-2">
                Giữ chỗ trong <b className="text-ink">{cfg?.hold_minutes ?? 5} phút</b> để chuyển khoản cọc <b className="text-ink">{vnd(cfg?.deposit_amount)}</b>. Tiền cọc trừ vào hóa đơn khi khám xong.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button size="lg" loading={busy} onClick={() => hold({ date: sug.date, slot: sug.slot, doctorId: sug.doctor.id, doctorName: sug.doctor.name, room: sug.doctor.room })}>
                  <Check className="size-5" aria-hidden /> Đồng ý, giữ chỗ khung này
                </Button>
                <Button size="lg" variant="secondary" onClick={() => setMode("pick")}>
                  <CalendarClock className="size-5" aria-hidden /> Chọn giờ hoặc bác sĩ khác
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-6 rounded-lg border border-line bg-surface shadow-card" aria-label="Chọn ngày giờ">
          <div className="flex items-center justify-between border-b border-line-2 px-4 py-3">
            <h2 className="font-bold">1. Chọn ngày</h2>
            <button className="text-sm font-semibold text-brand" onClick={() => { setMode("suggest"); setSlot(null); setDoctorId(null); }}>Dùng đề xuất</button>
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 py-3" role="tablist">
            {days?.map((d, i) => {
              const ds = dayShort(d.date);
              const n = d.slots.length;
              return (
                <button key={d.date} role="tab" aria-selected={i === dayIdx} disabled={!n}
                  onClick={() => { setDayIdx(i); setSlot(null); setDoctorId(null); }}
                  className={cx("flex w-[76px] shrink-0 flex-col items-center rounded-md border px-2 py-2 transition-colors disabled:opacity-40",
                    i === dayIdx ? "border-brand bg-brand text-white shadow-xs" : "border-line bg-surface hover:border-brand/50")}>
                  <span className="text-[13px] font-semibold whitespace-nowrap">{relativeDay(d.date) === "Ngày mai" ? "Mai" : relativeDay(d.date) ?? ds.wd}</span>
                  <span className="num text-[17px] font-bold">{ds.dm}</span>
                  <span className={cx("text-[11.5px]", i === dayIdx ? "text-white/80" : "text-ink-3")}>{n ? `${n} khung` : "Kín lịch"}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-line-2 px-4 py-3">
            <h2 className="mb-3 font-bold">2. Chọn giờ <span className="font-normal text-ink-3">— {day && dayLabel(day.date)}</span></h2>
            {(["Buổi sáng", "Buổi chiều"] as const).map((label, gi) => {
              const list = day?.slots.filter((x) => (gi === 0 ? x.slot < "12:00" : x.slot >= "12:00")) ?? [];
              return (
                <div key={label} className="mb-4">
                  <p className="eyebrow mb-2">{label}</p>
                  {list.length ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                      {list.map((x) => (
                        <button key={x.slot} onClick={() => { setSlot(x.slot); setDoctorId(x.suggested_doctor_id); }}
                          aria-pressed={slot === x.slot}
                          className={cx("flex flex-col items-center rounded-md border py-2 transition-colors",
                            slot === x.slot ? "border-brand bg-brand text-white" : "border-line hover:border-brand/50")}>
                          <span className="num text-[17px] font-bold">{x.slot}</span>
                          <span className={cx("text-[12px]", slot === x.slot ? "text-white/85" : "text-ink-3")}>còn {x.left}</span>
                        </button>
                      ))}
                    </div>
                  ) : <p className="text-sm text-ink-3">Không còn khung trống</p>}
                </div>
              );
            })}
          </div>
          {slotInfo && day && (
            <div className="border-t border-line-2 px-4 py-3">
              <h2 className="mb-3 font-bold">3. Chọn bác sĩ</h2>
              <div className="grid gap-2" role="radiogroup">
                {slotInfo.doctors.map((d) => (
                  <label key={d.id} className={cx("flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3",
                    doctorId === d.id ? "border-brand bg-brand-tint" : "border-line hover:border-brand/50")}>
                    <input type="radio" name="doctor" checked={doctorId === d.id} onChange={() => setDoctorId(d.id)} className="size-5 accent-[#0a5c7d]" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{d.name}</span>
                      <span className="text-sm text-ink-3">Phòng {d.room} · còn {d.left} chỗ · {d.day_load} lịch trong ngày</span>
                    </span>
                    {d.id === slotInfo.suggested_doctor_id && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[12px] font-semibold text-brand-strong">Đề xuất</span>}
                  </label>
                ))}
              </div>
              <Button size="lg" className="mt-4 w-full sm:w-auto" loading={busy} disabled={!doctorId}
                onClick={() => {
                  const d = slotInfo.doctors.find((x) => x.id === doctorId)!;
                  hold({ date: day.date, slot: slotInfo.slot, doctorId: d.id, doctorName: d.name, room: d.room });
                }}>
                Giữ chỗ {slotInfo.slot}, {dayShort(day.date).dm}
              </Button>
            </div>
          )}
        </section>
      )}

      <Dialog open={authOpen} onClose={() => setAuthOpen(false)} title="Để giữ chỗ, cho chúng tôi biết bạn là ai">
        {pending && (
          <p className="mb-4 rounded-md border border-line bg-paper px-3 py-2 text-[15px]">
            Khung đã chọn: <b className="num">{pending.slot}</b> · {dayLabel(pending.date)} · {pending.doctorName}
          </p>
        )}
        <AuthForm compact triageSessionId={general ? null : sessionId} onDone={() => { setAuthOpen(false); if (pending) hold(pending); }} />
      </Dialog>
    </PatientShell>
  );
}

function ChooseSpecialty() {
  const specs = useSpecialties();
  const cfg = useConfig();
  return (
    <PatientShell wide>
      <div className="mb-5"><Steps steps={BOOKING_STEPS} current={0} /></div>
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_330px]">
        <div>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-navy">Đặt lịch khám</h1>
          <p className="mt-1.5 mb-6 max-w-2xl text-[15.5px] text-ink-3">
            Chọn chuyên khoa bạn muốn khám. Bước tiếp theo, hệ thống đề xuất giờ trống sớm nhất và bác sĩ phù hợp.
            Tiền cọc {vnd(cfg?.deposit_amount ?? 100000)} được trừ vào hóa đơn khi khám xong.
          </p>
          <SpecialtyGrid specs={specs} />
          {specs?.length === 0 && <Alert tone="danger" className="mt-4">Chưa tải được danh sách chuyên khoa. Vui lòng thử lại hoặc gọi tổng đài.</Alert>}
        </div>
        <div className="space-y-4 lg:sticky lg:top-24">
          <AssistantCard />
          <div className="rounded-xl border border-danger/25 bg-surface p-4 text-[14px] leading-relaxed text-ink-2 shadow-card">
            Đau ngực, khó thở, yếu liệt nửa người? Đừng đặt lịch, hãy <a href="tel:115" className="font-semibold text-danger hover:underline">gọi cấp cứu 115</a>.
          </div>
          <p className="text-center text-[14px] text-ink-3">
            Đã đặt lịch? <Link href="/ho-so" className="font-semibold text-brand hover:underline">Xem lịch hẹn của tôi</Link>
          </p>
        </div>
      </div>
    </PatientShell>
  );
}

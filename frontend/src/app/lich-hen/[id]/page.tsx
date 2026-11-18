"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CalendarX2, Check, CircleCheck, Copy, FlaskConical, Pill, TriangleAlert } from "lucide-react";
import { PatientShell } from "@/components/patient-shell";
import { QR } from "@/components/brand";
import { Alert, Button, Dialog, Forbidden, KV, Panel, Spinner, StatusTag, Steps, cx } from "@/components/ui";
import { VisitBody } from "@/components/visit-view";
import { toast } from "@/components/toast";
import { ApiError, api, errMsg } from "@/lib/api";
import { dayLabel, dayShort, relativeDay, vnd } from "@/lib/format";
import { useConfig, useNow, usePatient, usePoll } from "@/lib/hooks";
import type { AppointmentDetail, DaySlots } from "@/lib/types";

// Trước khi đến: tiếp nối các bước đặt lịch. Sau khi check-in: các bước tại phòng khám.
const BOOKING = ["Chọn chuyên khoa", "Chọn giờ", "Đặt cọc", "Xác nhận"];
const VISIT = ["Check-in", "Khám", "Chốt ca", "Lấy thuốc & thanh toán"];
const STEP: Record<string, [string[], number]> = {
  HOLD: [BOOKING, 2], CONFIRMED: [BOOKING, 4], CHECKED_IN: [VISIT, 1], IN_CONSULTATION: [VISIT, 1], WAITING_LAB: [VISIT, 1],
  COMPLETED: [VISIT, 3], PAID: [VISIT, 4],
};

export default function Page() {
  return <Suspense fallback={<PatientShell><Spinner /></PatientShell>}><AppointmentPage /></Suspense>;
}

function AppointmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { patient, loading } = usePatient();
  const [a, setA] = useState<AppointmentDetail | null>(null);
  const [err, setErr] = useState<{ status: number; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setA(await api<AppointmentDetail>(`/api/appointments/${id}`, { auth: "patient" }));
    } catch (e) {
      setErr({ status: e instanceof ApiError ? e.status : 0, msg: errMsg(e) });
    }
  }, [id]);

  useEffect(() => {
    if (loading) return;
    if (!patient) {
      router.replace(`/dang-nhap?next=/lich-hen/${id}`);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() bất đồng bộ: setState chạy sau await
    load();
  }, [loading, patient, id, load, router]);

  const live = a && ["HOLD", "CHECKED_IN", "IN_CONSULTATION", "WAITING_LAB", "COMPLETED"].includes(a.status);
  usePoll(load, a?.status === "HOLD" ? 3000 : 8000, !!live);

  if (err) return <PatientShell>{err.status === 403 ? <Forbidden message={err.msg} /> : <Alert tone="danger">{err.msg}</Alert>}</PatientShell>;
  if (!a) return <PatientShell><Spinner /></PatientShell>;

  const step = STEP[a.status];
  return (
    <PatientShell>
      {step && <div className="mb-5"><Steps steps={step[0]} current={step[1]} /></div>}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Lịch hẹn · <span className="mono normal-case tracking-normal">{a.code}</span></p>
          <h1 className="text-[24px] leading-tight font-bold tracking-tight">
            {a.slot} · {dayLabel(a.date)}
          </h1>
          <p className="mt-1 text-ink-2">{a.doctor.full_name} · {a.specialty.name} · Phòng {a.doctor.room}</p>
        </div>
        <StatusTag status={a.status} />
      </div>

      {a.leave_conflict && a.status === "CONFIRMED" && <LeaveConflict a={a} onChange={setA} />}
      {a.status === "HOLD" && <Payment a={a} reload={load} />}
      {a.status === "CONFIRMED" && !a.leave_conflict && <Confirmed a={a} onChange={setA} />}
      {["CHECKED_IN", "IN_CONSULTATION", "WAITING_LAB"].includes(a.status) && <InClinic a={a} />}
      {a.status === "COMPLETED" && a.queue && <QueueTicket a={a} />}
      {(a.status === "COMPLETED" || a.status === "PAID") && a.visit && (
        <div className="mt-5">
          {a.status === "PAID" && <Alert tone="ok" className="mb-4" title="Đã thanh toán và nhận thuốc">Cảm ơn bạn đã khám tại phòng khám. Lịch uống thuốc ở bên dưới.</Alert>}
          <VisitBody record={a.visit.record} labs={a.visit.lab_orders} rx={a.visit.prescription} amendments={a.visit.amendments} />
        </div>
      )}
      {["EXPIRED", "CANCELLED", "NO_SHOW"].includes(a.status) && <Ended a={a} />}
    </PatientShell>
  );
}

function Payment({ a, reload }: { a: AppointmentDetail; reload: () => void }) {
  const cfg = useConfig();
  const now = useNow(500);
  const [offset] = useState(() => (a.payment ? new Date(a.payment.server_now).getTime() - Date.now() : 0));
  const [simBusy, setSimBusy] = useState(false);
  const expires = a.hold_expires_at ? new Date(a.hold_expires_at).getTime() : 0;
  const left = Math.max(0, Math.floor((expires - (now + offset)) / 1000));
  const total = (cfg?.hold_minutes ?? 5) * 60;
  const p = a.payment!;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  async function simulate() {
    setSimBusy(true);
    try {
      const r = await api<{ result: string }>("/api/payments/dev/simulate", { body: { code: a.code } });
      toast(r.result === "confirmed" || r.result === "restored" ? "Ngân hàng đã báo tiền về" : `Kết quả: ${r.result}`, { tone: "ok" });
      reload();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setSimBusy(false);
    }
  }

  if (left === 0) {
    return (
      <Alert tone="warn" title="Hết thời gian giữ chỗ">
        Chỗ đã được trả lại. Nếu bạn đã chuyển khoản, hệ thống vẫn ghi nhận và tự khôi phục lịch nếu khung giờ còn chỗ.
        <div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" onClick={reload}>Kiểm tra lại</Button></div>
      </Alert>
    );
  }
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_300px]">
      <Panel title="Chuyển khoản tiền cọc" eyebrow="Bước 3 · Đặt cọc">
        <div className="mb-4 flex items-center gap-4 rounded-md border border-warn-line bg-warn-tint px-4 py-3">
          <p className={cx("num text-[34px] leading-none font-bold", left < 60 ? "text-danger" : "text-ink")} aria-live="off">{mm}:{ss}</p>
          <div className="flex-1">
            <p className="font-semibold">Chỗ đang được giữ cho bạn</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
              <div className="h-full bg-warn transition-[width] duration-500" style={{ width: `${(left / total) * 100}%` }} />
            </div>
          </div>
        </div>
        <ol className="mb-4 space-y-1.5 text-[15px]">
          <li><b className="num mr-1">1.</b> Mở app ngân hàng, chọn <b>Quét QR</b>.</li>
          <li><b className="num mr-1">2.</b> Quét mã bên cạnh. Số tiền và nội dung đã được điền sẵn.</li>
          <li><b className="num mr-1">3.</b> Giữ nguyên nội dung chuyển khoản. Trang này tự cập nhật khi tiền về.</li>
        </ol>
        <dl className="divide-y divide-line-2 rounded-md border border-line">
          <Row k="Số tiền" v={<span className="num text-[20px] font-bold">{vnd(p.amount)}</span>} />
          <Row k="Nội dung" v={<span className="mono text-[18px] font-bold tracking-wider">{p.content}</span>} copy={p.content} />
          <Row k="Ngân hàng" v={p.bank_name} />
          <Row k="Số tài khoản" v={<span className="mono">{p.account}</span>} copy={p.account} />
          <Row k="Chủ tài khoản" v={p.account_name} />
        </dl>
      </Panel>
      <div className="flex flex-col items-center gap-3 self-start rounded-lg border border-line bg-surface shadow-card p-5">
        <p className="eyebrow">VietQR</p>
        <QR value={p.vietqr} size={240} label={`Mã VietQR chuyển ${p.amount} đồng, nội dung ${p.content}`} />
        <p className="text-center text-sm text-ink-3">Quét bằng app ngân hàng bất kỳ hỗ trợ VietQR</p>
        {cfg?.payment_dev_mode && (
          <div className="mt-2 w-full rounded-md border border-dashed border-line-strong bg-paper p-3">
            <p className="text-[12.5px] font-semibold text-ink-3">Môi trường thử nghiệm</p>
            <Button size="sm" variant="secondary" block className="mt-2" loading={simBusy} onClick={simulate}>Giả lập ngân hàng báo tiền về</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, copy }: { k: string; v: React.ReactNode; copy?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-sm text-ink-3">{k}</dt>
      <dd className="flex items-center gap-2 text-right font-medium">
        {v}
        {copy && (
          <button aria-label={`Sao chép ${k}`} onClick={() => { navigator.clipboard?.writeText(copy); toast(`Đã sao chép ${k.toLowerCase()}`, { tone: "ok" }); }}
            className="rounded p-1 text-ink-3 hover:bg-paper hover:text-ink">
            <Copy className="size-4" />
          </button>
        )}
      </dd>
    </div>
  );
}

function Confirmed({ a, onChange }: { a: AppointmentDetail; onChange: (a: AppointmentDetail) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try {
      onChange(await api<AppointmentDetail>(`/api/appointments/${a.id}/cancel`, { method: "POST", auth: "patient" }));
      setOpen(false);
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Alert tone="ok" title="Đã xác nhận lịch khám" className="mb-5">
        Đã nhận cọc {vnd(a.deposit_paid)}. {relativeDay(a.date) ? `${relativeDay(a.date)} lúc ${a.slot}` : `Hẹn bạn lúc ${a.slot}`}, vui lòng đến trước 10 phút.
      </Alert>
      <div className="grid gap-5 md:grid-cols-[300px_1fr]">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-5 shadow-raised">
          <p className="eyebrow">Mã check-in</p>
          <QR value={a.code} size={220} label={`Mã QR check-in ${a.code}`} />
          <p className="mono text-[22px] font-bold tracking-[0.12em]">{a.code}</p>
          <p className="text-center text-sm text-ink-3">Đưa mã này vào máy kiosk ở quầy khi đến. Mã cũng đã gửi qua email (nếu có).</p>
        </div>
        <Panel title="Khi đến phòng khám">
          <ol className="space-y-3 text-[15px]">
            <li className="flex gap-3"><span className="num font-bold text-brand">1</span><span>Quét mã QR tại kiosk, hoặc nhập số điện thoại <b className="num">{a.patient.phone}</b>.</span></li>
            <li className="flex gap-3"><span className="num font-bold text-brand">2</span><span>Ngồi chờ trước <b>Phòng {a.doctor.room}</b>. Bác sĩ đã có tóm tắt triệu chứng của bạn.</span></li>
            <li className="flex gap-3"><span className="num font-bold text-brand">3</span><span>Sau khi khám, số thứ tự lấy thuốc sẽ hiện ngay trên trang này.</span></li>
          </ol>
          <div className="rule my-4" />
          <KV rows={[["Bác sĩ", a.doctor.full_name], ["Chuyên khoa", a.specialty.name], ["Tiền cọc", `${vnd(a.deposit_paid)} — trừ vào hóa đơn`]]} />
          <div className="rule my-4" />
          <Button variant="secondary" onClick={() => setOpen(true)}><CalendarX2 className="size-4" aria-hidden />Hủy lịch hẹn</Button>
        </Panel>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Hủy lịch hẹn?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Giữ lịch</Button><Button variant="danger" loading={busy} onClick={cancel}>Xác nhận hủy</Button></>}>
        {a.refundable ? (
          <Alert tone="ok" title="Bạn được hoàn cọc">Hủy trước giờ hẹn ít nhất 12 giờ. Tiền cọc {vnd(a.deposit_paid)} sẽ được hoàn lại.</Alert>
        ) : (
          <Alert tone="warn" title="Bạn sẽ không được hoàn cọc">Lịch hẹn còn dưới 12 giờ. Theo quy định, lịch sẽ chuyển sang vắng mặt và không hoàn tiền cọc.</Alert>
        )}
      </Dialog>
    </>
  );
}

function LeaveConflict({ a, onChange }: { a: AppointmentDetail; onChange: (a: AppointmentDetail) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [pick, setPick] = useState<{ date: string; slot: string; doctor: number } | null>(null);
  async function act(action: string) {
    setBusy(action);
    try {
      onChange(await api<AppointmentDetail>(`/api/appointments/${a.id}/resolve-leave`, { body: { action }, auth: "patient" }));
      toast(action === "REFUND" ? "Đã hủy lịch, tiền cọc sẽ được hoàn" : "Đã đổi sang bác sĩ thay thế", { tone: "ok" });
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }
  async function reschedule() {
    if (!pick) return;
    setBusy("RESCHEDULE");
    try {
      onChange(await api<AppointmentDetail>(`/api/appointments/${a.id}/reschedule`, { body: { doctor_id: pick.doctor, date: pick.date, slot: pick.slot }, auth: "patient" }));
      toast("Đã đổi giờ khám", { tone: "ok" });
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-warn-line bg-surface shadow-card">
      <div className="flex items-center gap-2 bg-warn-tint px-4 py-3">
        <TriangleAlert className="size-5 text-warn" aria-hidden />
        <p className="font-bold">{a.doctor.full_name} có lịch nghỉ đột xuất trùng giờ khám của bạn</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <div className="rounded-md border border-line p-3">
          <p className="font-semibold">Nhận bác sĩ thay thế</p>
          <p className="mt-1 text-sm text-ink-2">{a.suggested_doctor ? `${a.suggested_doctor.full_name}, cùng chuyên khoa, giữ nguyên giờ.` : "Không có bác sĩ cùng khoa còn chỗ ở giờ này."}</p>
          <Button className="mt-3" block disabled={!a.suggested_doctor} loading={busy === "ACCEPT_REPLACEMENT"} onClick={() => act("ACCEPT_REPLACEMENT")}>Nhận bác sĩ này</Button>
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="font-semibold">Đổi sang giờ khác</p>
          <p className="mt-1 text-sm text-ink-2">Chọn lại ngày giờ, giữ nguyên tiền cọc.</p>
          <Button className="mt-3" block variant="secondary" onClick={() => api<DaySlots[]>(`/api/booking/availability?specialty_id=${a.specialty.id}`).then(setDays)}>Xem giờ trống</Button>
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="font-semibold">Hoàn tiền cọc</p>
          <p className="mt-1 text-sm text-ink-2">Hủy lịch và hoàn {vnd(a.deposit_paid)}.</p>
          <Button className="mt-3" block variant="secondary" loading={busy === "REFUND"} onClick={() => act("REFUND")}>Hủy và hoàn cọc</Button>
        </div>
      </div>
      {days && (
        <div className="border-t border-line-2 p-4">
          <div className="grid gap-3">
            {days.filter((d) => d.slots.length).slice(0, 5).map((d) => (
              <div key={d.date}>
                <p className="mb-1.5 text-sm font-semibold">{relativeDay(d.date) ?? dayShort(d.date).wd} {dayShort(d.date).dm}</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.slots.map((s) => {
                    const doc = s.doctors.find((x) => x.id !== a.doctor.id);
                    if (!doc) return null;
                    const on = pick?.date === d.date && pick.slot === s.slot;
                    return (
                      <button key={s.slot} onClick={() => setPick({ date: d.date, slot: s.slot, doctor: doc.id })} aria-pressed={on}
                        className={cx("num rounded-md border px-2.5 py-1.5 text-sm font-semibold", on ? "border-brand bg-brand text-white" : "border-line hover:border-brand/50")}>
                        {s.slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <Button className="mt-4" disabled={!pick} loading={busy === "RESCHEDULE"} onClick={reschedule}>Đổi sang giờ đã chọn</Button>
        </div>
      )}
    </section>
  );
}

function InClinic({ a }: { a: AppointmentDetail }) {
  const msg = a.status === "CHECKED_IN" ? { t: "Bạn đã check-in", d: `Vui lòng ngồi chờ trước Phòng ${a.doctor.room}. Bác sĩ sẽ gọi tên bạn.`, I: CircleCheck }
    : a.status === "WAITING_LAB" ? { t: "Đang chờ kết quả cận lâm sàng", d: "Bạn làm xét nghiệm / chụp chiếu theo hướng dẫn. Kết quả tự chuyển về bác sĩ.", I: FlaskConical }
      : { t: "Đang khám", d: `Bạn đang được khám tại Phòng ${a.doctor.room}.`, I: Check };
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card p-6 text-center">
      <msg.I className="mx-auto size-10 text-brand" aria-hidden />
      <p className="mt-2 text-xl font-bold">{msg.t}</p>
      <p className="mt-1 text-ink-2">{msg.d}</p>
    </div>
  );
}

function QueueTicket({ a }: { a: AppointmentDetail }) {
  const q = a.queue!;
  const called = q.status === "CALLED";
  return (
    <div className={cx("mx-auto max-w-sm overflow-hidden rounded-xl border bg-surface text-center shadow-raised", called ? "border-ok/50" : "border-line")}>
      <div className={cx("px-4 py-2 text-white", called ? "bg-ok" : "bg-navy")}>
        <p className="flex items-center justify-center gap-2 font-bold"><Pill className="size-4" aria-hidden />Số thứ tự quầy thuốc</p>
      </div>
      <p className="num py-4 text-[88px] leading-none font-bold tracking-tight">{q.number}</p>
      <div className="ticket-edge relative h-4"><div className="absolute inset-x-4 top-1/2 border-t-2 border-dashed border-line" /></div>
      <div className="px-4 pt-2 pb-5">
        {called ? (
          <p className="text-lg font-bold text-ok">Đến lượt bạn — mời đến quầy thuốc</p>
        ) : (
          <p className="text-[17px] font-semibold">{q.ahead === 0 ? "Bạn là người tiếp theo" : `Còn ${q.ahead} người trước bạn`}</p>
        )}
        <p className="mt-1 text-sm text-ink-3">Bạn không cần bấm gì thêm. Màn hình ở quầy sẽ hiện và đọc số của bạn.</p>
      </div>
    </div>
  );
}

function Ended({ a }: { a: AppointmentDetail }) {
  const text = a.status === "EXPIRED" ? "Lịch giữ chỗ đã hết hạn vì chưa nhận được tiền cọc trong 5 phút."
    : a.status === "NO_SHOW" ? "Lịch hẹn đã quá giờ hoặc được hủy muộn nên chuyển sang vắng mặt. Tiền cọc không được hoàn."
      : a.refund_pending ? "Lịch hẹn đã hủy. Tiền cọc đang chờ hoàn lại." : "Lịch hẹn đã hủy.";
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card p-6">
      <p className="text-ink-2">{text}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/dat-lich" className="inline-flex h-10 items-center rounded-md bg-brand px-4 font-semibold text-white">Đặt lịch mới</Link>
        <Link href="/ho-so" className="inline-flex h-10 items-center rounded-md border border-line-strong px-4 font-semibold">Lịch hẹn của tôi</Link>
      </div>
    </div>
  );
}

"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Pencil, Pill } from "lucide-react";
import { PatientShell } from "@/components/patient-shell";
import { photos } from "@/components/photos";
import { Alert, Button, Dialog, Empty, Field, Input, LinkButton, Segmented, Spinner, StatusTag, Tag } from "@/components/ui";
import { toast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { dayLabel, dmy, relativeDay, todayISO } from "@/lib/format";
import { usePatient, usePoll } from "@/lib/hooks";
import type { Appointment, Patient } from "@/lib/types";

type Row = Appointment & { diagnosis: string | null; queue_number: number | null };
const UPCOMING = ["HOLD", "CONFIRMED", "CHECKED_IN", "IN_CONSULTATION", "WAITING_LAB", "COMPLETED"];

export default function Page() {
  const router = useRouter();
  const { patient, loading, reload } = usePatient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [edit, setEdit] = useState(false);

  const load = () => api<Row[]>("/api/appointments/mine", { auth: "patient" }).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    if (loading) return;
    if (!patient) router.replace("/dang-nhap?next=/ho-so");
    else load();
  }, [loading, patient, router]);
  usePoll(load, 10000, !!patient);

  if (!patient || !rows) return <PatientShell><Spinner /></PatientShell>;
  const today = todayISO();
  const upcoming = rows.filter((r) => UPCOMING.includes(r.status)
    && !(r.status === "COMPLETED" && r.date !== today)
    && !(r.status === "HOLD" && r.hold_expires_at && new Date(r.hold_expires_at) < new Date()));
  const past = rows.filter((r) => r.status === "PAID" || (r.status === "COMPLETED" && r.date !== today));
  const other = rows.filter((r) => ["EXPIRED", "CANCELLED", "NO_SHOW"].includes(r.status));
  const ticket = upcoming.find((r) => r.status === "COMPLETED" && r.queue_number);

  return (
    <PatientShell>
      <div className="mb-6 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="relative h-28 bg-navy sm:h-32">
          <Image src={photos.lobby} alt="" fill placeholder="blur" sizes="(min-width: 768px) 768px, 100vw" className="object-cover object-[50%_60%]" />
          <div className="absolute inset-0 bg-linear-to-r from-navy/95 via-navy/70 to-navy/25" aria-hidden />
          <p className="absolute top-4 left-5 text-[13px] font-medium text-white/80">Hồ sơ của tôi</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5">
          <div className="flex min-w-0 items-end gap-4">
            <span className="relative -mt-9 flex size-[72px] shrink-0 items-center justify-center rounded-full border-4 border-surface bg-brand text-[24px] font-bold text-white shadow-raised" aria-hidden>
              {initials(patient.full_name)}
            </span>
            <div className="min-w-0 pt-3">
              <h1 className="truncate text-[24px] leading-tight font-bold tracking-tight">{patient.full_name}</h1>
              <p className="mt-0.5 text-[14.5px] text-ink-2"><span className="num">{patient.phone}</span> · {patient.gender === "NU" ? "Nữ" : "Nam"} · sinh năm {patient.birth_year}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="size-4" aria-hidden />Sửa thông tin</Button>
            <LinkButton href="/dat-lich">Đặt lịch mới</LinkButton>
          </div>
        </div>
      </div>

      {ticket && (
        <Link href={`/lich-hen/${ticket.id}`} className="mb-6 flex items-center gap-4 rounded-xl border border-brand/30 bg-surface p-4 shadow-raised hover:bg-brand-tint/40">
          <span className="flex size-12 items-center justify-center rounded-lg bg-brand text-white"><Pill className="size-6" aria-hidden /></span>
          <div className="flex-1">
            <p className="text-sm text-ink-3">Số thứ tự quầy thuốc hôm nay</p>
            <p className="num text-[32px] leading-none font-bold">{ticket.queue_number}</p>
          </div>
          <ArrowRight className="size-5 text-ink-3" aria-hidden />
        </Link>
      )}

      <h2 className="eyebrow mb-3">Lịch hẹn sắp tới</h2>
      {upcoming.length ? (
        <ul className="mb-8 divide-y divide-line-2 rounded-lg border border-line bg-surface shadow-card">
          {upcoming.map((r) => (
            <li key={r.id}>
              <Link href={`/lich-hen/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-paper">
                <div className="w-16 shrink-0 text-center">
                  <p className="num text-[20px] leading-none font-bold">{r.slot}</p>
                  <p className="mt-1 text-[12px] text-ink-3">{relativeDay(r.date) ?? dmy(r.date).slice(0, 5)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.specialty.name} · {r.doctor.full_name}</p>
                  <p className="text-sm text-ink-3">{dayLabel(r.date)} · Phòng {r.doctor.room}</p>
                  {r.leave_conflict && <Tag className="mt-1 border-warn-line bg-warn-tint text-warn">Cần chọn lại vì bác sĩ nghỉ</Tag>}
                </div>
                <StatusTag status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-8"><Empty title="Chưa có lịch hẹn nào">Kể triệu chứng cho trợ lý để được gợi ý chuyên khoa và giờ khám.</Empty></div>
      )}

      <h2 className="eyebrow mb-3">Các lần khám</h2>
      {past.length ? (
        <ul className="mb-8 divide-y divide-line-2 rounded-lg border border-line bg-surface shadow-card">
          {past.map((r) => (
            <li key={r.id}>
              <Link href={`/lich-hen/${r.id}`} className="grid gap-1 px-4 py-3 hover:bg-paper sm:grid-cols-[120px_1fr_auto] sm:items-center sm:gap-4">
                <p className="num font-semibold">{dmy(r.date)}</p>
                <div>
                  <p className="font-semibold">{r.diagnosis ?? "—"}</p>
                  <p className="text-sm text-ink-3">{r.specialty.name} · {r.doctor.full_name}</p>
                </div>
                <span className="text-sm font-semibold text-brand">Xem kết quả, đơn thuốc →</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <div className="mb-8"><Empty title="Chưa có lần khám nào" /></div>}

      {other.length > 0 && (
        <details className="rounded-lg border border-line bg-surface shadow-card">
          <summary className="cursor-pointer px-4 py-3 font-semibold">Lịch đã hủy / hết hạn ({other.length})</summary>
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {other.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[15px]">
                <span><span className="num">{r.slot} {dmy(r.date)}</span> · {r.specialty.name}</span>
                <StatusTag status={r.status} />
              </li>
            ))}
          </ul>
        </details>
      )}

      <ProfileDialog open={edit} patient={patient} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />
    </PatientShell>
  );
}

function ProfileDialog({ open, patient, onClose, onSaved }: { open: boolean; patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ...patient, email: patient.email ?? "", address: patient.address ?? "", relative_name: patient.relative_name ?? "", relative_phone: patient.relative_phone ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/auth/patient/me", { method: "PUT", auth: "patient", body: {
        full_name: f.full_name, birth_year: Number(f.birth_year), gender: f.gender, email: f.email || null,
        address: f.address || null, relative_name: f.relative_name || null, relative_phone: f.relative_phone || null } });
      toast("Đã lưu thông tin", { tone: "ok" });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const s = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onClose={onClose} title="Thông tin cá nhân"
      footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={busy} onClick={save}>Lưu</Button></>}>
      {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Họ và tên" required className="sm:col-span-2"><Input value={f.full_name} onChange={s("full_name")} /></Field>
        <Field label="Năm sinh" required><Input inputMode="numeric" value={String(f.birth_year)} onChange={s("birth_year")} /></Field>
        <Field label="Giới tính" required>
          <Segmented value={f.gender as "NAM" | "NU"} onChange={(g) => setF({ ...f, gender: g })} size="lg" options={[{ value: "NAM", label: "Nam" }, { value: "NU", label: "Nữ" }]} />
        </Field>
        <Field label="Email" hint="Nhận xác nhận lịch, nhắc tái khám" className="sm:col-span-2"><Input type="email" value={f.email} onChange={s("email")} /></Field>
        <Field label="Địa chỉ" className="sm:col-span-2"><Input value={f.address} onChange={s("address")} /></Field>
        <Field label="Người thân"><Input value={f.relative_name} onChange={s("relative_name")} /></Field>
        <Field label="SĐT người thân"><Input inputMode="tel" value={f.relative_phone} onChange={s("relative_phone")} /></Field>
      </div>
    </Dialog>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts.at(-2)?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

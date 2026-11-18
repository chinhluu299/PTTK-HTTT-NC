"use client";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CalendarCheck, FileText, Pill } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { PatientShell } from "@/components/patient-shell";
import { photos } from "@/components/photos";
import { Spinner } from "@/components/ui";

export default function Page() {
  return <Suspense fallback={<Spinner />}><Login /></Suspense>;
}

function Login() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/ho-so";
  let sid: string | null = null;
  try { sid = typeof window !== "undefined" ? localStorage.getItem("mc.triage") : null; } catch { /* */ }
  return (
    <PatientShell wide>
      <div className="mx-auto grid max-w-5xl gap-10 py-4 lg:grid-cols-[1fr_360px] lg:gap-16">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-navy">Tài khoản bệnh nhân</h1>
          <p className="mt-1.5 mb-6 text-[15px] text-ink-3">Đăng nhập bằng số điện thoại đã dùng khi đặt lịch.</p>
          <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
            <AuthForm initialMode="login" triageSessionId={sid} onDone={() => router.replace(safeNext)} />
          </div>
        </div>
        <div className="relative self-start lg:mt-[84px]">
        <div className="squares absolute -top-12 -right-12 h-56 w-56" aria-hidden />
        <aside className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="relative aspect-[16/10] overflow-hidden bg-paper-2">
            <Image src={photos.care} alt="Bác sĩ chăm sóc bệnh nhân lớn tuổi" fill placeholder="blur" sizes="(min-width: 1024px) 360px, 100vw"
              className="object-cover object-[40%_center]" />
            <div className="absolute inset-0 bg-linear-to-t from-navy/80 via-navy/20 to-transparent" aria-hidden />
            <p className="absolute inset-x-5 bottom-4 text-[17px] leading-snug font-semibold text-white">Mọi lần khám của bạn, gọn trong một tài khoản.</p>
          </div>
          <ul className="space-y-4 p-6 text-[14.5px]">
            {[[CalendarCheck, "Lịch hẹn và mã QR check-in", "Đưa mã vào kiosk ở quầy lễ tân khi đến."],
              [FileText, "Kết quả khám và đơn thuốc", "Kết luận của bác sĩ, kết quả cận lâm sàng."],
              [Pill, "Lịch uống thuốc theo buổi", "Sáng, trưa, chiều, tối – kèm liều dùng."]].map(([I, t, d]) => {
              const Icon = I as typeof Pill;
              return (
                <li key={t as string} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand"><Icon className="size-[18px]" aria-hidden /></span>
                  <div><p className="font-semibold text-ink">{t as string}</p><p className="text-[13.5px] text-ink-3">{d as string}</p></div>
                </li>
              );
            })}
          </ul>
        </aside>
        </div>
      </div>
    </PatientShell>
  );
}

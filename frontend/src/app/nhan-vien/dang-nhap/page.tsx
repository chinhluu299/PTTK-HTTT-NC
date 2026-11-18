"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Brand } from "@/components/brand";
import { photos } from "@/components/photos";
import { ROLE_HOME } from "@/components/staff-shell";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { api, errMsg, setToken } from "@/lib/api";
import type { StaffBrief } from "@/lib/types";

const DEMO = [
  ["bs.an", "Bác sĩ Nội tổng quát"], ["bs.cuong", "Bác sĩ Tim mạch"], ["bs.giang", "Bác sĩ Da liễu"],
  ["ktv.xquang", "KTV Phòng X-quang"], ["ktv.xetnghiem", "KTV Phòng Xét nghiệm"], ["ktv.sieuam", "KTV Siêu âm – Điện tim"],
  ["duocsi", "Dược sĩ – thu ngân"], ["admin", "Quản trị viên"],
];

export default function Page() {
  return <Suspense fallback={<Spinner />}><Login /></Suspense>;
}

function Login() {
  const router = useRouter();
  const sp = useSearchParams();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login(username = u, password = p) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ token: string; staff: StaffBrief }>("/api/auth/staff/login", { body: { username, password } });
      setToken("staff", r.token);
      const next = sp.get("next");
      router.replace(next && next.startsWith("/nhan-vien/") && !next.includes("dang-nhap") ? next : ROLE_HOME[r.staff.role]);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(420px,0.9fr)_1fr]">
      {/* Khối thương hiệu */}
      <aside className="relative isolate hidden flex-col overflow-hidden bg-navy p-10 text-navy-ink lg:flex">
        <Image src={photos.doctorScan} alt="" fill placeholder="blur" loading="eager" fetchPriority="high" sizes="(min-width: 1024px) 50vw, 1px"
          className="settle -z-10 object-cover object-[35%_20%]" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-navy from-35% via-navy/80 to-navy/30" aria-hidden />
        <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-linear-to-b from-navy/80 to-transparent" aria-hidden />
        <Brand href="/" sub="Hệ thống quản lý phòng khám" onDark />
        <div className="mt-auto max-w-md">
          <h2 className="text-[30px] leading-tight font-bold tracking-[-0.02em] text-white">Một hệ thống cho cả quy trình khám chữa bệnh.</h2>
          <p className="mt-4 text-[15px] leading-relaxed">Từ lúc bệnh nhân check-in đến khi nhận thuốc: bác sĩ, kỹ thuật viên, dược sĩ và quản trị cùng làm việc trên một hồ sơ.</p>
          <p className="mt-10 border-t border-white/10 pt-5 text-[12.5px]">Phân hệ nội bộ. Mọi thao tác trên hồ sơ bệnh án đều được ghi nhật ký.</p>
        </div>
      </aside>

      {/* Biểu mẫu */}
      <div className="flex flex-col bg-surface">
        <div className="flex h-16 items-center justify-between px-6 lg:justify-end">
          <span className="lg:hidden"><Brand href="/" sub="Phân hệ nhân viên" /></span>
          <Link href="/" className="text-[13.5px] font-medium text-ink-3 hover:text-ink">← Về trang bệnh nhân</Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-[400px]">
            <h1 className="text-[26px] font-bold tracking-[-0.02em]">Đăng nhập</h1>
            <p className="mt-1 mb-7 text-[14.5px] text-ink-3">Dành cho bác sĩ, kỹ thuật viên, dược sĩ và quản trị viên.</p>
            <form onSubmit={(e) => { e.preventDefault(); login(); }} className="grid gap-4">
              {err && <Alert tone="danger">{err}</Alert>}
              <Field label="Tên đăng nhập" htmlFor="u"><Input id="u" autoComplete="username" placeholder="vd. bs.an" value={u} onChange={(e) => setU(e.target.value)} /></Field>
              <Field label="Mật khẩu" htmlFor="p"><Input id="p" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></Field>
              <Button type="submit" size="lg" loading={busy} disabled={!u || !p} className="mt-1">Đăng nhập</Button>
            </form>

            <div className="mt-10">
              <div className="mb-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <p className="text-[12.5px] font-medium text-ink-3">Tài khoản demo · mật khẩu <span className="mono font-semibold text-ink-2">123456</span></p>
                <span className="h-px flex-1 bg-line" />
              </div>
              <ul className="grid grid-cols-2 gap-2">
                {DEMO.map(([name, label]) => (
                  <li key={name}>
                    <button type="button" onClick={() => login(name, "123456")} disabled={busy}
                      className="flex w-full flex-col items-start rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-brand/40 hover:bg-brand-tint/50 disabled:opacity-50">
                      <span className="text-[13px] leading-snug font-medium text-ink">{label}</span>
                      <span className="mono text-[12px] text-ink-3">{name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

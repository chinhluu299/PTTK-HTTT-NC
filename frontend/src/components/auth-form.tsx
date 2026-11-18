"use client";
import { useState } from "react";
import { api, errMsg, setToken } from "@/lib/api";
import type { Patient } from "@/lib/types";
import { Alert, Button, Field, Input, Segmented } from "./ui";

type Mode = "register" | "login";

export function AuthForm({ onDone, triageSessionId, initialMode = "register", compact }: {
  onDone: (p: Patient) => void; triageSessionId?: string | null; initialMode?: Mode; compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [f, setF] = useState({ phone: "", password: "", full_name: "", birth_year: "", gender: "", email: "" });
  const [showEmail, setShowEmail] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (mode === "register" && !f.gender) return setErr("Vui lòng chọn giới tính");
    setBusy(true);
    try {
      const res = mode === "register"
        ? await api<{ token: string; patient: Patient }>("/api/auth/patient/register", {
          body: { phone: f.phone, password: f.password, full_name: f.full_name, birth_year: Number(f.birth_year),
            gender: f.gender, email: f.email || null, triage_session_id: triageSessionId ?? null } })
        : await api<{ token: string; patient: Patient }>("/api/auth/patient/login", {
          body: { phone: f.phone, password: f.password, triage_session_id: triageSessionId ?? null } });
      setToken("patient", res.token);
      onDone(res.patient);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Segmented value={mode} onChange={(m) => { setMode(m); setErr(null); }} name="Chọn cách"
        options={[{ value: "register", label: "Lần đầu đến khám" }, { value: "login", label: "Đã có tài khoản" }]} />
      {mode === "register" && !compact && (
        <p className="text-[15px] text-ink-2">Chỉ cần 5 thông tin. Phiên trò chuyện với trợ lý sẽ được lưu vào tài khoản để bác sĩ đọc trước khi khám.</p>
      )}
      {err && <Alert tone="danger">{err}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Số điện thoại" required htmlFor="phone">
          <Input id="phone" inputMode="tel" autoComplete="tel" placeholder="0901 234 567" value={f.phone} onChange={set("phone")} required />
        </Field>
        <Field label="Mật khẩu" required htmlFor="pw" hint={mode === "register" ? "Tối thiểu 6 ký tự" : undefined}>
          <Input id="pw" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={f.password} onChange={set("password")} required />
        </Field>
        {mode === "register" && (
          <>
            <Field label="Họ và tên" required htmlFor="name" className="sm:col-span-2">
              <Input id="name" autoComplete="name" placeholder="Nguyễn Văn A" value={f.full_name} onChange={set("full_name")} required />
            </Field>
            <Field label="Năm sinh" required htmlFor="by">
              <Input id="by" inputMode="numeric" placeholder="1980" maxLength={4} value={f.birth_year}
                onChange={(e) => setF({ ...f, birth_year: e.target.value.replace(/\D/g, "") })} required />
            </Field>
            <Field label="Giới tính" required>
              <Segmented value={f.gender as "NAM" | "NU"} onChange={(g) => setF({ ...f, gender: g })} size="lg" name="Giới tính"
                options={[{ value: "NAM", label: "Nam" }, { value: "NU", label: "Nữ" }]} />
            </Field>
            {showEmail ? (
              <Field label="Email (không bắt buộc)" htmlFor="email" hint="Để nhận email xác nhận lịch và nhắc tái khám" className="sm:col-span-2">
                <Input id="email" type="email" autoComplete="email" value={f.email} onChange={set("email")} />
              </Field>
            ) : (
              <button type="button" onClick={() => setShowEmail(true)} className="justify-self-start text-sm font-semibold text-brand underline-offset-2 hover:underline sm:col-span-2">
                + Thêm email để nhận xác nhận lịch (không bắt buộc)
              </button>
            )}
          </>
        )}
      </div>
      <Button type="submit" size="lg" loading={busy} block>
        {mode === "register" ? "Tạo tài khoản và tiếp tục" : "Đăng nhập và tiếp tục"}
      </Button>
    </form>
  );
}

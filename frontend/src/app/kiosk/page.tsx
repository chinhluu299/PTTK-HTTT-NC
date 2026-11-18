"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CameraOff, CircleCheck, Delete, KeyRound, Phone, QrCode, ScanLine } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { photos } from "@/components/photos";
import { Alert, Button, cx } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useConfig } from "@/lib/hooks";

interface KioskAppt { id: number; patient: string; slot: string; date: string; doctor: string; room: string | null; specialty: string; status: string; waiting_before: number; already?: boolean }

export default function Kiosk() {
  const cfg = useConfig();
  const [tab, setTab] = useState<"qr" | "phone" | "code">("qr");
  const [done, setDone] = useState<KioskAppt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!done && !err) return;
    const t = setTimeout(() => { setDone(null); setErr(null); }, done ? 12000 : 8000);
    return () => clearTimeout(t);
  }, [done, err]);

  async function checkinCode(code: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      setDone(await api<KioskAppt>("/api/kiosk/checkin", { body: { code } }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="relative isolate flex items-center justify-between overflow-hidden bg-navy px-6 py-6 text-white">
        <Image src={photos.lobby} alt="" fill placeholder="blur" loading="eager" sizes="100vw" className="-z-10 object-cover object-[50%_62%]" />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-navy via-navy/90 to-navy/55" aria-hidden />
        <div className="flex items-center gap-3">
          <BrandMark size={44} onDark />
          <div>
            <p className="text-[22px] leading-tight font-bold tracking-[-0.02em]">Check-in khám bệnh</p>
            <p className="text-sm text-navy-ink">{cfg?.clinic_name ?? "Phòng khám MedCare"}</p>
          </div>
        </div>
        <Clock />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-6">
        {done ? (
          <Success a={done} onNext={() => setDone(null)} />
        ) : (
          <>
            <div className="mb-5 grid grid-cols-3 gap-2" role="tablist">
              {([["qr", "Quét mã QR", QrCode], ["phone", "Nhập số điện thoại", Phone], ["code", "Nhập mã khám", KeyRound]] as const).map(([k, l, I]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setErr(null); }}
                  className={cx("flex h-16 items-center justify-center gap-2.5 rounded-xl border text-lg font-semibold transition-colors",
                    tab === k ? "border-brand bg-brand text-white shadow-raised" : "border-line bg-surface text-ink-2 shadow-card hover:border-brand/50 hover:text-ink")}>
                  <I className="size-6" aria-hidden />{l}
                </button>
              ))}
            </div>
            {err && <Alert tone="danger" className="mb-4 text-lg" title={err} />}
            <div className="flex-1 rounded-lg border border-line bg-surface shadow-card p-6">
              {tab === "qr" && <Scanner onCode={checkinCode} paused={busy || !!err} />}
              {tab === "phone" && <PhoneFlow onDone={setDone} onError={setErr} />}
              {tab === "code" && <CodeFlow onSubmit={checkinCode} busy={busy} />}
            </div>
            <p className="mt-5 text-center text-lg text-ink-2">
              Chưa đặt lịch? <Link href="/dat-lich" className="font-bold text-brand underline underline-offset-4">Đặt lịch ngay tại đây</Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () => setT(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
    f();
    const i = setInterval(f, 10000);
    return () => clearInterval(i);
  }, []);
  return <p className="num text-3xl font-bold">{t}</p>;
}

function Scanner({ onCode, paused }: { onCode: (c: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"starting" | "on" | "denied">("starting");
  const pausedRef = useRef(paused);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onCodeRef = useRef(onCode);
  useEffect(() => { pausedRef.current = paused; onCodeRef.current = onCode; });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let alive = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (!alive || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setState("on");
        const tick = () => {
          const v = video.current, c = canvas.current;
          if (v && c && v.readyState === v.HAVE_ENOUGH_DATA && !pausedRef.current) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            const code = qr?.data?.trim().toUpperCase();
            if (code && /^[A-Z0-9]{12}$/.test(code)) {
              const now = Date.now();
              if (code !== lastRef.current.code || now - lastRef.current.at > 5000) {
                lastRef.current = { code, at: now };
                onCodeRef.current(code);
              }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setState("denied");
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="grid items-center gap-6 md:grid-cols-[1fr_300px]">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-navy">
        <video ref={video} muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
        <canvas ref={canvas} className="hidden" />
        {state === "on" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="size-[55%] max-h-[260px] max-w-[260px] rounded-lg border-4 border-focus" />
          </div>
        )}
        {state !== "on" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
            {state === "denied" ? <CameraOff className="size-10" aria-hidden /> : <ScanLine className="size-10 animate-pulse" aria-hidden />}
            <p className="text-lg">{state === "denied" ? "Không mở được camera. Hãy dùng số điện thoại hoặc mã khám." : "Đang mở camera…"}</p>
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold">Đưa mã QR vào khung vàng</p>
        <p className="mt-2 text-lg text-ink-2">Mã QR có trong email xác nhận hoặc trên trang lịch hẹn trong điện thoại của bạn.</p>
      </div>
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

function PhoneFlow({ onDone, onError }: { onDone: (a: KioskAppt) => void; onError: (e: string | null) => void }) {
  const [phone, setPhone] = useState("");
  const [list, setList] = useState<KioskAppt[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function lookup() {
    setBusy(true);
    onError(null);
    try {
      const r = await api<KioskAppt[]>("/api/kiosk/lookup", { body: { phone } });
      setList(r);
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function pick(a: KioskAppt) {
    setBusy(true);
    try {
      onDone(await api<KioskAppt>("/api/kiosk/checkin-by-phone", { body: { appointment_id: a.id, phone } }));
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  if (list) {
    return (
      <div>
        <p className="mb-4 text-2xl font-bold">{list.length ? "Chọn lịch hẹn của bạn hôm nay" : "Không tìm thấy lịch hẹn hôm nay"}</p>
        <div className="grid gap-3">
          {list.map((a) => (
            <button key={a.id} disabled={busy} onClick={() => pick(a)} className="flex items-center gap-5 rounded-xl border border-line bg-surface p-4 text-left shadow-card hover:border-brand/50">
              <span className="num text-4xl font-bold">{a.slot}</span>
              <span className="flex-1">
                <span className="block text-xl font-bold">{a.patient}</span>
                <span className="text-lg text-ink-2">{a.specialty} · {a.doctor} · Phòng {a.room}</span>
              </span>
              <span className="rounded-md bg-brand px-4 py-3 text-lg font-bold text-white">{a.status === "CHECKED_IN" ? "Đã check-in" : "Check-in"}</span>
            </button>
          ))}
        </div>
        <Button variant="secondary" size="lg" className="mt-5" onClick={() => { setList(null); setPhone(""); }}>Nhập lại số khác</Button>
      </div>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      <div>
        <p className="text-2xl font-bold">Số điện thoại đã đặt lịch</p>
        <p className="num mt-4 min-h-[64px] rounded-xl border border-line-strong bg-surface px-4 py-3 text-[40px] leading-none font-bold tracking-wider shadow-xs">
          {phone.replace(/(\d{4})(\d{0,3})(\d{0,3})/, (_, a, b, c) => [a, b, c].filter(Boolean).join(" ")) || <span className="text-line">0___ ___ ___</span>}
        </p>
        <Button size="xl" block className="mt-5" disabled={phone.length < 10} loading={busy} onClick={lookup}>Tìm lịch hẹn</Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k, i) => k === "" ? <span key={i} /> : (
          <button key={i} aria-label={k === "del" ? "Xóa" : k}
            onClick={() => setPhone((p) => (k === "del" ? p.slice(0, -1) : p.length < 10 ? p + k : p))}
            className="num flex h-[72px] items-center justify-center rounded-xl border border-line bg-surface text-3xl font-semibold shadow-card hover:border-brand/50 active:bg-brand-tint">
            {k === "del" ? <Delete className="size-7" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

function CodeFlow({ onSubmit, busy }: { onSubmit: (c: string) => void; busy: boolean }) {
  const [code, setCode] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(code); }} className="mx-auto max-w-xl">
      <label htmlFor="code" className="text-2xl font-bold">Mã khám 12 ký tự</label>
      <input id="code" value={code} autoFocus autoComplete="off" spellCheck={false} maxLength={12}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        className="field-input mono mt-4 !min-h-[72px] text-center !text-[34px] font-bold tracking-[0.2em]" placeholder="ABC1234ABC09" />
      <Button type="submit" size="xl" block className="mt-5" disabled={code.length !== 12} loading={busy}>Check-in</Button>
    </form>
  );
}

function Success({ a, onNext }: { a: KioskAppt; onNext: () => void }) {
  return (
    <div className="enter flex flex-1 flex-col items-center justify-center rounded-xl border border-ok/40 bg-surface p-8 text-center shadow-raised">
      <CircleCheck className="size-20 text-ok" aria-hidden />
      <p className="mt-3 text-[34px] font-bold">{a.already ? "Bạn đã check-in rồi" : "Check-in thành công"}</p>
      <p className="mt-1 text-xl text-ink-2">Xin chào {a.patient}</p>
      <div className="mt-6 rounded-xl bg-navy px-10 py-5 text-white">
        <p className="text-lg">Mời bạn đến</p>
        <p className="text-[44px] leading-tight font-bold">Phòng {a.room}</p>
        <p className="text-lg text-white/85">{a.doctor} · {a.specialty}</p>
      </div>
      <p className="mt-5 text-xl">{a.waiting_before ? <>Có <b>{a.waiting_before}</b> người đang chờ trước bạn</> : "Bạn là người tiếp theo"}</p>
      <Button size="xl" variant="secondary" className="mt-8" onClick={onNext}>Xong</Button>
    </div>
  );
}

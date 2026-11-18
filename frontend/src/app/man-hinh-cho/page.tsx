"use client";
import { BrandMark } from "@/components/brand";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/api";
import { useEvents } from "@/lib/hooks";

interface Board { called: { number: number; call_count: number }[]; waiting: number[]; served_count: number }

/** Màn hình chờ quầy thuốc: số lớn, đọc tự động bằng Web Speech API. */
export default function Display() {
  const [b, setB] = useState<Board | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [sound, setSound] = useState(false);
  const [time, setTime] = useState("");
  const soundRef = useRef(false);
  useEffect(() => { soundRef.current = sound; }, [sound]);

  const load = useCallback(() => api<Board>("/api/display/pharmacy").then(setB).catch(() => {}), []);
  useEffect(() => {
    load();
    const f = () => setTime(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
    f();
    const t = setInterval(() => { f(); load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  const speak = (n: number) => {
    if (!soundRef.current || !("speechSynthesis" in window)) return;
    const say = (text: string) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "vi-VN";
      u.rate = 0.9;
      const vi = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("vi"));
      if (vi) u.voice = vi;
      speechSynthesis.speak(u);
    };
    say(`Mời số ${n} đến quầy thuốc.`);
    say(`Số ${n}.`);
  };

  useEvents("/api/events/display", {
    call: (d) => {
      const n = Number(d.number);
      setFlash(n);
      speak(n);
      setTimeout(() => setFlash(null), 6000);
      load();
    },
    queue_updated: () => load(),
  });

  const current = b?.called[0];
  return (
    <div className="flex min-h-dvh flex-col bg-navy text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-5">
        <div className="flex items-center gap-4">
          <BrandMark size={44} onDark />
          <div>
            <p className="text-[26px] leading-tight font-bold tracking-[-0.02em]">Quầy thuốc – Thu ngân</p>
            <p className="text-[15px] text-navy-ink">Vui lòng chú ý số thứ tự của bạn</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <button onClick={() => { setSound(!sound); if (!sound && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(" ")); }}
            className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-semibold hover:bg-white/10">
            {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}{sound ? "Đang bật đọc số" : "Bấm để bật đọc số"}
          </button>
          <p className="num text-4xl font-bold">{time}</p>
        </div>
      </header>
      <main className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[1.4fr_1fr]">
        <section className="flex flex-col items-center justify-center border-white/10 p-8 lg:border-r">
          <p className="rounded-full bg-white/10 px-5 py-1.5 text-2xl font-semibold text-white/85">Mời số</p>
          {current ? (
            <p className={`num text-[min(34vw,320px)] leading-none font-bold tracking-[-0.03em] transition-colors ${flash ? "text-[#ffc845]" : "text-white"}`} aria-live="assertive">
              {current.number}
            </p>
          ) : (
            <div className="my-10 h-[200px] w-[min(70vw,380px)] rounded-3xl border-2 border-dashed border-white/15" aria-hidden />
          )}
          <p className="mt-2 text-2xl text-navy-ink">{current ? "đến quầy nhận thuốc và thanh toán" : "Chưa có số được gọi"}</p>
          {b && b.called.length > 1 && (
            <p className="mt-8 text-xl text-white/60">Vừa gọi: <span className="num font-bold text-white/85">{b.called.slice(1, 5).map((c) => c.number).join("   ")}</span></p>
          )}
        </section>
        <section className="p-8">
          <p className="mb-5 text-2xl font-semibold text-white/85">Đang chờ <span className="num text-navy-ink">({b?.waiting.length ?? 0})</span></p>
          <div className="grid grid-cols-3 gap-3">
            {b?.waiting.slice(0, 12).map((n) => (
              <div key={n} className="num rounded-xl border border-white/10 bg-white/[0.06] py-5 text-center text-5xl font-bold">{n}</div>
            ))}
          </div>
          {b && !b.waiting.length && <p className="text-xl text-white/50">Không còn ai chờ</p>}
          <p className="mt-8 text-lg text-navy-ink">Số thứ tự hiển thị trên điện thoại của bạn ngay khi bác sĩ chốt ca.</p>
        </section>
      </main>
    </div>
  );
}

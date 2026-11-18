"use client";
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

type Tone = "info" | "ok" | "danger";
interface Toast { id: number; tone: Tone; title: string; body?: string }

let seq = 0;
const listeners = new Set<(t: Toast) => void>();

export function toast(title: string, opts: { tone?: Tone; body?: string } = {}) {
  const t = { id: ++seq, tone: opts.tone ?? "info", title, body: opts.body };
  listeners.forEach((l) => l(t));
}

const TONE = {
  info: { icon: Info, bar: "bg-brand", ic: "text-brand" },
  ok: { icon: CircleCheck, bar: "bg-ok", ic: "text-ok" },
  danger: { icon: CircleAlert, bar: "bg-danger", ic: "text-danger" },
};

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setItems((xs) => [...xs.slice(-3), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 6000);
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);
  return (
    <div aria-live="polite" className="no-print fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-[380px]">
      {items.map((t) => {
        const s = TONE[t.tone];
        const Icon = s.icon;
        return (
          <div key={t.id} className="enter relative flex gap-3 overflow-hidden rounded-lg border border-line bg-surface shadow-card p-3 pl-4 shadow-[0_8px_24px_rgba(15,27,42,0.14)]">
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />
            <Icon className={`mt-0.5 size-5 shrink-0 ${s.ic}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{t.title}</p>
              {t.body && <p className="mt-0.5 text-sm text-ink-2">{t.body}</p>}
            </div>
            <button aria-label="Đóng" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="text-ink-3 hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

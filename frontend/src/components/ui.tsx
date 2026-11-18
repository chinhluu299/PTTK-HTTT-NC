"use client";
import Link from "next/link";
import { forwardRef, useEffect, useId, useRef, type ReactNode } from "react";
import { Check, CircleAlert, Info, Loader2, Lock, TriangleAlert, X, CircleCheck } from "lucide-react";
import type { LabStatus, Status, Urgency } from "@/lib/types";

export function cx(...xs: unknown[]) {
  return xs.filter((x) => typeof x === "string" && x).join(" ");
}

/* ───────────── Button ───────────── */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "quiet";
type Size = "sm" | "md" | "lg" | "xl";

const V: Record<Variant, string> = {
  primary: "bg-brand text-white border-brand shadow-xs hover:bg-brand-strong hover:border-brand-strong",
  secondary: "bg-surface text-ink border-line-strong shadow-xs hover:bg-paper hover:border-[#a9b5c3]",
  ghost: "bg-transparent text-brand border-transparent hover:bg-brand-tint",
  danger: "bg-danger text-white border-danger shadow-xs hover:bg-danger-strong hover:border-danger-strong",
  success: "bg-ok text-white border-ok shadow-xs hover:brightness-95",
  quiet: "bg-paper-2 text-ink-2 border-transparent hover:bg-line hover:text-ink",
};
const S: Record<Size, string> = {
  sm: "h-8 px-3 text-[13.5px] gap-1.5",
  md: "h-10 px-4 text-[14.5px] gap-2",
  lg: "h-12 px-5 text-[15.5px] gap-2",
  xl: "h-14 px-6 text-[16.5px] gap-3",
};

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center rounded-lg border font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        V[variant], S[size], block && "w-full", className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({ href, variant = "primary", size = "md", block, className, children }: {
  href: string; variant?: Variant; size?: Size; block?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(
      "inline-flex items-center justify-center rounded-lg border font-semibold whitespace-nowrap transition-colors",
      V[variant], S[size], block && "w-full", className)}>
      {children}
    </Link>
  );
}

/* ───────────── Form ───────────── */
export function Field({ label, hint, error, children, required, htmlFor, className }: {
  label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; required?: boolean; htmlFor?: string; className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13.5px] font-semibold text-ink-2">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[13px] text-ink-3">{hint}</p>}
      {error && (
        <p className="flex items-center gap-1 text-[13px] font-medium text-danger">
          <CircleAlert className="size-3.5" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest }, ref) {
  return <input ref={ref} className={cx("field-input", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx("field-input resize-y", className)} {...rest} />;
  });

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("field-input appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2366768a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md", name }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "md" | "lg"; name?: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex w-fit max-w-full self-start overflow-x-auto rounded-lg bg-paper-2 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("rounded-md px-3.5 font-semibold transition-colors", size === "lg" ? "h-10 text-[15px]" : "h-8 text-[13.5px]",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Layout blocks ───────────── */
export function Panel({ title, eyebrow, actions, children, className, bodyClass, tone }: {
  title?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
  tone?: "default" | "brand" | "warn" | "danger";
}) {
  const border = tone === "warn" ? "border-warn-line" : tone === "danger" ? "border-danger/45" : tone === "brand" ? "border-brand/40" : "border-line";
  const head = tone === "danger" ? "bg-danger-tint/70" : tone === "warn" ? "bg-warn-tint/60" : tone === "brand" ? "bg-brand-tint/60" : "";
  return (
    <section className={cx("overflow-hidden rounded-lg border bg-surface shadow-card", border, className)}>
      {(title || actions || eyebrow) && (
        <header className={cx("flex items-center justify-between gap-3 border-b border-line-2 px-4 py-3 sm:px-5", head)}>
          <div className="min-w-0">
            {title && <h2 className="text-[15.5px] font-semibold leading-snug text-ink">{title}</h2>}
            {eyebrow && <p className={cx("text-[13px] leading-snug text-ink-3", title && "mt-0.5")}>{eyebrow}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("px-4 py-4 sm:px-5", bodyClass)}>{children}</div>
    </section>
  );
}

export function KV({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2.5 text-[15px]", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Alert({ tone = "info", title, children, icon, className }: {
  tone?: "info" | "warn" | "danger" | "ok"; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string;
}) {
  const map = {
    info: ["bg-brand-tint border-brand-tint-2 text-ink", <Info key="i" className="size-[18px] text-brand" />],
    warn: ["bg-warn-tint border-warn-line/80 text-ink", <TriangleAlert key="w" className="size-[18px] text-warn" />],
    danger: ["bg-danger-tint border-danger/30 text-ink", <CircleAlert key="d" className="size-[18px] text-danger" />],
    ok: ["bg-ok-tint border-ok/25 text-ink", <CircleCheck key="o" className="size-[18px] text-ok" />],
  } as const;
  const [cls, ic] = map[tone];
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cx("flex gap-3 rounded-lg border px-4 py-3", cls, className)}>
      <span className="mt-[3px] shrink-0" aria-hidden>{icon ?? ic}</span>
      <div className="min-w-0 flex-1 text-[14.5px]">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && "mt-0.5", "text-ink-2")}>{children}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-16 text-[14.5px] text-ink-3" role="status">
      <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      {icon && <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-paper-2 text-ink-3 [&_svg]:size-5">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="max-w-sm text-[14px] text-ink-3">{children}</div>}
    </div>
  );
}

export function Forbidden({ message, back }: { message: string; back?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-line bg-surface shadow-card px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-tint text-danger">
        <Lock className="size-7" aria-hidden />
      </span>
      <p className="num text-[13px] font-semibold text-danger">Lỗi 403 · Không có quyền truy cập</p>
      <p className="text-lg font-semibold">{message}</p>
      <p className="text-sm text-ink-3">Yêu cầu đã bị máy chủ từ chối. Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ quản trị viên.</p>
      {back}
    </div>
  );
}

/* ───────────── Tags ───────────── */
const STATUS_STYLE: Record<Status, string> = {
  HOLD: "bg-warn-tint text-warn border-warn-line/70",
  CONFIRMED: "bg-surface text-ink-2 border-line-strong",
  CHECKED_IN: "bg-brand-tint text-brand-strong border-brand-tint-2",
  IN_CONSULTATION: "bg-brand text-white border-brand",
  WAITING_LAB: "bg-lab-tint text-lab border-lab/25",
  COMPLETED: "bg-ok-tint text-ok border-ok/25",
  PAID: "bg-ok text-white border-ok",
  EXPIRED: "bg-paper-2 text-ink-3 border-line",
  CANCELLED: "bg-paper-2 text-ink-3 border-line",
  NO_SHOW: "bg-danger-tint text-danger border-danger/20",
};
export const STATUS_LABEL: Record<Status, string> = {
  HOLD: "Đang giữ chỗ", CONFIRMED: "Đã đặt cọc", CHECKED_IN: "Đã check-in", IN_CONSULTATION: "Đang khám",
  WAITING_LAB: "Chờ cận lâm sàng", COMPLETED: "Đã chốt ca", PAID: "Đã thanh toán", EXPIRED: "Hết hạn giữ chỗ",
  CANCELLED: "Đã hủy", NO_SHOW: "Vắng mặt",
};

export function Tag({ className, children, dot }: { className?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-semibold whitespace-nowrap", className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function StatusTag({ status }: { status: Status }) {
  return <Tag className={STATUS_STYLE[status]} dot>{STATUS_LABEL[status]}</Tag>;
}

export const URGENCY: Record<Urgency, { label: string; long: string; cls: string }> = {
  CAP_CUU: { label: "Cấp cứu", long: "Cần đến cơ sở cấp cứu ngay", cls: "bg-danger text-white border-danger" },
  KHAM_SOM: { label: "Nên khám sớm", long: "Nên được khám trong 24–48 giờ", cls: "bg-warn-tint text-warn border-warn-line/70" },
  BINH_THUONG: { label: "Bình thường", long: "Có thể đặt lịch khám thông thường", cls: "bg-ok-tint text-ok border-ok/25" },
};
export function UrgencyTag({ u }: { u: Urgency | null | undefined }) {
  if (!u) return null;
  return <Tag className={URGENCY[u].cls}>{URGENCY[u].label}</Tag>;
}

const LAB_STYLE: Record<LabStatus, string> = {
  ORDERED: "bg-warn-tint text-warn border-warn-line/70",
  IN_PROGRESS: "bg-lab-tint text-lab border-lab/25",
  DONE: "bg-ok-tint text-ok border-ok/25",
  CANCELLED: "bg-paper-2 text-ink-3 border-line",
};
export function LabTag({ status, label }: { status: LabStatus; label: string }) {
  return <Tag className={LAB_STYLE[status]} dot>{label}</Tag>;
}

export function AmendedTag() {
  return <Tag className="bg-warn-tint text-warn border-warn-line/70">Đã chỉnh sửa</Tag>;
}

/* ───────────── Dialog ───────────── */
export function Dialog({ open, onClose, title, children, footer, tone, size = "md", dismissable = true, labelledBy }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode;
  tone?: "danger" | "default"; size?: "sm" | "md" | "lg"; dismissable?: boolean; labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const w = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";
  return (
    <dialog ref={ref} aria-labelledby={labelledBy ?? id}
      onCancel={(e) => { e.preventDefault(); if (dismissable) onClose(); }}
      className={cx("m-auto w-[calc(100%-24px)] overflow-hidden rounded-xl border-0 bg-surface p-0 text-ink shadow-pop backdrop:bg-navy/60 backdrop:backdrop-blur-[2px]", w)}>
      {open && (
        <div className="flex max-h-[calc(100dvh-32px)] flex-col">
          {title && (
            <header className={cx("flex items-start justify-between gap-3 px-5 py-4", tone === "danger" ? "bg-danger text-white" : "border-b border-line-2")}>
              <h2 id={id} className="text-[17px] font-semibold leading-snug">{title}</h2>
              {dismissable && (
                <button onClick={onClose} aria-label="Đóng" className={cx("-mr-1 rounded p-1", tone === "danger" ? "text-white/90 hover:bg-white/15" : "text-ink-3 hover:bg-paper")}>
                  <X className="size-5" />
                </button>
              )}
            </header>
          )}
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-2 bg-paper px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Ô số liệu: nhãn, giá trị lớn, dòng phụ. `highlight` khi cần bác sĩ / nhân viên chú ý. */
export function StatCard({ label, value, sub, icon, highlight, className }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; highlight?: boolean; className?: string;
}) {
  return (
    <div className={cx("relative overflow-hidden rounded-lg border bg-surface px-4 py-3.5 shadow-card sm:px-5 sm:py-4",
      highlight ? "border-brand/45" : "border-line", className)}>
      {highlight && <span className="absolute inset-x-0 top-0 h-[3px] bg-brand" aria-hidden />}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13.5px] font-medium text-ink-3">{label}</p>
        {icon && <span className={cx("hidden size-8 shrink-0 items-center justify-center rounded-md sm:flex [&_svg]:size-4",
          highlight ? "bg-brand-tint text-brand" : "bg-paper-2 text-ink-3")} aria-hidden>{icon}</span>}
      </div>
      <p className={cx("num mt-1 text-[28px] leading-tight font-bold tracking-[-0.02em]", highlight ? "text-brand" : "text-ink")}>{value}</p>
      {sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}
    </div>
  );
}

/* ───────────── Misc ───────────── */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto text-[13px] sm:gap-2 sm:text-[13.5px]" aria-label="Các bước">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "now" : "todo";
        return (
          <li key={s} className="flex shrink-0 items-center gap-1 sm:gap-2" aria-current={state === "now" ? "step" : undefined}>
            <span className={cx("flex size-6 items-center justify-center rounded-full border text-[11.5px] font-bold num",
              state === "done" && "border-brand bg-brand-tint text-brand", state === "now" && "border-brand bg-brand text-white shadow-[0_0_0_4px_rgba(11,92,171,0.12)]",
              state === "todo" && "border-line-strong bg-surface text-ink-3")}>
              {state === "done" ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={cx("font-semibold", state === "todo" ? "text-ink-3" : state === "done" ? "text-ink-2" : "text-ink", state !== "now" && "hidden sm:inline")}>{s}</span>
            {i < steps.length - 1 && <span className={cx("mx-1 h-px w-4 sm:w-10", state === "done" ? "bg-brand/50" : "bg-line-strong")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

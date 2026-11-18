"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { cx } from "./ui";

/** Biểu tượng MedCare: chữ thập y tế đặt trong ô vuông bo góc, một góc nhấn màu sáng. */
export function BrandMark({ size = 32, onDark }: { size?: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill={onDark ? "#ffffff" : "#0b5cab"} />
      <rect x="6.5" y="6.5" width="8" height="8" rx="2" fill={onDark ? "#cfe0f3" : "#4d93dc"} />
      <path d="M13.25 7.5h5.5v5.75h5.75v5.5h-5.75v5.75h-5.5v-5.75H7.5v-5.5h5.75z" fill={onDark ? "#0b5cab" : "#ffffff"} />
    </svg>
  );
}

export function Brand({ href = "/", sub = "Phòng khám Đa khoa", onDark }: { href?: string; sub?: string; onDark?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-md">
      <BrandMark onDark={onDark} />
      <span className="flex flex-col leading-none">
        <span className={cx("text-[17px] font-bold tracking-[-0.02em] whitespace-nowrap", onDark ? "text-white" : "text-navy")}>MedCare</span>
        {sub && <span className={cx("mt-1 hidden text-[11.5px] font-medium whitespace-nowrap sm:block", onDark ? "text-navy-ink" : "text-ink-3")}>{sub}</span>}
      </span>
    </Link>
  );
}

export function QR({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, value, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1a2b", light: "#ffffff" } });
    }
  }, [value, size]);
  return <canvas ref={ref} width={size} height={size} role="img" aria-label={label} className="block" style={{ width: size, height: size }} />;
}

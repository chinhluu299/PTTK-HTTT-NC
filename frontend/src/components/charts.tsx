"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/* Bảng màu biểu đồ (đã kiểm tra CVD / độ tương phản trên nền trắng) */
export const SERIES = ["#1f6fc5", "#e0712c"];
const GRID = "#edf1f5";
const AXIS_TEXT = "#66768a";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function Tip({ x, y, children, w }: { x: number; y: number; children: ReactNode; w: number }) {
  const left = Math.min(Math.max(x, 70), w - 70);
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] whitespace-nowrap shadow-raised"
      style={{ left, top: y - 8 }}>
      {children}
    </div>
  );
}

/** Cột – một chuỗi số liệu theo thời gian. */
export function ColumnChart({ data, height = 220, format = (v: number) => String(v), label }: {
  data: { label: string; value: number; tip?: string }[]; height?: number; format?: (v: number) => string; label: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const pad = { l: 36, r: 8, t: 16, b: 28 };
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const band = data.length ? iw / data.length : 0;
  const bw = Math.min(24, band * 0.6);
  const ticks = [0, max / 2, max];
  return (
    <div ref={ref} className="relative">
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={label}>
          {ticks.map((t) => {
            const y = pad.t + ih - (t / max) * ih;
            return (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize={11.5} fill={AXIS_TEXT}>{format(t)}</text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / max) * ih;
            const x = pad.l + band * i + (band - bw) / 2;
            const y = pad.t + ih - h;
            const r = Math.min(4, h);
            return (
              <g key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
                {h > 0 && (
                  <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`}
                    fill={SERIES[0]} opacity={hi === null || hi === i ? 1 : 0.45} />
                )}
                <text x={pad.l + band * i + band / 2} y={height - 8} textAnchor="middle" fontSize={11.5} fill={AXIS_TEXT}>{d.label}</text>
              </g>
            );
          })}
          {data.length > 0 && (() => {
            const last = data[data.length - 1];
            const x = pad.l + band * (data.length - 1) + band / 2;
            const y = pad.t + ih - (last.value / max) * ih;
            return <text x={x} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="#0b1a2b">{format(last.value)}</text>;
          })()}
        </svg>
      )}
      {hi !== null && w > 0 && (
        <Tip x={pad.l + band * hi + band / 2} y={pad.t + ih - (data[hi].value / max) * ih} w={w}>
          <b>{data[hi].tip ?? data[hi].label}</b> · {format(data[hi].value)}
        </Tip>
      )}
    </div>
  );
}

/** Đường – tối đa 2 chuỗi cùng đơn vị, một trục. null = không có dữ liệu. */
export function LineChart({ labels, series, height = 220, format, label }: {
  labels: string[]; series: { name: string; values: (number | null)[] }[]; height?: number; format: (v: number) => string; label: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const pad = { l: 40, r: 64, t: 14, b: 28 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = niceMax(Math.max(...all, 0.01));
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const step = labels.length > 1 ? iw / (labels.length - 1) : 0;
  const X = (i: number) => pad.l + step * i;
  const Y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex flex-wrap gap-4 text-[13px]">
        {series.map((s, i) => (
          <span key={s.name} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES[i] }} aria-hidden />{s.name}</span>
        ))}
      </div>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={label}
          onMouseMove={(e) => {
            const x = e.clientX - (e.currentTarget.getBoundingClientRect().left);
            const i = Math.round((x - pad.l) / (step || 1));
            setHi(i >= 0 && i < labels.length ? i : null);
          }} onMouseLeave={() => setHi(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 6} y={Y(t) + 4} textAnchor="end" fontSize={11.5} fill={AXIS_TEXT}>{format(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => <text key={i} x={X(i)} y={height - 8} textAnchor="middle" fontSize={11.5} fill={AXIS_TEXT}>{l}</text>)}
          {hi !== null && <line x1={X(hi)} x2={X(hi)} y1={pad.t} y2={pad.t + ih} stroke="#c3ccd7" strokeWidth={1} />}
          {series.map((s, si) => {
            const pts = s.values.map((v, i) => (v === null ? null : [X(i), Y(v)] as const));
            let d = "";
            pts.forEach((p, i) => { if (p) d += `${d && pts[i - 1] ? "L" : "M"}${p[0]},${p[1]} `; });
            const lastIdx = s.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {hi !== null && pts[hi] && <circle cx={pts[hi]![0]} cy={pts[hi]![1]} r={4.5} fill={SERIES[si]} stroke="#fff" strokeWidth={2} />}
                {lastIdx !== undefined && (
                  <>
                    <circle cx={X(lastIdx)} cy={Y(s.values[lastIdx]!)} r={4} fill={SERIES[si]} stroke="#fff" strokeWidth={2} />
                    <text x={X(lastIdx) + 8} y={Y(s.values[lastIdx]!) + 4 + (si === 1 && series.length > 1 && Math.abs(Y(series[0].values[lastIdx] ?? 0) - Y(s.values[lastIdx]!)) < 14 ? 12 : 0)} fontSize={12} fontWeight={600} fill="#0b1a2b">
                      {format(s.values[lastIdx]!)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hi !== null && w > 0 && (
        <Tip x={X(hi)} y={pad.t + 30} w={w}>
          <p className="font-semibold">{labels[hi]}</p>
          {series.map((s, i) => (
            <p key={s.name} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: SERIES[i] }} aria-hidden />{s.name}: <b>{s.values[hi] === null ? "—" : format(s.values[hi]!)}</b></p>
          ))}
        </Tip>
      )}
    </div>
  );
}

/** Thanh ngang xếp hạng – một chuỗi. threshold: vạch mục tiêu (cùng đơn vị). */
export function HBarChart({ rows, max, format, threshold, warnBelow }: {
  rows: { label: string; value: number; note?: ReactNode }[]; max?: number; format: (v: number) => string;
  threshold?: { value: number; label: string }; warnBelow?: number;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const m = max ?? niceMax(Math.max(...rows.map((r) => r.value), 1));
  return (
    <div className="relative">
      <ul className="space-y-2.5">
        {rows.map((r, i) => {
          const weak = warnBelow !== undefined && r.value < warnBelow;
          return (
            <li key={r.label} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-[14px] sm:grid-cols-[170px_1fr_auto]"
              onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
              <span className="truncate" title={r.label}>{r.label}</span>
              <span className="relative h-6">
                <span className="absolute inset-y-[5px] left-0 rounded-r-[4px]" style={{ width: `${(r.value / m) * 100}%`, background: SERIES[0], opacity: hi === null || hi === i ? 1 : 0.45 }} />
                {threshold && <span className="absolute inset-y-0 w-px bg-ink" style={{ left: `${(threshold.value / m) * 100}%` }} aria-hidden />}
              </span>
              <span className="flex min-w-[64px] items-center justify-end gap-1 font-semibold">
                {weak && <TriangleAlert className="size-3.5 text-warn" aria-label="Dưới mục tiêu" />}
                {format(r.value)}
              </span>
              {hi === i && r.note && (
                <span className="col-span-3 -mt-1 text-[13px] text-ink-3 sm:col-start-2">{r.note}</span>
              )}
            </li>
          );
        })}
      </ul>
      {threshold && <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3"><span className="h-3 w-px bg-ink" aria-hidden />{threshold.label}</p>}
    </div>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-[13.5px]">
      <summary className="cursor-pointer font-semibold text-brand">Xem dạng bảng</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-line text-left text-ink-3">{head.map((h, i) => <th key={i} className="py-1.5 pr-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line-2">{r.map((c, j) => <td key={j} className="num py-1.5 pr-3">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

const WEEKDAY = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function parseDate(iso: string): Date {
  // "2026-11-04" -> ngày địa phương (tránh lệch múi giờ)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

export function vnd(n: number | null | undefined): string {
  return `${(n ?? 0).toLocaleString("vi-VN")} đ`;
}

export function dmy(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function dayLabel(iso: string): string {
  const d = parseDate(iso);
  return `${WEEKDAY[d.getDay()]}, ${dmy(iso)}`;
}

export function dayShort(iso: string): { wd: string; dm: string } {
  const d = parseDate(iso);
  return {
    wd: WEEKDAY_SHORT[d.getDay()],
    dm: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
  };
}

export function relativeDay(iso: string): string | null {
  const d = parseDate(iso);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Ngày mai";
  if (diff === -1) return "Hôm qua";
  return null;
}

export function hm(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${hm(iso)} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function genderLabel(g: string | null | undefined): string {
  return g === "NU" ? "Nữ" : g === "NAM" ? "Nam" : "—";
}

export function pct(r: number | null | undefined, digits = 0): string {
  if (r === null || r === undefined) return "—";
  return `${(r * 100).toFixed(digits).replace(".", ",")}%`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function num(n: number, max = 2): string {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: max });
}

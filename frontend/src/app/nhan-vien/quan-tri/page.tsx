"use client";
import { useEffect, useState } from "react";
import { ColumnChart, DataTable, HBarChart, LineChart } from "@/components/charts";
import { PageHead, StaffShell } from "@/components/staff-shell";
import { Panel, Segmented, Spinner, StatCard } from "@/components/ui";
import { BadgeCheck, CalendarX2, Stethoscope, TimerOff } from "lucide-react";
import { api } from "@/lib/api";
import { pct } from "@/lib/format";

interface Stats {
  period: "week" | "month"; buckets: string[];
  kpi: { cases: number; no_show_rate: number | null; no_show: number; no_show_base: number; expired_rate: number | null; expired: number; holds: number; ai_accuracy: number | null; ai_feedback: number };
  cases_by_specialty: { specialties: { id: number; name: string }[]; rows: { bucket: string; counts: Record<string, number> }[] };
  no_show: { bucket: string; no_show: number; base: number; rate: number | null }[];
  expired: { bucket: string; expired: number; holds: number; rate: number | null }[];
  ai_accuracy: { specialty: string; total: number; correct: number; rate: number | null; corrections: { specialty: string; count: number }[] }[];
}

export default function Page() {
  return <StaffShell roles={["ADMIN"]}>{() => <Dashboard />}</StaffShell>;
}

function bucketLabel(iso: string, period: string) {
  const [, m, d] = iso.split("-");
  return period === "week" ? `${d}/${m}` : `T${Number(m)}`;
}

function Dashboard() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>(`/api/admin/stats?period=${period}`, { auth: "staff" }).then(setS).catch(() => {}); }, [period]);

  return (
    <>
      <PageHead eyebrow="Tổng quan" title="Thống kê hoạt động" sub="Số liệu tổng hợp, không bao gồm nội dung khám bệnh."
        actions={<Segmented value={period} onChange={(p) => { setS(null); setPeriod(p); }} name="Chu kỳ" options={[{ value: "week", label: "8 tuần" }, { value: "month", label: "6 tháng" }]} />} />
      {!s ? <Spinner /> : <Body s={s} />}
    </>
  );
}

function Body({ s }: { s: Stats }) {
  const labels = s.buckets.map((b) => bucketLabel(b, s.period));
  const totals = s.cases_by_specialty.rows.map((r) => Object.values(r.counts).reduce((a, b) => a + b, 0));
  const bySpec = s.cases_by_specialty.specialties.map((sp) => ({
    label: sp.name, value: s.cases_by_specialty.rows.reduce((t, r) => t + (r.counts[String(sp.id)] ?? 0), 0),
  })).sort((a, b) => b.value - a.value);
  const unit = s.period === "week" ? "tuần" : "tháng";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Số ca đã khám" value={s.kpi.cases.toLocaleString("vi-VN")} sub={`trong ${s.buckets.length} ${unit}`} icon={<Stethoscope />} />
        <Kpi label="Tỷ lệ vắng mặt" value={pct(s.kpi.no_show_rate, 1)} sub={`${s.kpi.no_show}/${s.kpi.no_show_base} lịch đã cọc`} icon={<CalendarX2 />} />
        <Kpi label="Giữ chỗ hết hạn" value={pct(s.kpi.expired_rate, 1)} sub={`${s.kpi.expired}/${s.kpi.holds} lượt giữ chỗ`} icon={<TimerOff />} />
        <Kpi label="Độ chính xác của AI" value={pct(s.kpi.ai_accuracy, 1)} sub={`${s.kpi.ai_feedback} đánh giá của bác sĩ`} icon={<BadgeCheck />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`Số ca đã khám theo ${unit}`}>
          <ColumnChart height={340} label={`Số ca theo ${unit}`} data={totals.map((v, i) => ({ label: labels[i], value: v, tip: s.period === "week" ? `Tuần từ ${labels[i]}` : labels[i] }))} />
          <DataTable head={[s.period === "week" ? "Tuần từ" : "Tháng", "Số ca"]} rows={totals.map((v, i) => [labels[i], v])} />
        </Panel>
        <Panel title="Số ca theo chuyên khoa" eyebrow="Cả giai đoạn">
          <HBarChart rows={bySpec} format={(v) => v.toLocaleString("vi-VN")} />
          <DataTable head={["Chuyên khoa", ...labels]} rows={s.cases_by_specialty.specialties.map((sp) => [sp.name, ...s.cases_by_specialty.rows.map((r) => r.counts[String(sp.id)] ?? 0)])} />
        </Panel>
      </div>

      <Panel title="Vắng mặt và giữ chỗ hết hạn" eyebrow={`Tỷ lệ theo ${unit}`}>
        <LineChart label="Tỷ lệ vắng mặt và giữ chỗ hết hạn" labels={labels} format={(v) => pct(v)}
          series={[{ name: "Vắng mặt", values: s.no_show.map((x) => x.rate) }, { name: "Giữ chỗ hết hạn", values: s.expired.map((x) => x.rate) }]} />
        <DataTable head={[unit === "tuần" ? "Tuần từ" : "Tháng", "Vắng mặt", "Tỷ lệ", "Hết hạn", "Tỷ lệ"]}
          rows={labels.map((l, i) => [l, `${s.no_show[i].no_show}/${s.no_show[i].base}`, pct(s.no_show[i].rate, 1), `${s.expired[i].expired}/${s.expired[i].holds}`, pct(s.expired[i].rate, 1)])} />
      </Panel>

      <Panel title="Độ chính xác của AI theo chuyên khoa" eyebrow="Bác sĩ đánh giá khi chốt ca">
        <p className="mb-4 text-[14.5px] text-ink-2">Tỷ lệ ca mà bác sĩ xác nhận chuyên khoa AI gợi ý là phù hợp. Chuyên khoa thấp nhất ở trên cùng: đây là nơi cần bổ sung dữ liệu tri thức. Rê chuột vào dòng để xem AI hay nhầm sang khoa nào.</p>
        <HBarChart max={1} format={(v) => pct(v)} warnBelow={0.75} threshold={{ value: 0.75, label: "Mục tiêu 75%" }}
          rows={s.ai_accuracy.filter((a) => a.rate !== null).map((a) => ({
            label: `${a.specialty} (${a.total})`, value: a.rate!,
            note: a.corrections.length ? `Bác sĩ sửa thành: ${a.corrections.map((c) => `${c.specialty} (${c.count})`).join(", ")}` : "Không có ca sai",
          }))} />
        <DataTable head={["Chuyên khoa AI gợi ý", "Số đánh giá", "Đúng", "Tỷ lệ", "Thường bị sửa thành"]}
          rows={s.ai_accuracy.map((a) => [a.specialty, a.total, a.correct, pct(a.rate, 1), a.corrections.map((c) => `${c.specialty} (${c.count})`).join(", ") || "—"])} />
      </Panel>
    </div>
  );
}

function Kpi({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return <StatCard label={label} value={value} sub={sub} icon={icon} />;
}

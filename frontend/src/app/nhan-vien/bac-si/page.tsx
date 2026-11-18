"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CircleCheckBig, Clock3, FlaskConical, ShieldAlert, Stethoscope, UserRoundCheck, type LucideIcon } from "lucide-react";
import { PageHead, StaffShell } from "@/components/staff-shell";
import { Button, Empty, Input, Spinner, StatCard, StatusTag, UrgencyTag, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { dayLabel, genderLabel, hm, todayISO } from "@/lib/format";
import { usePoll, useStaffEvents } from "@/lib/hooks";
import type { Appointment, Patient } from "@/lib/types";

type Row = Appointment & { patient: Patient; summary: string | null; red_flags: number; labs_done: number; labs_total: number };

const GROUPS: { key: string; title: string; statuses: string[]; hint: string; icon: LucideIcon }[] = [
  { key: "wait", title: "Đã check-in, chờ khám", statuses: ["CHECKED_IN"], hint: "Bệnh nhân đang ngồi chờ trước phòng", icon: UserRoundCheck },
  { key: "now", title: "Đang khám / chờ cận lâm sàng", statuses: ["IN_CONSULTATION", "WAITING_LAB"], hint: "", icon: Stethoscope },
  { key: "later", title: "Chưa đến", statuses: ["CONFIRMED"], hint: "Đã đặt cọc, chưa check-in", icon: Clock3 },
  { key: "done", title: "Đã chốt ca", statuses: ["COMPLETED", "PAID", "NO_SHOW"], hint: "", icon: CircleCheckBig },
];

export default function Page() {
  return <StaffShell roles={["DOCTOR"]}>{() => <Queue />}</StaffShell>;
}

function Queue() {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<{ items: Row[]; doctor: { full_name: string; room: string } } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const load = useCallback(() => api<{ items: Row[]; doctor: { full_name: string; room: string } }>(`/api/doctor/queue?d=${date}`, { auth: "staff" }).then(setData).catch(() => {}), [date]);
  useEffect(() => { load(); }, [load]);
  usePoll(load, 30000);
  useStaffEvents({
    checked_in: (d) => { toast(`${d.patient} vừa check-in`, { body: "Bệnh nhân đang chờ trước phòng" }); load(); },
    lab_done: (d) => {
      toast(`Kết quả ${d.service} đã có`, { tone: "ok", body: `${d.patient}${d.case_ready ? " · mọi phiếu CLS đã xong, có thể khám tiếp" : ""}` });
      load();
    },
  });

  async function open(r: Row) {
    if (r.status !== "CHECKED_IN") return router.push(`/nhan-vien/bac-si/ca/${r.id}`);
    setOpening(r.id);
    try {
      await api(`/api/doctor/cases/${r.id}/open`, { method: "POST", auth: "staff" });
      router.push(`/nhan-vien/bac-si/ca/${r.id}`);
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
      setOpening(null);
    }
  }

  if (!data) return <Spinner />;
  return (
    <>
      <PageHead eyebrow={`${data.doctor.full_name} · Phòng ${data.doctor.room}`} title="Danh sách khám" sub={dayLabel(date)}
        actions={<label className="flex items-center gap-2 text-[13.5px] font-medium text-ink-3">Ngày khám <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="!min-h-10 w-[170px]" /></label>} />
      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {GROUPS.map((g) => {
          const n = data.items.filter((r) => g.statuses.includes(r.status)).length;
          return (
            <StatCard key={g.key} label={g.title} value={n} icon={<g.icon />} highlight={g.key === "wait" && n > 0} />
          );
        })}
      </div>
      {!data.items.length && <Empty title="Không có lịch khám trong ngày này" />}
      <div className="space-y-6">
        {GROUPS.map((g) => {
          const rows = data.items.filter((r) => g.statuses.includes(r.status));
          if (!rows.length) return null;
          return (
            <section key={g.key}>
              <h2 className="mb-2.5 flex items-baseline gap-2 text-[15.5px] font-semibold">{g.title}<span className="text-[13px] font-normal text-ink-3">{g.hint}</span></h2>
              <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
                <table className="w-full min-w-[860px] text-[14.5px]">
                  <thead>
                    <tr className="border-b border-line text-left bg-paper text-[12.5px] font-semibold text-ink-3">
                      <th className="w-[96px] px-4 py-2.5 whitespace-nowrap">Giờ hẹn</th>
                      <th className="px-3 py-2.5">Bệnh nhân</th>
                      <th className="px-3 py-2.5">Tóm tắt trước khám</th>
                      <th className="w-[130px] px-3 py-2.5">Mức độ</th>
                      <th className="w-[150px] px-3 py-2.5">Trạng thái</th>
                      <th className="w-[140px] px-4 py-2.5 text-right"><span className="sr-only">Thao tác</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id} className={cx("border-b border-line-2 last:border-0", g.key === "wait" && i === 0 && "bg-brand-tint/50")}>
                        <td className="num px-4 py-3 font-bold">{r.slot}</td>
                        <td className="px-3 py-3">
                          <p className="font-semibold">{r.patient.full_name}</p>
                          <p className="text-[13px] text-ink-3">{genderLabel(r.patient.gender)} · {r.patient.age} tuổi{r.checked_in_at && r.status === "CHECKED_IN" ? ` · check-in ${hm(r.checked_in_at)}` : ""}</p>
                        </td>
                        <td className="max-w-[420px] px-3 py-3">
                          {r.red_flags > 0 && <p className="mb-0.5 flex items-center gap-1 text-[13px] font-semibold text-danger"><ShieldAlert className="size-3.5" aria-hidden />Có dấu hiệu đỏ</p>}
                          <p className="line-clamp-2 text-ink-2">{r.summary ?? (r.is_general ? "Khám tổng quát (không qua trợ lý)" : "Tự chọn chuyên khoa (không qua trợ lý)")}</p>
                        </td>
                        <td className="px-3 py-3"><UrgencyTag u={r.urgency} /></td>
                        <td className="px-3 py-3">
                          <StatusTag status={r.status} />
                          {r.labs_total > 0 && r.status !== "PAID" && (
                            <p className="mt-1 flex items-center gap-1 text-[13px] text-lab"><FlaskConical className="size-3.5" aria-hidden />CLS {r.labs_done}/{r.labs_total}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === "CHECKED_IN" ? (
                            <Button size="sm" loading={opening === r.id} onClick={() => open(r)}>Mở ca</Button>
                          ) : (
                            <Link href={`/nhan-vien/bac-si/ca/${r.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                              {["IN_CONSULTATION", "WAITING_LAB"].includes(r.status) ? "Tiếp tục" : "Xem"}<ArrowRight className="size-4" aria-hidden />
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { PageHead, StaffShell } from "@/components/staff-shell";
import { AmendedTag, Button, Empty, Spinner, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { api, errMsg } from "@/lib/api";
import { genderLabel, hm } from "@/lib/format";
import { usePoll, useStaffEvents } from "@/lib/hooks";
import type { LabOrderT, StaffBrief } from "@/lib/types";

type Order = LabOrderT & { patient: { full_name: string; age: number; gender: string }; appointment_code: string; ordered_by: StaffBrief };

export default function Page() {
  return <StaffShell roles={["TECHNICIAN"]}>{() => <Board />}</StaffShell>;
}

function Board() {
  const router = useRouter();
  const [d, setD] = useState<{ department: { name: string; room: string }; me: number; items: Order[] } | null>(null);
  const [claiming, setClaiming] = useState<number | null>(null);
  const load = useCallback(() => api<typeof d>("/api/lab/orders", { auth: "staff" }).then(setD).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  usePoll(load, 30000);
  useStaffEvents({
    lab_order_created: (e) => { toast(`Phiếu mới: ${e.service}`, { body: "Vừa vào hàng chờ của phòng" }); load(); },
    lab_claimed: () => load(), lab_done: () => load(), lab_order_cancelled: () => load(),
  });

  async function claim(o: Order) {
    setClaiming(o.id);
    try {
      await api(`/api/lab/orders/${o.id}/claim`, { method: "POST", auth: "staff" });
      router.push(`/nhan-vien/cls/${o.id}`);
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
      setClaiming(null);
      load();
    }
  }
  if (!d) return <Spinner />;
  const cols: { key: string; title: string; items: Order[]; hint: string }[] = [
    { key: "ORDERED", title: "Chờ nhận", items: d.items.filter((o) => o.status === "ORDERED"), hint: "Bác sĩ chỉ định vào phòng, chưa ai nhận" },
    { key: "IN_PROGRESS", title: "Đang thực hiện", items: d.items.filter((o) => o.status === "IN_PROGRESS"), hint: "Phiếu của bạn được tô đậm" },
    { key: "DONE", title: "Hoàn thành hôm nay", items: d.items.filter((o) => o.status === "DONE"), hint: "Đã khóa kết quả" },
  ];
  return (
    <>
      <PageHead eyebrow={`${d.department.name} · ${d.department.room}`} title="Phiếu cận lâm sàng" sub="Chỉ hiển thị phiếu thuộc phòng của bạn" />
      <div className="grid gap-5 lg:grid-cols-3">
        {cols.map((c) => (
          <section key={c.key} className="flex flex-col">
            <h2 className="mb-1 flex items-baseline gap-2 font-bold">{c.title}<span className="num text-ink-3">{c.items.length}</span></h2>
            <p className="mb-2 text-[13px] text-ink-3">{c.hint}</p>
            <div className="flex flex-1 flex-col gap-2 rounded-lg bg-line-2/60 p-2">
              {c.items.length === 0 && <div className="py-6 text-center text-sm text-ink-3">Trống</div>}
              {c.items.map((o) => {
                const mine = o.technician?.id === d.me;
                return (
                  <article key={o.id} className={cx("rounded-md border bg-surface p-3", mine && o.status === "IN_PROGRESS" ? "border-lab border-l-4" : "border-line")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{o.service.name}</p>
                      <span className="num text-[13px] text-ink-3">{hm(o.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-[14.5px]">{o.patient.full_name} · <span className="text-ink-3">{genderLabel(o.patient.gender)}, {o.patient.age} tuổi</span></p>
                    <p className="text-[13px] text-ink-3">Chỉ định bởi {o.ordered_by.full_name}</p>
                    {o.doctor_note && <p className="mt-1.5 rounded bg-paper px-2 py-1 text-[13.5px]">“{o.doctor_note}”</p>}
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      {o.status === "ORDERED" && <Button size="sm" loading={claiming === o.id} onClick={() => claim(o)}>Nhận phiếu</Button>}
                      {o.status === "IN_PROGRESS" && (mine
                        ? <Link href={`/nhan-vien/cls/${o.id}`} className="inline-flex h-8 items-center gap-1 rounded-md bg-lab px-3 text-sm font-semibold text-white">Nhập kết quả<ArrowRight className="size-4" aria-hidden /></Link>
                        : <span className="text-[13px] text-ink-3">Do {o.technician?.full_name} thực hiện</span>)}
                      {o.status === "DONE" && (
                        <span className="flex items-center gap-2">
                          {o.result?.is_amended && <AmendedTag />}
                          <Link href={`/nhan-vien/cls/${o.id}`} className="text-sm font-semibold text-brand hover:underline">Xem</Link>
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {!d.items.length && <div className="mt-5"><Empty title="Phòng chưa có phiếu nào hôm nay" /></div>}
    </>
  );
}

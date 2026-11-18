"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { PageBanner } from "@/components/page-banner";
import { PatientShell } from "@/components/patient-shell";
import { photos } from "@/components/photos";
import { specIcon } from "@/components/specialty-icon";
import { AssistantCard, bookHref } from "@/components/specialty-grid";
import { Empty } from "@/components/ui";
import { api } from "@/lib/api";
import type { Specialty } from "@/lib/types";

export default function Page() {
  const [specs, setSpecs] = useState<Specialty[] | null>(null);

  useEffect(() => {
    api<Specialty[]>("/api/public/specialties").then(setSpecs).catch(() => setSpecs([]));
  }, []);

  // Danh sách tải sau khi trang mở, nên tự cuộn tới khoa được chọn từ trang chủ (#khoa-<id>)
  useEffect(() => {
    if (!specs?.length || !location.hash) return;
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [specs]);

  return (
    <PatientShell bleed>
      <PageBanner image={photos.doctorScan} position="35% 22%" title="Chuyên khoa"
        sub="Các chuyên khoa khám theo hẹn tại phòng khám, kèm những triệu chứng thường gặp. Chọn một khoa để xem giờ trống và đặt lịch." />

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_320px] lg:py-14">
        <section aria-label="Danh sách chuyên khoa">
          {specs === null ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => <li key={i} className="h-[150px] animate-pulse rounded-xl border border-line bg-surface" />)}
            </ul>
          ) : specs.length === 0 ? (
            <Empty title="Chưa tải được danh sách chuyên khoa">Vui lòng thử lại sau hoặc gọi tổng đài để được hỗ trợ.</Empty>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {specs.map((s) => {
                const Icon = specIcon(s.name);
                return (
                  <li key={s.id} id={`khoa-${s.id}`}
                    className="flex scroll-mt-24 flex-col rounded-xl border border-line bg-surface p-5 shadow-card target:border-brand target:ring-4 target:ring-brand/10">
                    <div className="flex items-start gap-3.5">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[17px] leading-snug font-semibold text-ink">{s.name}</h2>
                        {s.description && <p className="mt-1 text-[14.5px] leading-relaxed text-ink-3">{s.description}</p>}
                      </div>
                    </div>
                    <div className="mt-auto pt-4">
                      <div className="border-t border-line-2 pt-3.5">
                        <Link href={bookHref(s)} className="inline-flex items-center gap-1 text-[14.5px] font-semibold text-brand hover:underline">
                          Đặt lịch khám {s.is_general ? "tổng quát" : s.name.toLowerCase()} <ArrowRight className="size-4" aria-hidden />
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="self-start lg:sticky lg:top-24">
          <AssistantCard />
        </aside>
      </div>
    </PatientShell>
  );
}

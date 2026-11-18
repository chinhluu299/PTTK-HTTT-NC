"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { photos } from "./photos";
import { specIcon } from "./specialty-icon";
import { cx } from "./ui";
import { api } from "@/lib/api";
import type { Specialty } from "@/lib/types";

/** Đường dẫn đặt lịch thẳng cho một chuyên khoa (Nội tổng quát đi theo nhánh khám tổng quát – QĐ07) */
export const bookHref = (s: Specialty) => (s.is_general ? "/dat-lich?general=1" : `/dat-lich?specialty=${s.id}`);

export function useSpecialties() {
  const [specs, setSpecs] = useState<Specialty[] | null>(null);
  useEffect(() => {
    api<Specialty[]>("/api/public/specialties").then(setSpecs).catch(() => setSpecs([]));
  }, []);
  return specs;
}

/** Lưới chuyên khoa: bấm vào là sang bước chọn giờ của khoa đó. */
export function SpecialtyGrid({ specs, className }: { specs: Specialty[] | null; className?: string }) {
  return (
    <ul className={cx("grid grid-cols-2 gap-3 xl:grid-cols-3", className)}>
      {(specs ?? Array.from({ length: 9 }, () => null)).map((s, i) => {
        if (!s) return <li key={i} className="h-[92px] animate-pulse rounded-xl border border-line bg-surface" />;
        const Icon = specIcon(s.name);
        return (
          <li key={s.id}>
            <Link href={bookHref(s)}
              className="group flex h-full items-center gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-card sm:items-start sm:p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-raised">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand transition-colors group-hover:bg-brand group-hover:text-white sm:size-10">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] leading-snug font-semibold text-ink sm:text-[15.5px]">{s.name}</span>
                {s.description && <span className="mt-0.5 line-clamp-2 hidden text-[13.5px] leading-snug text-ink-3 sm:[display:-webkit-box]">{s.description}</span>}
              </span>
              <ArrowRight className="mt-0.5 hidden size-4 shrink-0 text-ink-4 transition-all group-hover:translate-x-0.5 group-hover:text-brand sm:block" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Thẻ phụ: trợ lý triệu chứng cho người chưa biết nên khám khoa nào (không bắt buộc). */
export function AssistantCard({ className }: { className?: string }) {
  return (
    <div className={cx("relative", className)}>
      <div className="squares absolute -top-10 -right-10 h-48 w-48" aria-hidden />
      <div className="relative overflow-hidden rounded-xl bg-navy text-navy-ink shadow-raised">
        <div className="relative h-40 sm:h-44">
          <Image src={photos.checkup} alt="Bác sĩ đo huyết áp cho bệnh nhân" fill placeholder="blur" sizes="(min-width: 1024px) 340px, 100vw"
            className="object-cover object-[50%_24%]" />
          <div className="absolute inset-0 bg-linear-to-t from-navy via-navy/20 to-transparent" aria-hidden />
        </div>
        <div className="squares-light absolute -bottom-16 -left-16 h-56 w-56" aria-hidden />
        <div className="relative p-5 pt-3">
          <h3 className="text-[19px] leading-snug font-bold text-white">Chưa biết nên khám khoa nào?</h3>
          <p className="mt-2 text-[14.5px] leading-relaxed">
            Kể triệu chứng bằng lời của bạn. Trợ lý hỏi thêm vài câu, gợi ý chuyên khoa và mức độ cần khám, rồi chuyển sang chọn giờ.
          </p>
          <Link href="/kham"
            className="mt-5 flex h-11 items-center justify-center gap-2 rounded-lg bg-white text-[15px] font-semibold text-navy transition-colors hover:bg-brand-tint">
            Hỏi trợ lý triệu chứng <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

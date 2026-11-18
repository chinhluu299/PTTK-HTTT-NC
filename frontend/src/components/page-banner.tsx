import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** Đầu trang cho các trang thông tin (chuyên khoa, bảng giá): ảnh nền, đường dẫn, tiêu đề. */
export function PageBanner({ image, position = "center", title, sub }: {
  image: StaticImageData; position?: string; title: string; sub?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-navy">
      <Image src={image} alt="" fill placeholder="blur" loading="eager" sizes="100vw"
        className="-z-10 object-cover" style={{ objectPosition: position }} />
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-navy via-navy/90 to-navy/45" aria-hidden />
      <div className="squares-light absolute -top-24 right-[8%] -z-10 h-96 w-96" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <nav aria-label="Đường dẫn" className="flex items-center gap-1.5 text-[13.5px] text-navy-ink">
          <Link href="/" className="hover:text-white">Trang chủ</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span className="text-white" aria-current="page">{title}</span>
        </nav>
        <h1 className="mt-3 text-[30px] leading-tight font-bold tracking-[-0.02em] text-white sm:text-[38px]">{title}</h1>
        {sub && <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-navy-ink">{sub}</p>}
      </div>
    </section>
  );
}

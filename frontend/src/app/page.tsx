"use client";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Phone } from "lucide-react";
import { PatientShell } from "@/components/patient-shell";
import { photos } from "@/components/photos";
import { Reveal } from "@/components/reveal";
import { AssistantCard, SpecialtyGrid, useSpecialties } from "@/components/specialty-grid";
import { LinkButton } from "@/components/ui";
import { useConfig, usePatient } from "@/lib/hooks";
import { vnd } from "@/lib/format";

/** Độ trễ cho hiệu ứng `.rise` lúc vào trang */
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

const JOURNEY = [
  {
    img: photos.doctorPhone, alt: "Đặt lịch khám trên điện thoại", pos: "62% center",
    t: "Đặt lịch và đặt cọc", d: "Chọn chuyên khoa, giờ khám và chuyển khoản tiền cọc qua VietQR. Lịch được xác nhận ngay.",
  },
  {
    img: photos.reception, alt: "Quầy lễ tân của phòng khám", pos: "center",
    t: "Check-in tại quầy lễ tân", d: "Quét mã QR trên kiosk hoặc nhập số điện thoại. Hệ thống báo phòng khám cho bạn.",
  },
  {
    img: photos.lab, alt: "Kỹ thuật viên làm xét nghiệm", pos: "50% 32%",
    t: "Khám và cận lâm sàng", d: "Bác sĩ chỉ định xét nghiệm, X-quang, siêu âm ngay trên hồ sơ. Kết quả gửi thẳng về cho bác sĩ.",
  },
  {
    img: photos.pharmacy, alt: "Dược sĩ lấy thuốc tại quầy", pos: "40% center",
    t: "Nhận thuốc và thanh toán", d: "Màn hình chờ gọi số tại quầy thuốc – thu ngân. Tiền cọc được trừ vào hóa đơn.",
  },
];

const RED_FLAGS = [
  "Đau ngực kèm khó thở hoặc vã mồ hôi", "Méo miệng, yếu nửa người, nói ngọng đột ngột",
  "Khó thở nhiều, môi tím, SpO2 dưới 90%", "Sốt từ 40°C, hoặc sốt kèm co giật, lơ mơ",
  "Huyết áp từ 180/120 mmHg trở lên",
];

export default function Home() {
  const cfg = useConfig();
  const { patient } = usePatient();
  const specs = useSpecialties();
  const hotline = cfg?.hotline ?? "1900 1234";

  return (
    <PatientShell bleed>
      {/* ───── Hero ───── */}
      <section className="relative border-b border-line bg-surface">
        <div className="squares absolute -top-24 -left-24 hidden h-80 w-80 lg:block" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-10 sm:py-14 lg:grid-cols-[1fr_480px] lg:gap-14 lg:py-16">
          <div>
            <h1 className="rise max-w-[560px] text-[34px] leading-[1.1] font-bold tracking-[-0.03em] text-navy sm:text-[46px]" style={d(0)}>
              Khám đúng chuyên khoa ngay từ lần đầu.
            </h1>
            <p className="rise mt-5 max-w-[540px] text-[17px] leading-relaxed text-ink-2" style={d(80)}>
              Chọn chuyên khoa và giờ khám trong vài bước, giữ chỗ bằng tiền cọc {vnd(cfg?.deposit_amount ?? 100000)} trừ vào hóa đơn.
              Chưa biết nên khám khoa nào, trợ lý triệu chứng sẽ gợi ý giúp bạn.
            </p>
            <div className="rise mt-8 flex flex-col gap-3 sm:flex-row" style={d(160)}>
              <LinkButton href="/dat-lich" size="lg" className="px-7">Đặt lịch khám</LinkButton>
              <LinkButton href="/kham" size="lg" variant="secondary" className="px-6">Hỏi trợ lý triệu chứng</LinkButton>
            </div>
            <p className="rise mt-4 text-[14.5px] text-ink-3" style={d(200)}>
              {patient ? "Bạn đã có lịch hẹn? " : "Đã đặt lịch trước đó? "}
              <Link href="/ho-so" className="font-semibold text-brand hover:underline">{patient ? "Xem lịch hẹn của tôi" : "Tra cứu lịch hẹn"}</Link>
            </p>
            <dl className="rise mt-9 grid max-w-[540px] gap-x-8 gap-y-3 border-t border-line pt-6 text-[14.5px] sm:grid-cols-[1.5fr_1fr]" style={d(240)}>
              <div>
                <dt className="text-ink-3">Giờ làm việc</dt>
                <dd className="num mt-0.5 font-medium text-ink">Thứ 2 – Thứ 7 · 08:00–12:00, 14:00–18:00</dd>
              </div>
              <div>
                <dt className="text-ink-3">Tổng đài đặt lịch</dt>
                <dd className="mt-0.5"><a href={`tel:${hotline.replace(/\s/g, "")}`} className="num font-semibold text-ink hover:text-brand">{hotline}</a></dd>
              </div>
            </dl>
          </div>
          <HeroPhotos />
        </div>
      </section>

      {/* ───── Đặt lịch theo chuyên khoa ───── */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <Reveal>
          <SectionHead title="Đặt lịch theo chuyên khoa"
            sub="Chọn chuyên khoa để xem giờ trống sớm nhất và bác sĩ phù hợp. Khám sức khỏe chung, chọn Nội tổng quát."
            action={<Link href="/chuyen-khoa" className="inline-flex items-center gap-1 text-[14.5px] font-semibold text-brand hover:underline">Xem chi tiết các chuyên khoa <ArrowRight className="size-4" aria-hidden /></Link>} />
        </Reveal>
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_330px]">
          <Reveal delay={60}><SpecialtyGrid specs={specs} /></Reveal>
          <Reveal delay={140}><AssistantCard /></Reveal>
        </div>
      </section>

      {/* ───── Cảnh báo cấp cứu ───── */}
      <section className="mx-auto max-w-6xl px-4 pt-12">
        <Reveal>
          <div className="overflow-hidden rounded-xl border border-danger/25 bg-surface shadow-card">
            <div className="grid lg:grid-cols-[1fr_300px]">
              <div className="flex gap-4 p-5 sm:p-6">
                <span className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-danger-tint text-danger sm:flex">
                  <Phone className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-[17px] font-semibold text-danger-strong">Đừng đặt lịch nếu bạn đang có một trong các dấu hiệu sau</h2>
                  <ul className="mt-3 grid gap-x-8 gap-y-1.5 text-[14.5px] text-ink-2 sm:grid-cols-2">
                    {RED_FLAGS.map((x) => (
                      <li key={x} className="flex gap-2.5"><span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="relative isolate flex min-h-[170px] flex-col justify-end gap-2 p-5 sm:p-6">
                <Image src={photos.ambulance} alt="" fill placeholder="blur" sizes="(min-width: 1024px) 300px, 100vw"
                  className="-z-10 object-cover object-[45%_center]" />
                <div className="absolute inset-0 -z-10 bg-linear-to-t from-[#2a0709]/95 via-[#4a0c10]/55 to-[#4a0c10]/0" aria-hidden />
                <a href="tel:115" className="flex h-12 items-center justify-center gap-2 rounded-lg bg-danger text-[16px] font-bold text-white hover:bg-danger-strong">
                  <Phone className="size-5" aria-hidden />Gọi cấp cứu 115
                </a>
                <p className="text-center text-[13px] text-white/80">hoặc đến cơ sở cấp cứu gần nhất</p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───── Quy trình khám ───── */}
      <section className="relative mt-20 border-y border-line bg-surface py-16">
        <div className="squares absolute -top-20 right-[6%] hidden h-72 w-72 md:block" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4">
          <Reveal>
            <SectionHead title="Quy trình khám tại MedCare"
              sub="Hồ sơ đi theo bạn qua từng phòng. Bác sĩ, kỹ thuật viên và dược sĩ cùng làm việc trên một hệ thống." />
          </Reveal>
          <ol className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {JOURNEY.map((x, i) => (
              <li key={x.t}>
                <Reveal className="h-full" delay={i * 80}>
                  <figure className="group h-full">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-paper-2">
                      <Image src={x.img} alt={x.alt} fill placeholder="blur" sizes="(min-width: 1024px) 270px, (min-width: 640px) 50vw, 100vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" style={{ objectPosition: x.pos }} />
                    </div>
                    <figcaption className="pt-4">
                      <p className="num text-[13px] font-semibold text-brand">Bước {i + 1}</p>
                      <p className="mt-0.5 text-[16.5px] font-semibold text-ink">{x.t}</p>
                      <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-3">{x.d}</p>
                    </figcaption>
                  </figure>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───── Chi phí ───── */}
      <section className="relative mx-auto max-w-6xl px-4 py-20">
        <div className="dots absolute bottom-6 -left-16 h-56 w-56" aria-hidden />
        <Reveal>
          <SectionHead title="Chi phí và quy định"
            action={<Link href="/quy-dinh" className="inline-flex items-center gap-1 text-[14.5px] font-semibold text-brand hover:underline">Xem đầy đủ bảng giá và quy định <ArrowRight className="size-4" aria-hidden /></Link>} />
        </Reveal>
        <Reveal delay={60}>
          <dl className="relative grid gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card sm:grid-cols-2 lg:grid-cols-4">
            <Fee k="Phí khám" v={vnd(cfg?.consultation_fee ?? 150000)} note="Mỗi lượt khám, chưa gồm xét nghiệm và thuốc" />
            <Fee k="Tiền cọc giữ chỗ" v={vnd(cfg?.deposit_amount ?? 100000)} note="Trừ vào hóa đơn khi khám xong" />
            <Fee k="Hủy lịch" v="Trước 12 giờ" note="Được hoàn cọc. Hủy muộn hơn thì không hoàn" />
            <Fee k="Đến muộn" v="Tối đa 15 phút" note="Quá 15 phút chưa check-in, lịch tự hủy" />
          </dl>
        </Reveal>
      </section>
    </PatientShell>
  );
}

/** Ảnh xếp lớp ở hero: ảnh chính, ảnh phụ đè góc dưới, nền ô vuông và khối màu phía sau. */
function HeroPhotos() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] pb-14 sm:pb-16 lg:max-w-none">
      <div className="squares absolute -top-12 -right-12 h-64 w-64" aria-hidden />
      <div className="absolute top-10 -right-3 bottom-24 w-24 rounded-2xl bg-brand-tint sm:-right-5" aria-hidden />
      <div className="rise relative ml-auto aspect-[4/3] w-[88%] overflow-hidden rounded-2xl bg-paper-2 shadow-raised lg:aspect-[4/5]" style={d(120)}>
        <Image src={photos.consult} alt="Bác sĩ trao đổi kết quả khám với bệnh nhân" fill placeholder="blur" loading="eager" fetchPriority="high"
          sizes="(min-width: 1024px) 430px, 90vw" className="settle object-cover object-[38%_center]" />
      </div>
      <div className="dots absolute bottom-0 left-[30%] h-32 w-48" aria-hidden />
      <div className="rise absolute bottom-0 left-0 aspect-[4/3] w-[48%] overflow-hidden rounded-xl border-[5px] border-surface bg-paper-2 shadow-pop" style={d(320)}>
        <Image src={photos.care} alt="Bác sĩ chăm sóc bệnh nhân lớn tuổi" fill placeholder="blur" sizes="(min-width: 1024px) 230px, 45vw"
          className="object-cover object-[50%_35%]" />
      </div>
    </div>
  );
}

function Fee({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <div className="bg-surface p-5">
      <dt className="text-[13.5px] text-ink-3">{k}</dt>
      <dd>
        <p className="num mt-1 text-[22px] font-bold tracking-tight text-navy">{v}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-ink-3">{note}</p>
      </dd>
    </div>
  );
}

function SectionHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h2 className="text-[26px] font-bold tracking-[-0.02em] text-navy sm:text-[30px]">{title}</h2>
        {sub && <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

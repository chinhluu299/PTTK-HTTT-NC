"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Phone } from "lucide-react";
import { PageBanner } from "@/components/page-banner";
import { PatientShell } from "@/components/patient-shell";
import { photos } from "@/components/photos";
import { vnd } from "@/lib/format";
import { useConfig } from "@/lib/hooks";

const TOC = [
  ["chi-phi", "Chi phí khám"],
  ["gio-lam-viec", "Giờ làm việc"],
  ["dat-lich", "Đặt lịch và giữ chỗ"],
  ["huy-lich", "Hủy lịch và hoàn cọc"],
  ["den-kham", "Khi đến khám"],
  ["cap-cuu", "Dấu hiệu cần đi cấp cứu"],
] as const;

const RED_FLAGS = [
  "Đau ngực kèm khó thở hoặc vã mồ hôi", "Méo miệng, yếu nửa người, nói ngọng đột ngột",
  "Khó thở nhiều, môi tím, SpO2 dưới 90%", "Sốt từ 40°C, hoặc sốt kèm co giật, lơ mơ",
  "Huyết áp từ 180/120 mmHg trở lên",
];

export default function Page() {
  const cfg = useConfig();
  const fee = vnd(cfg?.consultation_fee ?? 150000);
  const deposit = vnd(cfg?.deposit_amount ?? 100000);
  const hold = cfg?.hold_minutes ?? 5;

  return (
    <PatientShell bleed>
      <PageBanner image={photos.lobby} position="50% 62%" title="Bảng giá & quy định"
        sub="Chi phí, giờ làm việc và các quy định về đặt lịch, hủy lịch, đến khám. Đọc trước khi đặt lịch để tránh mất tiền cọc." />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[220px_1fr] lg:py-14">
        <nav aria-label="Mục lục" className="hidden self-start lg:sticky lg:top-24 lg:block">
          <p className="mb-2 text-[13px] font-semibold text-ink-3">Trên trang này</p>
          <ul className="space-y-0.5 border-l border-line text-[14.5px]">
            {TOC.map(([id, t]) => (
              <li key={id}><a href={`#${id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-ink-2 hover:border-brand hover:text-brand">{t}</a></li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <Block id="chi-phi" title="Chi phí khám">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[15px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="th py-2.5 pr-4">Khoản thu</th>
                    <th className="th py-2.5 pr-4">Mức thu</th>
                    <th className="th py-2.5">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-2">
                  <Row k="Phí khám bệnh" v={fee} note="Mỗi lượt khám, thanh toán tại quầy thuốc – thu ngân sau khi khám" />
                  <Row k="Tiền cọc giữ chỗ" v={deposit} note="Chuyển khoản qua VietQR khi đặt lịch, trừ vào hóa đơn" />
                  <Row k="Xét nghiệm, chẩn đoán hình ảnh" v="Theo chỉ định" note="Chỉ thu khi bác sĩ chỉ định, giá từng dịch vụ in trên hóa đơn" />
                  <Row k="Thuốc" v="Theo đơn" note="Tính theo đơn thuốc bác sĩ kê" />
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[14.5px] text-ink-3">Nếu tiền cọc lớn hơn tổng chi phí, phần chênh lệch được hoàn lại cho bạn.</p>
          </Block>

          <Block id="gio-lam-viec" title="Giờ làm việc">
            <dl className="grid gap-4 text-[15px] sm:grid-cols-3">
              <Item k="Thứ 2 – Thứ 7" v="Sáng 08:00 – 12:00" v2="Chiều 14:00 – 18:00" />
              <Item k="Chủ nhật" v="Nghỉ" />
              <Item k="Mỗi lượt khám" v="30 phút" v2={cfg ? `Mỗi bác sĩ nhận tối đa ${cfg.slot_capacity} người mỗi khung giờ` : undefined} />
            </dl>
          </Block>

          <Block id="dat-lich" title="Đặt lịch và giữ chỗ">
            <ul className="space-y-2.5 text-[15px] leading-relaxed text-ink-2">
              <Li>
                Chọn chuyên khoa và giờ khám trên trang <Link href="/dat-lich" className="font-semibold text-brand hover:underline">Đặt lịch khám</Link>.
                Hệ thống đề xuất giờ trống sớm nhất và bác sĩ phù hợp.
              </Li>
              <Li>
                Chưa biết nên khám khoa nào? <Link href="/kham" className="font-semibold text-brand hover:underline">Hỏi trợ lý triệu chứng</Link> để được gợi ý chuyên khoa và mức độ cần khám.
                Khám sức khỏe chung thì chọn Nội tổng quát.
              </Li>
              <Li>Sau khi chọn giờ, chỗ được giữ trong <b className="text-ink">{hold} phút</b> để bạn chuyển khoản tiền cọc. Quá thời gian này, chỗ được nhường cho người khác.</Li>
              <Li>Nhận được tiền cọc, lịch hẹn được xác nhận và mã QR check-in hiện trong trang lịch hẹn của bạn.</Li>
            </ul>
          </Block>

          <Block id="huy-lich" title="Hủy lịch và hoàn cọc">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-ok/25 bg-ok-tint/60 p-4">
                <p className="font-semibold text-ok">Hủy trước giờ hẹn từ 12 giờ trở lên</p>
                <p className="mt-1 text-[14.5px] text-ink-2">Được hoàn lại tiền cọc.</p>
              </div>
              <div className="rounded-lg border border-warn-line bg-warn-tint/70 p-4">
                <p className="font-semibold text-warn">Hủy khi còn dưới 12 giờ</p>
                <p className="mt-1 text-[14.5px] text-ink-2">Không hoàn tiền cọc.</p>
              </div>
            </div>
            <p className="mt-4 text-[14.5px] leading-relaxed text-ink-3">
              Nếu bác sĩ nghỉ trùng lịch hẹn của bạn, bạn được hoàn cọc khi hủy, kể cả khi hủy sát giờ.
            </p>
          </Block>

          <Block id="den-kham" title="Khi đến khám">
            <ul className="space-y-2.5 text-[15px] leading-relaxed text-ink-2">
              <Li>Vui lòng đến trước giờ hẹn khoảng 10 phút.</Li>
              <Li>Check-in tại kiosk ở quầy lễ tân: quét mã QR, nhập số điện thoại hoặc mã khám.</Li>
              <Li>Trễ quá <b className="text-ink">15 phút</b> chưa check-in, lịch hẹn tự hủy và không hoàn cọc.</Li>
              <Li>Sau khi khám, nhận thuốc và thanh toán tại quầy thuốc – thu ngân theo số thứ tự trên màn hình chờ.</Li>
            </ul>
          </Block>

          <Block id="cap-cuu" title="Dấu hiệu cần đi cấp cứu" danger>
            <p className="text-[15px] text-ink-2">Lịch hẹn không dành cho tình huống cấp cứu. Nếu bạn có một trong các dấu hiệu sau, đừng đặt lịch mà hãy gọi 115 hoặc đến cơ sở cấp cứu gần nhất:</p>
            <ul className="mt-3 grid gap-x-8 gap-y-1.5 text-[15px] text-ink-2 sm:grid-cols-2">
              {RED_FLAGS.map((x) => (
                <li key={x} className="flex gap-2.5"><span className="mt-[10px] size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />{x}</li>
              ))}
            </ul>
            <a href="tel:115" className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-danger px-5 text-[15px] font-bold text-white hover:bg-danger-strong">
              <Phone className="size-4" aria-hidden />Gọi cấp cứu 115
            </a>
          </Block>
        </div>
      </div>
    </PatientShell>
  );
}

function Block({ id, title, danger, children }: { id: string; title: string; danger?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-24 rounded-xl border bg-surface p-5 shadow-card sm:p-6 ${danger ? "border-danger/25" : "border-line"}`}>
      <h2 className={`mb-4 text-[20px] font-bold tracking-[-0.01em] ${danger ? "text-danger-strong" : "text-navy"}`}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <tr>
      <td className="py-3 pr-4 font-medium text-ink">{k}</td>
      <td className="num py-3 pr-4 font-semibold whitespace-nowrap text-navy">{v}</td>
      <td className="py-3 text-[14.5px] text-ink-3">{note}</td>
    </tr>
  );
}

function Item({ k, v, v2 }: { k: string; v: string; v2?: string }) {
  return (
    <div className="rounded-lg bg-paper p-4">
      <dt className="text-[13.5px] text-ink-3">{k}</dt>
      <dd className="num mt-1 font-semibold text-ink">{v}</dd>
      {v2 && <dd className="num mt-0.5 text-[14px] text-ink-2">{v2}</dd>}
    </div>
  );
}

function Li({ children }: { children: ReactNode }) {
  return <li className="flex gap-3"><span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden /><span>{children}</span></li>;
}

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut, MapPin, Menu, Phone, UserRound, X } from "lucide-react";
import { Brand } from "./brand";
import { cx } from "./ui";
import { setToken } from "@/lib/api";
import { useConfig, usePatient } from "@/lib/hooks";

const NAV = [
  { href: "/chuyen-khoa", label: "Chuyên khoa" },
  { href: "/kham", label: "Trợ lý triệu chứng" },
  { href: "/quy-dinh", label: "Bảng giá & quy định" },
];

/**
 * Khung trang phía bệnh nhân.
 * `bleed`: trang tự quản lý bố cục toàn chiều ngang (trang chủ, trang giới thiệu).
 */
export function PatientShell({ children, wide, bleed }: { children: ReactNode; wide?: boolean; bleed?: boolean }) {
  const { patient } = usePatient();
  const cfg = useConfig();
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const hotline = cfg?.hotline ?? "1900 1234";
  const tel = `tel:${hotline.replace(/\s/g, "")}`;
  const logout = () => { setToken("patient", null); setMenu(false); router.push("/"); };

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header className="no-print sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-10">
            <Brand />
            <nav className="hidden items-center gap-7 lg:flex" aria-label="Điều hướng chính">
              {NAV.map((n) => {
                const active = path.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                    className={cx("relative flex h-[68px] items-center text-[15px] font-medium transition-colors",
                      active ? "text-brand after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand" : "text-ink-2 hover:text-ink")}>
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <a href={tel} className="mr-3 hidden items-center gap-2.5 xl:flex">
              <Phone className="size-[18px] text-brand" aria-hidden />
              <span className="leading-tight">
                <span className="block text-[12px] text-ink-3">Tổng đài đặt lịch</span>
                <span className="num block text-[15px] font-bold text-ink">{hotline}</span>
              </span>
            </a>
            {patient ? (
              <div className="hidden items-center gap-1 sm:flex">
                <Link href="/ho-so" className={cx("flex h-10 items-center gap-2 rounded-lg px-2 text-[14px] font-semibold hover:bg-paper",
                  path.startsWith("/ho-so") && "text-brand-strong")}>
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-tint text-[12px] font-bold text-brand-strong" aria-hidden>
                    {initials(patient.full_name)}
                  </span>
                  <span className="max-w-[150px] truncate">{patient.full_name}</span>
                </Link>
                <button onClick={logout} aria-label="Đăng xuất" title="Đăng xuất"
                  className="flex size-10 items-center justify-center rounded-lg text-ink-3 hover:bg-paper hover:text-ink">
                  <LogOut className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <Link href={`/dang-nhap?next=${encodeURIComponent(path)}`}
                className="hidden h-10 items-center gap-1.5 rounded-lg px-3 text-[14.5px] font-semibold whitespace-nowrap text-ink-2 hover:bg-paper hover:text-ink sm:flex">
                <UserRound className="size-4" aria-hidden />Đăng nhập
              </Link>
            )}
            {!path.startsWith("/dat-lich") && (
              <Link href="/dat-lich"
                className="flex h-10 items-center rounded-lg bg-brand px-4 text-[14.5px] font-semibold whitespace-nowrap text-white hover:bg-brand-strong">
                Đặt lịch khám
              </Link>
            )}
            <button onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-controls="menu-di-dong" aria-label={menu ? "Đóng menu" : "Mở menu"}
              className="flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-paper lg:hidden">
              {menu ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </div>

        {/* Menu điện thoại */}
        {menu && (
          <div id="menu-di-dong" className="border-t border-line bg-surface lg:hidden">
            <nav className="mx-auto max-w-6xl px-4 py-2" aria-label="Điều hướng chính">
              {[...NAV, patient ? { href: "/ho-so", label: "Lịch hẹn và hồ sơ của tôi" } : { href: `/dang-nhap?next=${encodeURIComponent(path)}`, label: "Đăng nhập" }].map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMenu(false)}
                  className={cx("flex h-12 items-center border-b border-line-2 text-[15.5px] font-medium",
                    path.startsWith(n.href) ? "text-brand" : "text-ink")}>
                  {n.label}
                </Link>
              ))}
              {patient && (
                <button onClick={logout} className="flex h-12 w-full items-center border-b border-line-2 text-left text-[15.5px] font-medium text-ink-2">Đăng xuất</button>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 py-3 text-[14.5px]">
                <a href={tel} className="font-semibold text-ink">Tổng đài <span className="num">{hotline}</span></a>
                <a href="tel:115" className="font-semibold text-danger">Cấp cứu 115</a>
              </div>
            </nav>
          </div>
        )}
      </header>

      {bleed ? <main className="flex-1">{children}</main> : (
        <div className="relative flex flex-1 flex-col">
          {/* Hoạ tiết ở hai bên khoảng trống của trang hẹp */}
          <div className="squares no-print absolute -top-16 -left-24 hidden h-96 w-96 lg:block" aria-hidden />
          <div className="dots no-print absolute top-[42%] -right-10 hidden h-72 w-56 xl:block" aria-hidden />
          <main className={cx("relative mx-auto w-full flex-1 px-4 pb-20 pt-6 sm:pt-8", wide ? "max-w-6xl" : "max-w-3xl")}>{children}</main>
        </div>
      )}

      <footer className="no-print bg-navy text-[14px] text-navy-ink">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Brand onDark sub="Phòng khám Đa khoa" />
            {cfg?.address && <p className="mt-5 flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{cfg.address}</p>}
            <p className="mt-2 flex gap-2"><Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Tổng đài <a className="num font-semibold text-white hover:underline" href={tel}>{hotline}</a> · Cấp cứu <a className="num font-semibold text-[#ff9b9f] hover:underline" href="tel:115">115</a></span>
            </p>
          </div>
          <div>
            <p className="mb-3 font-semibold text-white">Giờ làm việc</p>
            <ul className="space-y-1.5">
              <li>Thứ 2 – Thứ 7</li>
              <li className="num">Sáng 08:00 – 12:00</li>
              <li className="num">Chiều 14:00 – 18:00</li>
              <li>Chủ nhật nghỉ</li>
            </ul>
          </div>
          <div>
            <p className="mb-3 font-semibold text-white">Bệnh nhân</p>
            <ul className="space-y-1.5">
              <li><Link href="/dat-lich" className="hover:text-white">Đặt lịch khám</Link></li>
              <li><Link href="/chuyen-khoa" className="hover:text-white">Chuyên khoa</Link></li>
              <li><Link href="/quy-dinh" className="hover:text-white">Bảng giá & quy định</Link></li>
              <li><Link href="/ho-so" className="hover:text-white">Tra cứu lịch hẹn</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 font-semibold text-white">Tại phòng khám</p>
            <ul className="space-y-1.5">
              <li><Link href="/kiosk" className="hover:text-white">Kiosk check-in</Link></li>
              <li><Link href="/man-hinh-cho" className="hover:text-white">Màn hình chờ quầy thuốc</Link></li>
              <li><Link href="/nhan-vien/dang-nhap" className="hover:text-white">Đăng nhập nhân viên</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-[12.5px] sm:flex-row sm:items-center sm:justify-between">
            <p>© {cfg?.clinic_name ?? "Phòng khám Đa khoa MedCare"}</p>
            <p>Gợi ý của trợ lý chỉ mang tính tham khảo, không thay thế chẩn đoán của bác sĩ.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts.at(-2)?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

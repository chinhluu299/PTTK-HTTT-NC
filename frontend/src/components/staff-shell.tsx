"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  CalendarOff, ChartColumn, ClipboardList, Contact, FolderTree, LogOut, Microscope, Pill, ReceiptText, Settings2, Users,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "./brand";
import { Spinner, cx } from "./ui";
import { setToken } from "@/lib/api";
import { useStaff } from "@/lib/hooks";
import type { StaffBrief } from "@/lib/types";

export const ROLE_LABEL: Record<string, string> = {
  DOCTOR: "Bác sĩ", TECHNICIAN: "Kỹ thuật viên", PHARMACIST: "Dược sĩ", ADMIN: "Quản trị viên",
};
export const ROLE_HOME: Record<string, string> = {
  DOCTOR: "/nhan-vien/bac-si", TECHNICIAN: "/nhan-vien/cls", PHARMACIST: "/nhan-vien/quay-thuoc", ADMIN: "/nhan-vien/quan-tri",
};
type NavItem = { href: string; label: string; icon: LucideIcon };
const LEAVE: NavItem = { href: "/nhan-vien/lich-nghi", label: "Lịch nghỉ", icon: CalendarOff };
const NAV: Record<string, { group: string; items: NavItem[] }[]> = {
  DOCTOR: [
    { group: "Khám bệnh", items: [{ href: "/nhan-vien/bac-si", label: "Danh sách khám", icon: ClipboardList }] },
    { group: "Cá nhân", items: [LEAVE] },
  ],
  TECHNICIAN: [
    { group: "Cận lâm sàng", items: [{ href: "/nhan-vien/cls", label: "Phiếu cận lâm sàng", icon: Microscope }] },
    { group: "Cá nhân", items: [LEAVE] },
  ],
  PHARMACIST: [
    { group: "Quầy thuốc", items: [{ href: "/nhan-vien/quay-thuoc", label: "Gọi số & thu ngân", icon: Pill }] },
    { group: "Cá nhân", items: [LEAVE] },
  ],
  ADMIN: [
    { group: "Tổng quan", items: [{ href: "/nhan-vien/quan-tri", label: "Thống kê", icon: ChartColumn }] },
    { group: "Quản lý", items: [
      { href: "/nhan-vien/quan-tri/danh-muc", label: "Danh mục", icon: FolderTree },
      { href: "/nhan-vien/quan-tri/nhan-vien", label: "Nhân viên", icon: Users },
      { href: "/nhan-vien/quan-tri/benh-nhan", label: "Bệnh nhân", icon: Contact },
      { href: "/nhan-vien/quan-tri/hoan-coc", label: "Hoàn cọc", icon: ReceiptText },
    ] },
    { group: "Hệ thống", items: [{ href: "/nhan-vien/quan-tri/tham-so", label: "Tham số", icon: Settings2 }] },
  ],
};

export function StaffShell({ roles, children, full }: { roles: string[]; children: (s: StaffBrief) => ReactNode; full?: boolean }) {
  const { staff, loading } = useStaff();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!loading && !staff) router.replace(`/nhan-vien/dang-nhap?next=${encodeURIComponent(path)}`);
  }, [loading, staff, router, path]);
  if (loading || !staff) return <Spinner />;
  const allowed = roles.includes(staff.role);
  const groups = NAV[staff.role] ?? [];
  const flat = groups.flatMap((g) => g.items);
  // mục có tiền tố dài nhất khớp với URL là mục đang chọn
  const activeHref = flat.filter((m) => path === m.href || path.startsWith(m.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const where = staff.role === "DOCTOR" ? [staff.specialty, staff.room].filter(Boolean).join(" · ") :
    staff.role === "TECHNICIAN" ? staff.department : null;
  const logout = () => { setToken("staff", null); router.push("/nhan-vien/dang-nhap"); };

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar máy tính */}
      <div className="no-print hidden w-[248px] shrink-0 bg-navy lg:block">
      <aside className="sticky top-0 flex h-dvh flex-col text-navy-ink">
        <div className="flex h-16 items-center border-b border-white/[0.07] px-5">
          <Brand href={ROLE_HOME[staff.role]} sub="Hệ thống quản lý phòng khám" onDark />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng phân hệ">
          {groups.map((g) => (
            <div key={g.group} className="mb-5">
              <p className="mb-1.5 px-3 text-[12px] font-medium text-navy-ink/70">{g.group}</p>
              <ul className="space-y-0.5">
                {g.items.map((n) => {
                  const active = n.href === activeHref;
                  return (
                    <li key={n.href}>
                      <Link href={n.href} aria-current={active ? "page" : undefined}
                        className={cx("relative flex h-9 items-center gap-3 rounded-md px-3 text-[14px] font-medium transition-colors",
                          active ? "bg-navy-3 text-white" : "hover:bg-navy-2 hover:text-white")}>
                        {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[#5ea3ea]" aria-hidden />}
                        <n.icon className={cx("size-[17px]", active ? "text-[#8cc0f3]" : "text-navy-ink/80")} aria-hidden />
                        {n.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/[0.07] p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <Avatar name={staff.full_name} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13.5px] font-semibold text-white">{staff.full_name}</p>
              <p className="truncate text-[12px]">{ROLE_LABEL[staff.role]}{where ? ` · ${where}` : ""}</p>
            </div>
            <button onClick={logout} aria-label="Đăng xuất" title="Đăng xuất"
              className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-navy-2 hover:text-white">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Thanh trên cho điện thoại / máy tính bảng */}
        <header className="no-print sticky top-0 z-40 bg-navy text-navy-ink lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Brand href={ROLE_HOME[staff.role]} sub="" onDark />
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-navy-3 px-2.5 py-1 text-[12px] font-semibold text-white sm:inline">{ROLE_LABEL[staff.role]}</span>
              <button onClick={logout} aria-label="Đăng xuất" className="flex size-9 items-center justify-center rounded-md hover:bg-navy-2 hover:text-white">
                <LogOut className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-white/[0.07] px-2" aria-label="Điều hướng phân hệ">
            {flat.map((n) => (
              <Link key={n.href} href={n.href}
                className={cx("flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[13.5px] font-medium whitespace-nowrap",
                  n.href === activeHref ? "border-[#5ea3ea] text-white" : "border-transparent hover:text-white")}>
                <n.icon className="size-4" aria-hidden />{n.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className={cx("mx-auto w-full flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8", full ? "max-w-[1480px]" : "max-w-[1240px]")}>
          {allowed ? children(staff) : (
            <div className="mx-auto max-w-lg rounded-lg border border-line bg-surface shadow-card p-8 text-center">
              <p className="num text-[13px] font-semibold text-danger">Lỗi 403</p>
              <p className="mt-1 text-lg font-semibold">Màn hình này không dành cho vai trò {ROLE_LABEL[staff.role]}</p>
              <Link href={ROLE_HOME[staff.role]} className="mt-4 inline-block font-semibold text-brand underline">Về màn hình của tôi</Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const parts = name.replace(/^(BS|DS|KTV|ThS|TS|BS\.CKI|BS\.CKII)\.?\s*/i, "").trim().split(/\s+/);
  const ini = ((parts.at(-2)?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1f4a73] text-[13px] font-bold text-white" aria-hidden>{ini}</span>
  );
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[13px] font-medium text-ink-3">{eyebrow}</p>}
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
        {sub && <p className="mt-1 text-[14.5px] text-ink-3">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

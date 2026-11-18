import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastHost } from "@/components/toast";

const sans = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["vietnamese", "latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "MedCare – Phòng khám Đa khoa", template: "%s · MedCare" },
  description: "Đặt lịch khám, trợ lý phân loại triệu chứng và quản lý phòng khám",
};

export const viewport: Viewport = {
  themeColor: "#0b5cab",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {/* Toàn bộ trang lấy dữ liệu ở client, nên để cả cây dưới Suspense cho phép đọc URL lúc chạy */}
        <Suspense fallback={null}>{children}</Suspense>
        <ToastHost />
      </body>
    </html>
  );
}

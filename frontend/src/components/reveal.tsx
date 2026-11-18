"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * Hiện dần khi cuộn tới (một lần).
 * Mặc định nội dung luôn hiển thị (kể cả khi JS chưa chạy). Chỉ những khối còn nằm dưới
 * màn hình lúc trang vừa mở mới bị ẩn tạm, rồi trồi lên khi người dùng cuộn tới.
 * Dùng data-reveal thay vì state để không render lại và không bị React ghi đè className.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return; // đang trong tầm nhìn: giữ nguyên
    el.dataset.reveal = "wait";
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.dataset.reveal = "in"; io.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx("reveal", className)} style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}

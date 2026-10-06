// Logo Tôi Đặt Món: xe đẩy có giỏ là cái TÔ ("Tôi" ≈ tô), nĩa + muỗng trong tô.
// Màu: đỏ gạch #9A3426 + xanh cốm #BACF50 (file gốc: public/brand/*.svg).

import { cn } from "@/lib/utils";
import { useEffect } from "react";

const RED = "#9A3426";
const LIME = "#BACF50";

/** Biểu tượng (không nền). `cut` = màu khoét nĩa/muỗng (màu nền phía sau). */
export function TdmMark({
  className,
  color = RED,
  cut = LIME,
}: {
  className?: string;
  color?: string;
  cut?: string;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(16 -40)">
        <g fill={color}>
          <path d="M78 118h52a20 20 0 0 1 19.4 15.2L163 188h-41.5l-9.2-34H78a18 18 0 0 1 0-36z" />
          <path d="M136 176h282a14 14 0 0 1 13.6 17.4C416 262 368 322 296 322h-56c-58 0-98-46-114.6-127.6A14 14 0 0 1 136 176z" />
          <path d="M206 316c-26 4-46 22-46 46s20 42 46 42h186a18 18 0 0 0 0-36H206c-6 0-10-3-10-6s4-6 10-6z" />
          <circle cx="218" cy="448" r="30" />
          <circle cx="362" cy="448" r="30" />
        </g>
        <g fill={cut}>
          <path d="M220 192h12v44h8v-44h12v44h8v-44h12v58c0 15-10 26-23 30v32h-20v-32c-13-4-23-15-23-30z" />
          <ellipse cx="338" cy="232" rx="30" ry="38" />
          <rect x="328" y="258" width="20" height="54" rx="10" />
        </g>
      </g>
    </svg>
  );
}

/** Ô biểu tượng app (nền xanh cốm bo góc). */
export function TdmIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[22%] bg-[#BACF50]",
        className,
      )}
    >
      <TdmMark className="h-[86%] w-[86%]" />
    </span>
  );
}

/** Logo ngang: ô biểu tượng + chữ "Tôi Đặt Món". */
export function TdmLogo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <TdmIcon className={size === "sm" ? "h-8 w-8" : "h-9 w-9"} />
      <span
        className={cn(
          "font-body font-extrabold tracking-tight text-[#9A3426]",
          size === "sm" ? "text-lg" : "text-xl",
        )}
      >
        Tôi Đặt Món
      </span>
    </span>
  );
}

/** Bật bảng màu Tôi Đặt Món cho cả trang (kể cả hộp thoại/thông báo nổi). */
export function useTdmTheme() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("tdm-theme");
    return () => el.classList.remove("tdm-theme");
  }, []);
}

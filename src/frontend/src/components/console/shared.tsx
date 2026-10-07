// Phần dùng chung của trang quản lý đối tác (/quan-ly): ngữ cảnh (máy, vai
// trò, đối tác), quyền gọi VPS (máy đối tác hoặc admin chế độ hỗ trợ), và
// các khối giao diện cơ bản (Card, BigButton, Switch).

import { useCanister } from "@/lib/canister";
import { credentialFor } from "@/lib/device-credential";
import { type PartnerAuth, logSupportAction } from "@/lib/partner-api";
import type {
  ConsoleDevice,
  ConsoleRole,
  PartnerSettings,
} from "@/lib/partner-console";
import { type EffectiveParam, currentValue } from "@/lib/platform-params";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

export interface Ctx {
  tenantId: string;
  tenantName: string;
  device: ConsoleDevice;
  role: ConsoleRole;
  settings: PartnerSettings | undefined;
  /** Tham số Tôi Đặt Món áp dụng cho đối tác (phí, liên hệ…). */
  params: EffectiveParam[];
  /** Hạn gói bán quầy (ns), 0 = không hạn / chưa có. */
  counterPlanUntil: bigint;
  /** true = admin Tôi Đặt Món đang làm thay (Hỗ trợ đối tác). */
  support: boolean;
  /** Quyền gọi API VPS của trang đối tác. */
  partnerAuth: () => Promise<PartnerAuth>;
}

/** Quyền VPS cho máy của đối tác. */
export function deviceAuth(deviceId: string): () => Promise<PartnerAuth> {
  return async () => ({ auth: `partner:${credentialFor(deviceId)}` });
}

/** Ghi nhật ký khi admin làm thay đối tác trên canister (không làm gì với máy đối tác). */
export async function logSupport(ctx: Ctx, action: string, detail: string) {
  if (!ctx.support) return;
  await logSupportAction(await ctx.partnerAuth(), action, detail);
}

/** Nhà hàng của đối tác (cả đang ẩn) — dùng chung các tab. */
export function useConsoleRestaurants(ctx: Ctx) {
  const { actor, isFetching } = useCanister();
  return useQuery({
    queryKey: ["console", "restaurants", ctx.tenantId],
    queryFn: () =>
      (actor as NonNullable<typeof actor>).listRestaurants(ctx.tenantId),
    enabled: !!actor && !isFetching && !!ctx.tenantId,
  });
}

export function ContactLinks({ params }: { params: EffectiveParam[] }) {
  const phone = currentValue(params, "contact_phone");
  const zalo = currentValue(params, "contact_zalo");
  if (!phone && !zalo) return null;
  const zaloHref = zalo.startsWith("http")
    ? zalo
    : `https://zalo.me/${zalo.replace(/[^\d]/g, "")}`;
  return (
    <div className="flex flex-wrap gap-2">
      {phone && (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
          className="flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"
        >
          Gọi {phone}
        </a>
      )}
      {zalo && (
        <a
          href={zaloHref}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-extrabold"
        >
          Nhắn Zalo
        </a>
      )}
    </div>
  );
}

export function BigButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "dark";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-extrabold transition-opacity disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground",
        variant === "dark" && "bg-foreground text-background",
        variant === "outline" && "border bg-card",
      )}
    >
      {children}
    </button>
  );
}

export function Switch({
  on,
  onToggle,
  label,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-9 w-[60px] shrink-0 rounded-full transition-colors disabled:opacity-50",
        on ? "bg-green-700" : "bg-stone-300",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-7 w-7 rounded-full bg-white transition-all",
          on ? "left-7" : "left-1",
        )}
      />
    </button>
  );
}

export function Card({
  children,
  className,
}: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

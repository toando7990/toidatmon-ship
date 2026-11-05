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
import { Loader2 } from "lucide-react";
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
          className="btn btn-primary font-extrabold"
        >
          Gọi {phone}
        </a>
      )}
      {zalo && (
        <a
          href={zaloHref}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline font-extrabold"
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
  busy,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "dark";
  disabled?: boolean;
  type?: "button" | "submit";
  /** Đang xử lý: hiện vòng quay + khoá nút. */
  busy?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "btn btn-lg w-full",
        variant === "primary" && "btn-primary",
        variant === "dark" && "btn-dark",
        variant === "outline" && "btn-outline",
        busy && "is-busy",
      )}
    >
      {busy && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      )}
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
      className="switch-track h-9 w-[60px]"
    >
      <span
        className={cn(
          "switch-thumb left-1 top-1 h-7 w-7",
          on ? "translate-x-6" : "translate-x-0",
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
    <section className={cn("surface-card flex flex-col gap-3 p-4", className)}>
      {children}
    </section>
  );
}

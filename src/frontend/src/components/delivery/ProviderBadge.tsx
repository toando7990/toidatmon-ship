// ProviderBadge — nhãn hãng giao hàng (Lalamove / Ahamove).
import type { DeliveryProvider } from "@/lib/vps-client";

export function ProviderBadge({
  provider,
  className = "",
}: {
  provider: DeliveryProvider | "";
  className?: string;
}) {
  if (!provider) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground ${className}`}
      data-ocid={`delivery.provider.${provider}`}
    >
      {provider === "ahamove" ? (
        <img
          src="/assets/images/delivery/ahamove.png"
          alt=""
          className="h-4 w-4 rounded"
        />
      ) : (
        <span
          className="flex h-4 w-4 items-center justify-center rounded bg-[#f16622] text-[9px] font-bold text-white"
          aria-hidden="true"
        >
          L
        </span>
      )}
      {provider === "ahamove" ? "Ahamove" : "Lalamove"}
    </span>
  );
}

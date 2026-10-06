// DeliveryLine — 1 dòng trên thẻ đơn /driver (nhân viên quầy): hãng giao,
// tài xế + biển số, trạng thái; ghi chú nếu đơn đã chuyển hãng.
// useDeliveryStatuses: đọc gộp trạng thái nhiều đơn (poll 15s).

import { ProviderBadge } from "@/components/delivery/ProviderBadge";
import { type DeliveryInfo, getDeliveryStatuses } from "@/lib/vps-client";
import { useQuery } from "@tanstack/react-query";

export function useDeliveryStatuses(orderIds: string[]) {
  const key = [...orderIds].sort().join(",");
  return useQuery({
    queryKey: ["deliveryStatuses", key],
    queryFn: () => getDeliveryStatuses(orderIds),
    enabled: orderIds.length > 0,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

const DOT: Record<string, string> = {
  finding: "bg-muted-foreground",
  to_pickup: "bg-info",
  at_pickup: "bg-warning",
  delivering: "bg-success",
  near_drop: "bg-success",
  delivered: "bg-success",
  cancelled: "bg-destructive",
  failed: "bg-destructive",
  place_failed: "bg-destructive",
};

export function DeliveryLine({
  info,
  ocid,
}: {
  info: DeliveryInfo | undefined;
  ocid?: string;
}) {
  if (!info) return null;
  const failed =
    info.allFailed ||
    info.status === "failed" ||
    info.status === "place_failed";
  const driver = info.driver;
  return (
    <div className="mt-2 flex flex-col gap-1" data-ocid={ocid}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ProviderBadge provider={info.provider} />
        <span className="flex items-center gap-1.5 text-foreground">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${DOT[info.status] ?? "bg-muted-foreground"}`}
            aria-hidden="true"
          />
          {driver?.name ? `Tài xế ${driver.name}` : ""}
          {driver?.plate ? ` · ${driver.plate}` : ""}
          {driver?.name || driver?.plate ? " · " : ""}
          <b>
            {info.uncertain
              ? `Không rõ đã đặt được chưa — kiểm tra app ${info.providerName}`
              : failed
                ? "Chưa có tài xế — cần tự đặt"
                : info.statusLabel.toLowerCase()}
          </b>
        </span>
      </div>
      {info.switched?.fromName && (
        <p className="text-xs text-info">
          Đã chuyển từ {info.switched.fromName}
        </p>
      )}
    </div>
  );
}

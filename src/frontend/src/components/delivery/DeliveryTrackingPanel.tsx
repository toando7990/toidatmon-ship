// DeliveryTrackingPanel — khung "Hành trình giao" trên trang Theo dõi đơn,
// dùng chung cho Lalamove và Ahamove (giao diện đã duyệt): hãng đang giao,
// 4 bước kèm giờ, tài xế (tên, biển số, nút Gọi), ghi chú chuyển hãng,
// nút xem tài xế trên bản đồ; hoặc thông báo không tìm được tài xế.

import { ProviderBadge } from "@/components/delivery/ProviderBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeliveryInfo } from "@/lib/vps-client";
import {
  ArrowRightLeft,
  CheckCircle2,
  MapPin,
  Phone,
  XCircle,
} from "lucide-react";

const STEPS: Array<{ label: string; description: string }> = [
  {
    label: "Đang tìm tài xế",
    description: "Hệ thống đang tìm tài xế gần nhà hàng.",
  },
  {
    label: "Tài xế đang đến quán",
    description: "Tài xế đã nhận đơn, đang tới lấy món.",
  },
  {
    label: "Đang giao đến bạn",
    description: "Tài xế đã lấy món, đang trên đường giao.",
  },
  { label: "Đã giao", description: "Chúc bạn ngon miệng!" },
];

function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function telHref(phone: string): string {
  const d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return `tel:${d}`;
  if (d.startsWith("84")) return `tel:+${d}`;
  return `tel:${d}`;
}

export function DeliveryTrackingPanel({ info }: { info: DeliveryInfo }) {
  const failed =
    info.allFailed ||
    info.status === "failed" ||
    info.status === "place_failed";
  const times = info.times;
  const stepTimes = [
    times?.createdAt,
    times?.assignedAt,
    times?.pickedAt,
    times?.completedAt,
  ];

  return (
    <div
      className="rounded-lg border border-border bg-card p-5 shadow-sm"
      data-ocid="order_tracker.delivery_panel"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Hành trình giao</h2>
        <ProviderBadge provider={info.provider} />
      </div>

      {failed ? (
        <div
          className="mt-3 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3"
          data-ocid="order_tracker.delivery_failed"
        >
          <XCircle
            className="h-5 w-5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {info.status === "failed"
                ? "Giao hàng không thành công"
                : "Chưa tìm được tài xế"}
            </p>
            <p className="text-muted-foreground">
              Nhà hàng sẽ liên hệ với bạn trong ít phút để sắp xếp giao hàng.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p
            className="mt-1 text-sm font-semibold text-primary"
            data-ocid="order_tracker.delivery_status"
          >
            {info.statusLabel}
          </p>

          {info.switched?.reason && (
            <p
              className="mt-3 flex items-start gap-2 rounded-md bg-info/10 px-3 py-2 text-xs text-info"
              data-ocid="order_tracker.delivery_switched"
            >
              <ArrowRightLeft
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                {info.switched.reason}
                {info.switched.at ? ` (lúc ${fmtTime(info.switched.at)})` : ""}.{" "}
                Bạn không phải trả thêm phí.
              </span>
            </p>
          )}

          {info.driver && (info.driver.name || info.driver.plate) && (
            <div
              className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background p-3"
              data-ocid="order_tracker.delivery_driver"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                {(info.driver.name || "T").trim().split(/\s+/).pop()?.[0] ??
                  "T"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {info.driver.name || "Tài xế"}
                </p>
                {info.driver.plate && (
                  <p className="text-xs text-muted-foreground">
                    Xe máy · {info.driver.plate}
                  </p>
                )}
              </div>
              {info.driver.phone && (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={telHref(info.driver.phone)}
                    data-ocid="order_tracker.delivery_call"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    Gọi
                  </a>
                </Button>
              )}
            </div>
          )}

          <ol
            className="mt-4 space-y-4"
            data-ocid="order_tracker.delivery_steps"
          >
            {STEPS.map((step, i) => {
              const done = i < info.step || info.status === "delivered";
              const active = i === info.step && !done;
              const t = done || active ? fmtTime(stepTimes[i]) : "";
              return (
                <li
                  key={step.label}
                  className="flex items-start gap-3"
                  data-ocid={`order_tracker.delivery_step.${i}`}
                  data-state={done ? "done" : active ? "active" : "pending"}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      done
                        ? "border-success bg-success text-success-foreground"
                        : active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        done || active
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {active ? info.statusLabel : step.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  {t && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {t}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {info.shareLink && info.status !== "delivered" && (
            <a
              href={info.shareLink}
              target="_blank"
              rel="noopener noreferrer"
              data-ocid="order_tracker.delivery_map_link"
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Xem tài xế trên bản đồ
            </a>
          )}
        </>
      )}
    </div>
  );
}

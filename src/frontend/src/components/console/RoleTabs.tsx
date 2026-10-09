// Tab của các vai trò trước đây dùng trang riêng (giai đoạn 3 gộp vào
// /quan-ly):
//   - Giao nhận (thay /driver): quét QR tài xế, hàng tài xế chờ trả tiền,
//     lịch sử, máy in.
//   - Kế toán (thay /enterprise): hoá đơn điện tử (AccountingPage), tiền đối
//     soát (PayoutsCard).

import type { Order } from "@/backend";
import { DriverOrderHistory } from "@/components/DriverOrderHistory";
import { DriverPrinterSettingsDialog } from "@/components/DriverPrinterSettingsDialog";
import { PayoutsCard } from "@/components/PartnerConnections";
import { PaymentQueue } from "@/components/PaymentQueue";
import { QRDisplay } from "@/components/QRDisplay";
import { QrScannerDialog } from "@/components/QrScannerDialog";
import { BigButton, type Ctx } from "@/components/console/shared";
import { usePendingOrders } from "@/hooks/usePendingOrders";
import { getOrder, useCanister } from "@/lib/canister";
import { cn } from "@/lib/utils";
import { AccountingPage } from "@/pages/AccountingPage";
import type { RestaurantHistoryPeriod } from "@/types";
import { Printer, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** ?scan_order=&scan_code= — mã QR nhận hàng quét bằng camera điện thoại. */
function readScanParams(): { orderId: string; code: string } | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const orderId = q.get("scan_order") ?? "";
    const code = q.get("scan_code") ?? "";
    return orderId && code ? { orderId, code } : null;
  } catch {
    return null;
  }
}

export function DriverTab({ ctx }: { ctx: Ctx }) {
  const { actor } = useCanister();
  const rid = ctx.device.restaurantId;
  const pending = usePendingOrders(rid || undefined);
  const [scanOpen, setScanOpen] = useState(false);
  const [paying, setPaying] = useState<{ order: Order; code?: string } | null>(
    null,
  );
  const [printerOpen, setPrinterOpen] = useState(false);
  const handled = useRef(false);

  async function openByQr(orderId: string, code: string) {
    if (!actor) return;
    try {
      const order = await getOrder(actor, orderId);
      if (order.tenantId !== ctx.tenantId) {
        toast.error("Mã QR không phải đơn của đối tác này");
        return;
      }
      setPaying({ order, code });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Không tìm thấy đơn cho mã QR này",
      );
    }
  }

  // Mở thẳng đơn khi trang được mở từ link "QR nhận hàng".
  // biome-ignore lint/correctness/useExhaustiveDependencies: chạy 1 lần khi actor sẵn sàng
  useEffect(() => {
    if (handled.current || !actor) return;
    const p = readScanParams();
    if (!p) return;
    handled.current = true;
    void openByQr(p.orderId, p.code);
  }, [actor]);

  return (
    <div className="flex flex-col gap-3" data-ocid="console.driver_tab">
      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className="flex h-[76px] items-center justify-center gap-3 rounded-2xl bg-foreground text-lg font-extrabold text-background"
        data-ocid="console.driver_scan"
      >
        <ScanLine className="h-7 w-7" /> Quét QR tài xế
      </button>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setPrinterOpen(true)}
          className="flex h-10 items-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-bold"
        >
          <Printer className="h-4 w-4" /> Máy in
        </button>
      </div>
      <div className="-mx-4">
        <PaymentQueue
          orders={pending.data ?? []}
          isLoading={pending.isLoading}
          isError={pending.isError}
          onPay={(order) => setPaying({ order })}
          payingOrderId={paying?.order.orderId ?? null}
        />
      </div>
      <QrScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onScanned={({ orderId, pickupCode }) => {
          setScanOpen(false);
          void openByQr(orderId, pickupCode);
        }}
      />
      {paying && (
        <QRDisplay
          order={paying.order}
          initialPickupCode={paying.code}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            toast.success("Tài xế đã thanh toán");
            void pending.refetch();
          }}
        />
      )}
      <DriverPrinterSettingsDialog
        open={printerOpen}
        onOpenChange={setPrinterOpen}
      />
    </div>
  );
}

const PERIODS: [RestaurantHistoryPeriod, string][] = [
  ["today", "Hôm nay"],
  ["week", "Tuần này"],
  ["month", "Tháng này"],
];

export function DriverHistoryTab({ ctx }: { ctx: Ctx }) {
  const [period, setPeriod] = useState<RestaurantHistoryPeriod>("today");
  return (
    <div className="flex flex-col gap-3" data-ocid="console.driver_history">
      <div className="flex gap-2">
        {PERIODS.map(([p, label]) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
            className={cn(
              "min-h-[44px] rounded-full border px-4 text-[15px] font-bold",
              period === p
                ? "border-foreground bg-foreground text-background"
                : "bg-card text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="-mx-4">
        <DriverOrderHistory
          deviceId={ctx.device.deviceId}
          restaurantId={ctx.device.restaurantId}
          period={period}
        />
      </div>
    </div>
  );
}

/** Hoá đơn điện tử — màn Kế toán cũ (/enterprise) giữ nguyên bên trong. */
export function InvoicesTab() {
  return (
    <div className="-mx-4" data-ocid="console.invoices_tab">
      <AccountingPage />
    </div>
  );
}

export function MoneyTab({ ctx }: { ctx: Ctx }) {
  return (
    <div className="flex flex-col gap-3" data-ocid="console.money_tab">
      <PayoutsCard deviceId={ctx.device.deviceId} tenantId={ctx.tenantId} />
      {ctx.support && (
        <BigButton variant="outline" disabled>
          Chế độ hỗ trợ: tiền đối soát xem ở /admin › Đối soát
        </BigButton>
      )}
    </div>
  );
}

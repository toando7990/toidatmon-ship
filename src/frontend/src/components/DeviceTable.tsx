// DeviceTable — bảng thiết bị với columns deviceId, restaurantId, role, activatedAt,
// active status, nút Thu hồi. UI tiếng Việt.

import { type Device, DeviceRole } from "@/backend";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ShieldOff } from "lucide-react";

const ROLE_LABELS: Record<DeviceRole, string> = {
  [DeviceRole.admin]: "Quản trị",
  [DeviceRole.cashier]: "Thu ngân",
  [DeviceRole.driver]: "Tài xế",
  [DeviceRole.paymentQueue]: "Hàng đợi thanh toán",
  [DeviceRole.accounting]: "Kế toán",
  [DeviceRole.salesPromoReporting]: "Báo cáo bán hàng & KM",
  [DeviceRole.tenantAdmin]: "Quản trị đối tác",
};

function formatTimestamp(ns: bigint): string {
  if (!ns || ns <= 0n) return "—";
  try {
    // Backend stores nanoseconds since epoch.
    const ms = Number(ns / 1_000_000n);
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    return new Date(ms).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function truncateId(id: string, max = 14): string {
  if (!id) return "—";
  if (id.length <= max) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export interface DeviceTableProps {
  devices: Device[];
  isLoading?: boolean;
  onRevoke?: (deviceId: string) => void;
  revokingDeviceId?: string | null;
  emptyMessage?: string;
}

export function DeviceTable({
  devices,
  isLoading = false,
  onRevoke,
  revokingDeviceId = null,
  emptyMessage = "Chưa có thiết bị nào.",
}: DeviceTableProps) {
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
        data-ocid="device.table.loading_state"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải danh sách thiết bị…
      </div>
    );
  }

  if (!devices || devices.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-10 text-center"
        data-ocid="device.table.empty_state"
      >
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-border"
      data-ocid="device.table"
    >
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="pl-3">Nhân viên</TableHead>
            <TableHead>SĐT</TableHead>
            <TableHead>Nhà hàng</TableHead>
            <TableHead>Vai trò</TableHead>
            <TableHead>Kích hoạt lúc</TableHead>
            <TableHead className="text-center">Trạng thái</TableHead>
            <TableHead className="pr-3 text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device, index) => {
            const isRevoking = revokingDeviceId === device.deviceId;
            return (
              <TableRow
                key={device.deviceId}
                data-ocid={`device.table.row.${index}`}
              >
                <TableCell className="pl-3">
                  <p className="text-sm font-medium text-foreground">
                    {device.name || "Chưa có tên"}
                  </p>
                  <span
                    className="font-mono text-xs text-muted-foreground"
                    title={device.deviceId}
                  >
                    {truncateId(device.deviceId)}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  {device.phone || "—"}
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  {device.restaurantId || "—"}
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  {ROLE_LABELS[device.role] ?? device.role}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatTimestamp(device.activatedAt)}
                </TableCell>
                <TableCell className="text-center">
                  {device.active ? (
                    <span
                      className="badge-success inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                      data-ocid={`device.table.status.${index}`}
                    >
                      Kích hoạt
                    </span>
                  ) : (
                    <span
                      className="badge-destructive inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                      data-ocid={`device.table.status.${index}`}
                    >
                      Đã thu hồi
                    </span>
                  )}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  {device.active && onRevoke ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => onRevoke(device.deviceId)}
                      disabled={isRevoking}
                      data-ocid={`device.table.revoke_button.${index}`}
                      aria-label={`Thu hồi thiết bị ${truncateId(device.deviceId)}`}
                    >
                      {isRevoking ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Thu hồi
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export { ROLE_LABELS, formatTimestamp, truncateId };

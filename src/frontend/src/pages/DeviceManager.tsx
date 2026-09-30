// DeviceManager — trang /admin/devices: group thiết bị theo nhà hàng
// (useDevicesByRestaurant), filter role (dropdown), hiển thị DeviceTable,
// nút Thu hồi. UI tiếng Việt: Quản lý thiết bị, Theo nhà hàng, Theo vai trò.

import { type Device, DeviceRole } from "@/backend";
import { ActivationCodeForm } from "@/components/ActivationCodeForm";
import { DeviceTable } from "@/components/DeviceTable";
import { EnterpriseActivationCodeForm } from "@/components/EnterpriseActivationCodeForm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCleanupExpiredActivations,
  useDevicesByRestaurant,
  useDevicesByRole,
  useRestaurants,
  useRevokeDevice,
} from "@/hooks/useQueries";
import {
  Building2,
  KeyRound,
  Loader2,
  ShieldOff,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card data-ocid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
type RoleFilter = "all" | DeviceRole;

const ROLE_FILTER_OPTIONS: Array<{ value: RoleFilter; label: string }> = [
  { value: "all", label: "Tất cả vai trò" },
  { value: DeviceRole.admin, label: "Quản trị" },
  { value: DeviceRole.cashier, label: "Thu ngân" },
  { value: DeviceRole.driver, label: "Tài xế" },
  { value: DeviceRole.paymentQueue, label: "Hàng đợi thanh toán" },
  { value: DeviceRole.accounting, label: "Kế toán" },
  {
    value: DeviceRole.salesPromoReporting,
    label: "Báo cáo bán hàng & KM",
  },
];

function matchesRole(device: Device, filter: RoleFilter): boolean {
  if (filter === "all") return true;
  return device.role === filter;
}

export function DeviceManager() {
  const { data: restaurants, isLoading: restaurantsLoading } = useRestaurants();
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);
  const [revokeDeviceId, setRevokeDeviceId] = useState<string>("");
  const [cleanedCount, setCleanedCount] = useState<bigint | null>(null);

  const devicesQuery = useDevicesByRestaurant(selectedRestaurant || undefined);
  // Thiết bị doanh nghiệp (Kế toán/Báo cáo bán hàng & KM) KHÔNG gắn theo
  // nhà hàng nào (restaurantId rỗng) — useDevicesByRestaurant() không bao
  // giờ trả về chúng, cần useDevicesByRole() riêng cho từng vai trò rồi
  // gộp lại (canister chỉ nhận 1 role mỗi lần gọi, không nhận mảng).
  const accountingDevicesQuery = useDevicesByRole(DeviceRole.accounting);
  const salesReportingDevicesQuery = useDevicesByRole(
    DeviceRole.salesPromoReporting,
  );
  const enterpriseDevices = [
    ...(accountingDevicesQuery.data ?? []),
    ...(salesReportingDevicesQuery.data ?? []),
  ];
  const revokeMutation = useRevokeDevice();
  const revokeByIdMutation = useRevokeDevice();
  const cleanupMutation = useCleanupExpiredActivations();
  const activeRestaurantId =
    selectedRestaurant || restaurants?.[0]?.restaurantId;
  const devices = (devicesQuery.data ?? []).filter((d) =>
    matchesRole(d, roleFilter),
  );

  async function handleRevoke(deviceId: string) {
    setRevokingDeviceId(deviceId);
    try {
      await revokeMutation.mutateAsync(deviceId);
      toast.success("Đã thu hồi thiết bị.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể thu hồi thiết bị.";
      toast.error(message);
    } finally {
      setRevokingDeviceId(null);
    }
  }

  async function handleRevokeById(e: React.FormEvent) {
    e.preventDefault();
    if (!revokeDeviceId.trim()) {
      toast.error("Vui lòng nhập mã thiết bị.");
      return;
    }
    try {
      await revokeByIdMutation.mutateAsync(revokeDeviceId.trim());
      toast.success("Đã thu hồi thiết bị.");
      setRevokeDeviceId("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể thu hồi thiết bị.";
      toast.error(message);
    }
  }

  async function handleCleanup() {
    try {
      const count = await cleanupMutation.mutateAsync();
      setCleanedCount(count);
      toast.success(`Đã dọn dẹp ${count.toString()} mã hết hạn.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể dọn dẹp mã hết hạn.";
      toast.error(message);
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="device.page"
    >
      <div className="flex flex-col gap-1">
        <h1
          className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          data-ocid="device.title"
        >
          Quản lý thiết bị
        </h1>
        <p className="text-sm text-muted-foreground">
          Xem và thu hồi thiết bị đã kích hoạt theo nhà hàng và vai trò.
        </p>
      </div>

      {/* Filters */}
      <div
        className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"
        data-ocid="device.filters"
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor="device-restaurant"
            className="text-sm font-medium text-muted-foreground"
          >
            Theo nhà hàng
          </label>
          <Select
            value={selectedRestaurant || "all"}
            onValueChange={(v) => setSelectedRestaurant(v === "all" ? "" : v)}
            disabled={restaurantsLoading}
          >
            <SelectTrigger
              id="device-restaurant"
              className="w-full sm:w-[260px]"
              data-ocid="device.restaurant_select"
            >
              <SelectValue
                placeholder={
                  restaurantsLoading ? "Đang tải…" : "Tất cả nhà hàng"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-ocid="device.restaurant_option.all">
                Tất cả nhà hàng
              </SelectItem>
              {restaurants?.map((r) => (
                <SelectItem
                  key={r.restaurantId}
                  value={r.restaurantId}
                  data-ocid={`device.restaurant_option.${r.restaurantId}`}
                >
                  {r.name || r.restaurantId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="device-role"
            className="text-sm font-medium text-muted-foreground"
          >
            Theo vai trò
          </label>
          <Select
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v as RoleFilter)}
          >
            <SelectTrigger
              id="device-role"
              className="w-full sm:w-[200px]"
              data-ocid="device.role_select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_FILTER_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  data-ocid={`device.role_option.${opt.value}`}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="mt-6" data-ocid="device.content">
        {restaurantsLoading && !restaurants ? (
          <div
            className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
            data-ocid="device.loading_state"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải danh sách nhà hàng…
          </div>
        ) : !activeRestaurantId ? (
          <Card data-ocid="device.empty_restaurant_state">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <Smartphone
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Chưa có nhà hàng
              </CardTitle>
              <CardDescription>
                Thêm nhà hàng trước khi quản lý thiết bị.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card data-ocid="device.table_card">
            <CardHeader>
              <CardTitle className="font-display">
                Thiết bị của{" "}
                {restaurants?.find((r) => r.restaurantId === activeRestaurantId)
                  ?.name ?? activeRestaurantId}
              </CardTitle>
              <CardDescription>
                {devices.length} thiết bị hiển thị sau khi lọc.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeviceTable
                devices={devices}
                isLoading={devicesQuery.isLoading}
                onRevoke={handleRevoke}
                revokingDeviceId={revokingDeviceId}
                emptyMessage="Chưa có thiết bị nào khớp với bộ lọc."
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tạo mã kích hoạt + Thu hồi + Dọn dẹp mã hết hạn (chuyển từ /admin sang đây) */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          icon={KeyRound}
          title="Tạo mã kích hoạt"
          description="Tạo mã 6 ký tự hợp lệ 15 phút để kích hoạt thiết bị mới."
          testId="device.activation_card"
        >
          <ActivationCodeForm />
        </SectionCard>

        <SectionCard
          icon={Building2}
          title="Tạo mã — Kế toán & Báo cáo doanh nghiệp"
          description="Tạo mã kích hoạt cho vai trò Kế toán hoặc Báo cáo bán hàng & KM — không gắn theo nhà hàng cụ thể, số liệu tổng hợp toàn bộ chuỗi. Xem danh sách thiết bị đã kích hoạt bên dưới."
          testId="device.enterprise_activation_card"
        >
          <EnterpriseActivationCodeForm />
        </SectionCard>

        <SectionCard
          icon={ShieldOff}
          title="Thu hồi thiết bị"
          description="Nhập mã thiết bị để thu hồi quyền truy cập ngay lập tức."
          testId="device.revoke_by_id_card"
        >
          <form
            onSubmit={handleRevokeById}
            className="flex flex-col gap-3"
            data-ocid="device.revoke_form"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="revoke-device" className="text-sm font-medium">
                Mã thiết bị
              </Label>
              <Input
                id="revoke-device"
                value={revokeDeviceId}
                onChange={(e) => setRevokeDeviceId(e.target.value)}
                placeholder="VD: dev-abc123"
                data-ocid="device.revoke_input"
              />
            </div>
            <Button
              type="submit"
              variant="destructive"
              disabled={revokeByIdMutation.isPending || !revokeDeviceId.trim()}
              data-ocid="device.revoke.submit_button"
              className="w-full sm:w-auto"
            >
              {revokeByIdMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
              )}
              Thu hồi
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          icon={Sparkles}
          title="Dọn dẹp mã hết hạn"
          description="Xóa các mã kích hoạt đã quá hạn để giải phóng bộ nhớ canister."
          testId="device.cleanup_card"
        >
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleCleanup}
              disabled={cleanupMutation.isPending}
              data-ocid="device.cleanup.button"
              className="w-full sm:w-auto"
            >
              {cleanupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              Dọn dẹp
            </Button>
            {cleanedCount !== null && (
              <p
                className="text-sm text-muted-foreground"
                data-ocid="device.cleanup.result"
              >
                Đã dọn dẹp{" "}
                <span className="font-semibold text-foreground">
                  {cleanedCount.toString()}
                </span>{" "}
                mã hết hạn.
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          icon={Building2}
          title="Thiết bị doanh nghiệp đã kích hoạt"
          description="Danh sách thiết bị đang gắn vai trò Kế toán hoặc Báo cáo bán hàng & KM — không gắn theo nhà hàng cụ thể nào."
          testId="device.enterprise_devices_card"
        >
          <DeviceTable
            devices={enterpriseDevices}
            isLoading={
              accountingDevicesQuery.isLoading ||
              salesReportingDevicesQuery.isLoading
            }
            onRevoke={handleRevoke}
            revokingDeviceId={revokingDeviceId}
            emptyMessage="Chưa có thiết bị doanh nghiệp nào được kích hoạt."
          />
        </SectionCard>
      </div>
    </section>
  );
}

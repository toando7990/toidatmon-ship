// Giai đoạn 3: các trang riêng /driver, /counter, /enterprise/management đã
// gộp vào trang quản lý /<thương-hiệu>/quan-ly. Máy đã kích hoạt ở trang cũ
// được chuyển sang luôn (dùng lại mã máy + khoá đã lưu, không nhập lại mã);
// link "QR nhận hàng" (?scan_order=&scan_code=) được giữ nguyên để tab Tài xế
// mở thẳng đơn.

import { TdmLogo } from "@/components/TdmLogo";
import { useTenant } from "@/hooks/useTenant";
import { saveConsoleDevice } from "@/lib/partner-console";
import { MonitorSmartphone, Truck, Wallet } from "lucide-react";
import { useEffect } from "react";

export interface StoredDevice {
  deviceId: string;
  restaurantId: string;
  name: string;
}

/** Máy đã kích hoạt ở trang cũ (khoá localStorage của trang đó). */
export function readStoredDevice(key: string): StoredDevice | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredDevice>;
    return p?.deviceId
      ? {
          deviceId: p.deviceId,
          restaurantId: p.restaurantId ?? "",
          name: p.name ?? "",
        }
      : null;
  } catch {
    return null;
  }
}

const KIND = {
  driver: { title: "Trang Tài xế", icon: Truck },
  counter: { title: "Trang Bán quầy", icon: MonitorSmartphone },
  enterprise: { title: "Trang Kế toán & Báo cáo", icon: Wallet },
} as const;

export function MovedToConsole({
  kind,
  stored,
}: {
  kind: keyof typeof KIND;
  stored: StoredDevice | null;
}) {
  const { tenant } = useTenant();
  const slug = tenant?.slug ?? "";
  const target = `/${slug}/quan-ly${typeof window !== "undefined" ? window.location.search : ""}`;
  const K = KIND[kind];

  const id = stored?.deviceId ?? "";
  const restaurantId = stored?.restaurantId ?? "";
  const name = stored?.name ?? "";
  useEffect(() => {
    if (!tenant || !id) return;
    saveConsoleDevice({
      deviceId: id,
      tenantId: tenant.tenantId,
      restaurantId,
      name,
    });
    // Mở từ link "QR nhận hàng" → chuyển ngay để thu tiền tài xế.
    const fast = target.includes("scan_order=");
    const t = window.setTimeout(
      () => window.location.assign(target),
      fast ? 300 : 5000,
    );
    return () => window.clearTimeout(t);
  }, [tenant, id, restaurantId, name, target]);

  return (
    <div
      className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-background px-5 pb-8 pt-14"
      data-ocid="moved_to_console.page"
    >
      <TdmLogo />
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800">
        <K.icon className="h-9 w-9" />
      </span>
      <h1 className="text-2xl font-extrabold">
        {K.title} đã chuyển vào Quản lý
      </h1>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Từ nay máy Giao nhận, Nhân viên, Kế toán đều dùng chung trang{" "}
        <b className="text-foreground">toidatmon.vn/{slug}/quan-ly</b>.{" "}
        {stored?.deviceId
          ? `Máy này đã kích hoạt${stored.name ? ` (${stored.name})` : ""} nên không cần nhập lại mã.`
          : "Mở trang Quản lý và nhập mã kích hoạt 6 ký tự do Chủ đối tác cấp."}
      </p>
      <a
        href={target}
        className="flex h-14 items-center justify-center rounded-2xl bg-primary text-[17px] font-extrabold text-primary-foreground"
        data-ocid="moved_to_console.open"
      >
        Mở trang Quản lý
      </a>
      {stored?.deviceId && (
        <p className="text-center text-sm text-muted-foreground">
          Tự chuyển sau 5 giây · Mã QR trên phiếu cũ vẫn quét được
        </p>
      )}
    </div>
  );
}

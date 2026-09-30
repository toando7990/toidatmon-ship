// DriverPaymentScreen — Trang thanh toán cho tài xế (mobile-first).
// Bước 1: Kích hoạt thiết bị (nhập mã 6 ký tự, 15 phút) → activateDevice.
// Bước 2: Poll listPendingPaymentOrders(restaurantId) 5s → hàng đợi FIFO.
// Bước 3: Bấm [Thanh toán] → QR full screen → poll getOrderStatus 5s → tự ẩn khi #paid.

import type { Order } from "@/backend";
import { ActivationForm } from "@/components/ActivationForm";
import { DriverOrderHistory } from "@/components/DriverOrderHistory";
import { DriverPrinterSettingsDialog } from "@/components/DriverPrinterSettingsDialog";
import { PaymentQueue } from "@/components/PaymentQueue";
import { QRDisplay } from "@/components/QRDisplay";
import { useDeviceHeader } from "@/contexts/DeviceHeaderContext";
import { usePendingOrders } from "@/hooks/usePendingOrders";
import { useDevicesByRestaurant } from "@/hooks/useQueries";
import { getOrder, useCanister } from "@/lib/canister";
import type { RestaurantHistoryPeriod } from "@/types";
import { useSearch } from "@tanstack/react-router";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ListOrdered,
  Printer,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const DRIVER_STORAGE_KEY = "bbh_driver_activation";

type DriverTab = "queue" | RestaurantHistoryPeriod;

const NAV_ITEMS: { tab: DriverTab; label: string; icon: typeof ListOrdered }[] =
  [
    { tab: "queue", label: "Hàng đợi", icon: ListOrdered },
    { tab: "today", label: "Hôm nay", icon: CalendarDays },
    { tab: "week", label: "Tuần này", icon: CalendarRange },
    { tab: "month", label: "Tháng này", icon: Calendar },
  ];

function loadStoredActivation(): {
  restaurantId: string;
  deviceId: string;
  name: string;
} | null {
  try {
    const raw = localStorage.getItem(DRIVER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.restaurantId && parsed?.deviceId) {
      return { ...parsed, name: parsed.name ?? "" };
    }
    return null;
  } catch {
    return null;
  }
}

export function DriverPaymentScreen() {
  // Đọc query string ?scan_order=...&scan_code=... — cách nhân viên
  // dùng CAMERA GỐC của điện thoại (không phải camera trong trình
  // duyệt) quét "QR nhận hàng": mã QR giờ mã hoá 1 ĐƯỜNG LINK (xem
  // OrderTracker.tsx + pickup-qr-image.js) trỏ thẳng về đây kèm 2 tham
  // số này — điện thoại tự nhận diện là link và mở thẳng trang này,
  // không cần bấm nút "Quét QR nhận hàng" (camera trong trình duyệt)
  // nữa — tính năng đó vẫn giữ lại làm phương án dự phòng cho thiết bị
  // không quét được bằng camera gốc (VD máy tính bàn).
  const search = useSearch({ strict: false }) as {
    scan_order?: string;
    scan_code?: string;
  };
  // Đã xử lý xong query param này chưa — tránh xử lý lặp lại nếu
  // component re-render nhiều lần trong lúc vẫn còn cùng URL.
  const [scanQueryHandled, setScanQueryHandled] = useState(false);
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);

  // Trạng thái kích hoạt: restaurantId + deviceId sau khi activateDevice thành công.
  // Lưu thêm vào localStorage để thiết bị nhớ trạng thái qua các lần tải lại trang/
  // tắt mở app — tài xế không phải kích hoạt lại mỗi lần.
  const stored = loadStoredActivation();
  const [restaurantId, setRestaurantId] = useState<string | null>(
    stored?.restaurantId ?? null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(
    stored?.deviceId ?? null,
  );
  const [deviceName, setDeviceName] = useState<string>(stored?.name ?? "");
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<DriverTab>("queue");
  // Mã nhận hàng đã có sẵn từ lần quét "QR nhận hàng" gần nhất — truyền
  // vào QRDisplay để tự động tạo QR, bỏ qua bước nhập tay.
  const [scannedPickupCode, setScannedPickupCode] = useState<string | null>(
    null,
  );

  const { actor } = useCanister();

  const { setDeviceHeader } = useDeviceHeader();
  // Đẩy tên/mã thiết bị lên header dùng chung (Layout.tsx) — thay cho
  // logo/tiêu đề/nút Menu, cùng cách đã làm ở CounterOrder.tsx.
  useEffect(() => {
    if (deviceId) {
      setDeviceHeader({ name: deviceName, id: deviceId });
    }
    return () => setDeviceHeader(null);
  }, [deviceId, deviceName, setDeviceHeader]);

  const ordersQuery = usePendingOrders(restaurantId ?? undefined);

  // Việc 9/9: kiểm tra định kỳ (15s) xem thiết bị này có bị admin "Thu
  // hồi" (active=false) hay không — trước đây thiết bị đã kích hoạt hoạt
  // động MÃI MÃI dựa hoàn toàn vào localStorage, KHÔNG BAO GIỜ tự biết đã
  // bị thu hồi (không nơi nào re-check active sau lúc kích hoạt). Phát
  // hiện đúng thiết bị (active=false) → tự đăng xuất về màn hình nhập mã
  // kích hoạt lại. CHỈ đăng xuất khi TÌM THẤY RÕ RÀNG record active=false
  // — không tự đăng xuất nếu danh sách rỗng/chưa tải xong (tránh false
  // positive do lỗi mạng tạm thời).
  const { data: devicesForActiveCheck } = useDevicesByRestaurant(
    restaurantId ?? undefined,
    15000,
  );
  useEffect(() => {
    if (!deviceId || !devicesForActiveCheck) return;
    const thisDevice = devicesForActiveCheck.find(
      (d) => d.deviceId === deviceId,
    );
    if (thisDevice && !thisDevice.active) {
      try {
        localStorage.removeItem(DRIVER_STORAGE_KEY);
      } catch {
        // localStorage không khả dụng — vẫn tiếp tục đăng xuất bình
        // thường trong phiên hiện tại.
      }
      setRestaurantId(null);
      setDeviceId(null);
      setDeviceName("");
      setActiveOrder(null);
      toast.error(
        "Thiết bị này đã bị thu hồi quyền truy cập. Vui lòng kích hoạt lại.",
      );
    }
  }, [deviceId, devicesForActiveCheck]);

  function handleActivated(restId: string, devId: string, name: string) {
    setRestaurantId(restId);
    setDeviceId(devId);
    setDeviceName(name);
    try {
      localStorage.setItem(
        DRIVER_STORAGE_KEY,
        JSON.stringify({ restaurantId: restId, deviceId: devId, name }),
      );
    } catch {
      // localStorage không khả dụng (chế độ ẩn danh...) — vẫn hoạt động bình thường
      // trong phiên hiện tại, chỉ là không nhớ được qua lần tải lại sau.
    }
    toast.success("Thiết bị đã sẵn sàng nhận đơn thanh toán");
  }
  function handlePay(order: Order) {
    setActiveOrder(order);
  }

  // Sau khi có "QR nhận hàng" thành công (dù từ quét camera trong trình
  // duyệt hay từ link camera gốc điện thoại mở tới) — lấy đúng đơn từ
  // orderId (kể cả đơn CHƯA xuất hiện trong hàng đợi ordersQuery.data,
  // VD tài xế đến sớm) rồi mở thẳng QRDisplay với mã nhận hàng đã biết
  // sẵn.
  async function openOrderByPickupQr(orderId: string, pickupCode: string) {
    if (!actor) return;
    try {
      const order = await getOrder(actor, orderId);
      setScannedPickupCode(pickupCode);
      setActiveOrder(order);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Không tìm thấy đơn hàng cho mã QR này.",
      );
    }
  }

  // Tự động mở đơn khi trang được tải qua link "QR nhận hàng" (camera
  // gốc điện thoại quét, không qua QrScannerDialog) — chỉ chạy 1 lần
  // sau khi đã kích hoạt xong (actor sẵn sàng), tránh chạy lặp nếu
  // component re-render nhiều lần trong lúc vẫn còn cùng URL.
  // biome-ignore lint/correctness/useExhaustiveDependencies: openOrderByPickupQr đọc actor mới nhất qua closure, không cần liệt kê (hàm định nghĩa lại mỗi render nhưng logic bên trong không đổi theo cách ảnh hưởng ở đây)
  useEffect(() => {
    if (scanQueryHandled) return;
    if (!actor || !search.scan_order || !search.scan_code) return;
    setScanQueryHandled(true);
    void openOrderByPickupQr(search.scan_order, search.scan_code);
  }, [actor, search.scan_order, search.scan_code, scanQueryHandled]);

  function handleCloseQr() {
    setActiveOrder(null);
    setScannedPickupCode(null);
  }

  function handlePaid(order: Order) {
    setActiveOrder(null);
    setScannedPickupCode(null);
    toast.success(`Đã thanh toán đơn ${order.cusName || order.orderId}`);
    // Invalidate để queue refresh ngay (usePendingOrders poll 5s sẽ tự cập nhật).
    void ordersQuery.refetch();
  }

  // Bước 1: chưa kích hoạt.
  if (!restaurantId || !deviceId) {
    return <ActivationForm onActivated={handleActivated} />;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col" data-ocid="driver.page">
      {/* Bước 2/3: nội dung theo tab đang chọn (Hàng đợi hoặc 1 trong 3
          mốc lịch sử) — cuộn RIÊNG trong khu vực này, để status bar +
          bottom nav luôn cố định (không cuộn theo). */}
      <div className="flex-1 overflow-y-auto">
        {/* Nút "Quét QR nhận hàng" (camera trong trình duyệt) đã BỎ theo
            yêu cầu — nhân viên quét "QR nhận hàng" bằng CAMERA GỐC của
            điện thoại (QR mã hoá link /driver?scan_order=&scan_code=, xem
            effect tự mở đơn ở trên). Chỗ này giờ là nút cấu hình máy in
            (dùng được trên cả điện thoại lẫn máy tính). */}
        {activeTab === "queue" && (
          <div className="flex justify-end px-4 pt-4">
            <button
              type="button"
              onClick={() => setPrinterDialogOpen(true)}
              data-ocid="driver.printer_settings_button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-muted"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              Cấu hình máy in
            </button>
          </div>
        )}
        {activeTab === "queue" ? (
          <PaymentQueue
            orders={ordersQuery.data ?? []}
            isLoading={ordersQuery.isLoading}
            isError={ordersQuery.isError}
            onPay={handlePay}
            payingOrderId={activeOrder?.orderId ?? null}
          />
        ) : (
          <DriverOrderHistory restaurantId={restaurantId} period={activeTab} />
        )}
      </div>

      {/* Thanh điều hướng dưới — thay cho 2 tầng tab cũ (tab lớn "Hàng
          đợi thanh toán"/"Lịch sử đơn hàng" ở đầu trang + 3 nút con
          "Hôm nay/Tuần này/Tháng này" ẩn bên trong tab Lịch sử). Giờ gộp
          thành 1 tầng — 4 mục ngang hàng, cố định ở cuối trang (theo
          yêu cầu tối ưu giao diện đã duyệt). */}
      <nav
        className="flex shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
        data-ocid="driver.bottom_nav"
      >
        {NAV_ITEMS.map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            aria-current={activeTab === tab ? "page" : undefined}
            data-ocid={`driver.bottom_nav.${tab}`}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-smooth ${
              activeTab === tab
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {/* Bước 3: QR full screen overlay — hoạt động mọi lúc */}
      {activeOrder && (
        <QRDisplay
          order={activeOrder}
          initialPickupCode={scannedPickupCode ?? undefined}
          onClose={handleCloseQr}
          onPaid={handlePaid}
        />
      )}

      <DriverPrinterSettingsDialog
        open={printerDialogOpen}
        onOpenChange={setPrinterDialogOpen}
      />
    </div>
  );
}

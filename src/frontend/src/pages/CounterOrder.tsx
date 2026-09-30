// CounterOrder — app quầy cho nhân viên đặt món hộ khách đến trực tiếp
// (walk-in). Cài đặt cố định theo thiết bị (kích hoạt 1 lần, gắn với 1 nhà
// hàng cụ thể — dùng chung cơ chế activateDevice với "Hàng đợi thanh toán",
// vai trò 'cashier'). Không xác thực email, không có bước "Mã nhận hàng"
// (khách đứng ngay tại quầy) — đặt xong hiện QR thanh toán ngay lập tức.
//
// GIÁ MÓN: dùng useMenuForRestaurant(restaurantId) — áp dụng ĐÚNG giá
// override riêng của nhà hàng gắn với thiết bị (setRestaurantPriceOverride,
// PriceOverrideEditor.tsx), KHÁC useMenus() (giá chung, không override) mà
// CreateOrder.tsx (đặt online) đang dùng — đúng mục đích: phân biệt được
// giá bán online và giá bán tại quầy của cùng 1 món, theo từng nhà hàng.
//
// GIAO DIỆN DESKTOP (15-21 inch, theo mockup đã duyệt) — bố cục 2 cột:
// menu bên trái (toàn bộ 4 danh mục, groupByCategory — không giới hạn chỉ
// "Món chính" như trước, lưới 5 cột), giỏ hàng bên phải LUÔN CỐ ĐỊNH
// (sticky, không cuộn theo trang) — nhân viên thấy tổng tiền + nút
// "Đặt đơn" mọi lúc mà không cần cuộn xuống cuối trang.
//
// Tối ưu giao diện (mockup đã duyệt riêng): ô tìm kiếm + nút "Máy in"
// gộp chung 1 thanh công cụ (thay vì tách rời — search bên trong
// MenuPicker, nút Máy in đứng riêng 1 hàng) — dùng externalQuery/
// onExternalQueryChange để MenuPicker uỷ quyền search state ra ngoài,
// tự ẩn ô tìm kiếm nội bộ của nó. Banner Giờ Vàng thu gọn còn 1 dòng
// khi đang active — nhường không gian dọc cho lưới món.
//
// Banner Giờ Vàng ở đầu trang (dùng usePromotionCountdown/useCurrentPromotion
// đã có sẵn) — ĐƠN GIẢN HƠN PromotionBanner.tsx: KHÔNG có phần nhắc xác
// thực email (đơn quầy không cần email để hưởng Giờ Vàng — xem
// applyPromotionCounter ở canister/VPS, áp dụng tự động chỉ theo giờ).
// discountAmount hiển thị ở đây là ƯỚC TÍNH client-side (tìm tier cao nhất
// mà itemsTotal đạt) — số tiền THẬT do canister applyPromotionCounter
// quyết định lúc tạo đơn (VPS), có thể khác nếu giới hạn tổng đơn/ngày đã
// đầy giữa lúc ước tính và lúc tạo đơn thật.
//
// cusName/cusPhone: VPS routes/create.js BẮT BUỘC 2 trường này không rỗng
// (từ chối tạo đơn nếu thiếu) — vì không còn ô nhập, dùng giá trị CỐ ĐỊNH
// (COUNTER_CUS_NAME/COUNTER_CUS_PHONE bên dưới) cho MỌI đơn tại quầy. Đây
// chỉ là dữ liệu nội bộ để hệ thống chấp nhận đơn, không ảnh hưởng gì tới
// thanh toán hay các chương trình khuyến mại (dùng email riêng, không liên
// quan tên/SĐT).

import { DeviceRole } from "@/backend";
import type { Order } from "@/backend";
import { ActivationForm } from "@/components/ActivationForm";
import { CounterQRDisplay } from "@/components/CounterQRDisplay";
import { MenuPicker } from "@/components/MenuPicker";
import { PrinterSettingsDialog } from "@/components/PrinterSettingsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeviceHeader } from "@/contexts/DeviceHeaderContext";
import { usePromotionCountdown } from "@/hooks/usePromotionCountdown";
import { useCurrentPromotion, useMenuForRestaurant } from "@/hooks/useQueries";
import { getOrder as getOrderFn, useCanister } from "@/lib/canister";
import { reconnectPrinter } from "@/lib/printer";
import { create as vpsCreate } from "@/lib/vps-client";
import type { CreateOrderPayload } from "@/types";
import { Flame, Loader2, Printer, Search, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const COUNTER_STORAGE_KEY = "bbh_counter_activation";

// Giá trị cố định cho MỌI đơn tại quầy — xem giải thích ở comment đầu file.
const COUNTER_CUS_NAME = "Khách tại quầy";
const COUNTER_CUS_PHONE = "0000000000";

function loadStoredActivation(): {
  restaurantId: string;
  deviceId: string;
  name: string;
} | null {
  try {
    const raw = localStorage.getItem(COUNTER_STORAGE_KEY);
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

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

// Banner Giờ Vàng — bản rút gọn cho quầy (không có phần xác thực email,
// khác PromotionBanner.tsx dùng ở trang đặt online). Thu gọn còn 1 DÒNG
// khi đang active (tên chương trình + các mức giảm + đếm ngược trên
// cùng 1 hàng) — nhường thêm không gian dọc cho lưới món, giảm cuộn.
// Giữ dạng đầy đủ (2 dòng) khi "sắp tới" (chưa active) — ít xảy ra hơn,
// không cần thu gọn.
function CounterGoldenHourBanner() {
  const { data: promotion } = useCurrentPromotion();
  // Chỉ áp dụng cho kênh tại quầy — chương trình có thể đang active nhưng
  // bị tắt riêng cho kênh này (enabledCounter=false, đặt từ xa vẫn dùng
  // được) — truyền null để usePromotionCountdown tự trả về "hidden".
  const countdown = usePromotionCountdown(
    promotion?.enabledCounter ? promotion : null,
  );

  if (countdown.kind === "hidden" || !promotion) {
    return null;
  }

  const sortedTiers = [...promotion.tiers].sort(
    (a, b) => Number(a.minOrderValue) - Number(b.minOrderValue),
  );
  const isActive = countdown.kind === "active";

  if (isActive) {
    return (
      <div
        className="mb-3 flex items-center gap-3 overflow-x-auto rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 to-warning/10 px-4 py-2.5"
        data-ocid="counter.golden_hour_banner"
      >
        <Flame className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="shrink-0 whitespace-nowrap font-display text-sm font-bold text-primary">
          Đang trong Giờ Vàng!
        </span>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {sortedTiers
            .map(
              (t) =>
                `Từ ${formatVnd(Number(t.minOrderValue))} giảm ${formatVnd(Number(t.discountAmount))}`,
            )
            .join(" · ")}
        </span>
        <span className="ml-auto shrink-0 whitespace-nowrap rounded-lg bg-primary px-3 py-1 font-display text-sm font-bold text-white">
          {countdown.formatted}
        </span>
      </div>
    );
  }

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 to-warning/10 px-5 py-3.5"
      data-ocid="counter.golden_hour_banner"
    >
      <div className="flex items-center gap-3">
        <Flame className="h-7 w-7 text-primary" aria-hidden="true" />
        <div>
          <p className="font-display text-base font-bold text-primary">
            Sắp tới Giờ Vàng
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {sortedTiers.map((t) => (
              <span
                key={t.minOrderValue.toString()}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold"
              >
                Từ {formatVnd(Number(t.minOrderValue))} giảm{" "}
                {formatVnd(Number(t.discountAmount))}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center rounded-xl bg-warning px-4 py-2 text-white">
        <span className="text-[10px] uppercase tracking-wide opacity-85">
          Bắt đầu sau
        </span>
        <span className="font-display text-lg font-bold">
          {countdown.formatted}
        </span>
      </div>
    </div>
  );
}

export default function CounterOrder() {
  const stored = loadStoredActivation();
  const [restaurantId, setRestaurantId] = useState<string | null>(
    stored?.restaurantId ?? null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(
    stored?.deviceId ?? null,
  );
  const [deviceName, setDeviceName] = useState<string>(stored?.name ?? "");

  const { actor } = useCanister();
  const { setDeviceHeader } = useDeviceHeader();

  // Đẩy tên/mã thiết bị lên header dùng chung (Layout.tsx) — thay cho
  // logo/tiêu đề/nút Menu, vì trang này chỉ dành cho nhân viên thao tác
  // tại 1 thiết bị cố định. Dọn lại (null) khi rời trang.
  useEffect(() => {
    if (deviceId) {
      setDeviceHeader({
        name: deviceName,
        id: deviceId,
        pageTitle: "Đặt món tại quầy",
      });
    }
    return () => setDeviceHeader(null);
  }, [deviceId, deviceName, setDeviceHeader]);
  const { data: menu, isLoading: menuLoading } = useMenuForRestaurant(
    restaurantId ?? undefined,
  );
  const { data: promotion } = useCurrentPromotion();
  // Chỉ áp dụng cho kênh tại quầy — cùng lý do như CounterGoldenHourBanner
  // ở trên (enabledCounter=false thì countdown luôn "hidden", nên
  // estimatedDiscount bên dưới tự động không ước tính gì).
  const countdown = usePromotionCountdown(
    promotion?.enabledCounter ? promotion : null,
  );
  const [cart, setCart] = useState<Record<string, number>>({});
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Tự động kết nối lại máy in đã ghép nối từ trước (không hiện hộp
  // thoại chọn thiết bị) — nhân viên chỉ cần bấm "Kết nối máy in" 1 lần
  // duy nhất (PrinterSettingsDialog), các lần vào trang sau tự nối lại.
  useEffect(() => {
    void reconnectPrinter();
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  function handleActivated(restId: string, devId: string, name: string) {
    setRestaurantId(restId);
    setDeviceId(devId);
    setDeviceName(name);
    try {
      localStorage.setItem(
        COUNTER_STORAGE_KEY,
        JSON.stringify({ restaurantId: restId, deviceId: devId, name }),
      );
    } catch {
      // localStorage không khả dụng — vẫn hoạt động trong phiên hiện tại.
    }
    toast.success("Thiết bị quầy đã sẵn sàng nhận đơn");
  }

  // Món "Dụng cụ đựng đồ ăn" — KHÁC CreateOrder.tsx (đặt online, vẫn tự
  // động tính theo số lượng món chính): tại quầy, món này LUÔN hiện sẵn
  // trong giỏ hàng (kể cả số lượng = 0, khác mọi món khác chỉ hiện khi
  // > 0), có nút +/- bình thường, và số lượng KHÔNG còn phụ thuộc vào
  // món chính — nhân viên tự quyết định (theo yêu cầu đã xác nhận).
  const utensilItem = useMemo(
    () =>
      menu?.find(
        (m) => m.category === "Khác" && m.name === "Dụng cụ đựng đồ ăn",
      ),
    [menu],
  );

  const cartLines = useMemo(() => {
    if (!menu) return [];
    return menu
      .filter(
        (m) => (cart[m.itemId] ?? 0) > 0 || m.itemId === utensilItem?.itemId,
      )
      .map((m) => ({ item: m, quantity: cart[m.itemId] ?? 0 }));
  }, [menu, cart, utensilItem]);

  const mainDishLines = useMemo(
    () => cartLines.filter((l) => l.item.category === "Món chính"),
    [cartLines],
  );

  const displayCartLines = cartLines;

  const itemsTotal = useMemo(
    () =>
      displayCartLines.reduce(
        (sum, l) => sum + Number(l.item.price) * l.quantity,
        0,
      ),
    [displayCartLines],
  );

  const itemCount = useMemo(
    () => displayCartLines.reduce((sum, l) => sum + l.quantity, 0),
    [displayCartLines],
  );

  // Ước tính giảm giá Giờ Vàng (client-side, chỉ để HIỂN THỊ THAM KHẢO
  // trước khi đặt đơn) — tìm mức (tier) cao nhất mà itemsTotal đạt được.
  // Số tiền THẬT do canister applyPromotionCounter quyết định lúc tạo đơn.
  // enabledCounter=false -> không ước tính gì (tránh hiện giảm giá cho
  // nhân viên/khách nhưng thực tế không được áp dụng khi tạo đơn thật).
  const estimatedDiscount = useMemo(() => {
    if (countdown.kind !== "active" || !promotion || itemsTotal <= 0) {
      return 0;
    }
    const eligible = promotion.tiers.filter(
      (t) => itemsTotal >= Number(t.minOrderValue),
    );
    if (eligible.length === 0) return 0;
    return Math.max(...eligible.map((t) => Number(t.discountAmount)));
  }, [countdown.kind, promotion, itemsTotal]);

  function handleQuantityChange(itemId: string, delta: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[itemId];
      else copy[itemId] = next;
      return copy;
    });
  }

  async function handleSubmit() {
    if (mainDishLines.length === 0) {
      toast.error("Vui lòng chọn ít nhất một món chính.");
      return;
    }
    if (!restaurantId || !actor) return;

    setSubmitting(true);
    try {
      const payload: CreateOrderPayload = {
        restaurantId,
        pickupAddress: "",
        cusName: COUNTER_CUS_NAME,
        cusPhone: COUNTER_CUS_PHONE,
        cusAddress: "",
        cusTaxCode: "",
        receiverEmail: "",
        items: displayCartLines.map((l) => ({
          itemId: l.item.itemId,
          name: l.item.name,
          quantity: l.quantity,
          price: Number(l.item.price),
          vatRate: Number(l.item.vatRate),
          unitName: l.item.unitName,
        })),
        shippingFee: 0,
        ahamoveOrderId: "",
        isCounterOrder: true,
      };
      const res = await vpsCreate(payload);
      if (!res.ok) {
        throw new Error(res.error ?? "VPS từ chối tạo đơn.");
      }
      // Lấy đầy đủ Order từ canister để CounterQRDisplay có amount/paymentStatus.
      const order = await getOrderFn(actor, res.orderId);
      setActiveOrder(order);
      toast.success("Đặt đơn thành công!", {
        description: `Mã đơn: ${res.orderId}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đặt đơn thất bại.";
      toast.error("Đặt đơn thất bại", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCloseQr() {
    setActiveOrder(null);
  }

  function handlePaid(order: Order) {
    setActiveOrder(null);
    toast.success(`Đã thanh toán đơn ${order.orderId}`);
    // Reset để nhân viên đặt đơn tiếp theo.
    setCart({});
  }

  if (!restaurantId || !deviceId) {
    return (
      <ActivationForm
        onActivated={handleActivated}
        expectedRole={DeviceRole.cashier}
        expectedRoleLabel="thu ngân / quầy"
      />
    );
  }

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] flex-col"
      data-ocid="counter.page"
    >
      <div className="flex-1 px-4 py-5 md:px-6 xl:px-8">
        <div className="mb-3 flex items-center gap-3">
          <div className="relative max-w-[340px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm món ăn…"
              aria-label="Tìm món ăn"
              data-ocid="counter.search_input"
              className="h-10 rounded-full pl-9"
            />
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setPrinterDialogOpen(true)}
            data-ocid="counter.open_printer_settings_button"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-smooth hover:bg-secondary"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Máy in
          </button>
        </div>

        <CounterGoldenHourBanner />

        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <MenuPicker
              menu={menu}
              isLoading={menuLoading}
              cart={cart}
              onQuantityChange={handleQuantityChange}
              disabled={submitting}
              groupByCategory
              gridColsClassName="grid-cols-5"
              externalQuery={searchQuery}
              onExternalQueryChange={setSearchQuery}
            />
          </div>

          <div
            className="sticky top-4 hidden w-[340px] shrink-0 lg:block"
            data-ocid="counter.cart_panel"
          >
            <div className="rounded-2xl border border-border bg-card p-4 shadow-lg">
              <p className="mb-2 flex items-center gap-2 font-display text-base font-bold">
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                Giỏ hàng — {itemCount} món
              </p>

              {/* Không còn trạng thái "Chưa chọn món nào" ẩn hẳn danh sách
                  — "Dụng cụ đựng đồ ăn" LUÔN hiện sẵn (kể cả số lượng 0)
                  để nhân viên có thể +/- ngay từ đầu, không phụ thuộc món
                  chính đã chọn hay chưa (theo yêu cầu đã xác nhận). */}
              <div data-ocid="counter.cart_lines">
                {displayCartLines.map((l) => {
                  return (
                    <div
                      key={l.item.itemId}
                      className="flex items-center justify-between gap-2 border-b border-border py-2.5 text-sm last:border-none"
                      data-ocid={`counter.cart_line.${l.item.itemId}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{l.item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatVnd(Number(l.item.price))}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleQuantityChange(l.item.itemId, -1)
                          }
                          disabled={submitting}
                          aria-label={`Giảm số lượng ${l.item.name}`}
                          data-ocid={`counter.cart_decrement.${l.item.itemId}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm font-bold transition-smooth hover:bg-secondary disabled:opacity-50"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-bold">
                          {l.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(l.item.itemId, 1)}
                          disabled={submitting}
                          aria-label={`Tăng số lượng ${l.item.name}`}
                          data-ocid={`counter.cart_increment.${l.item.itemId}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm font-bold transition-smooth hover:bg-secondary disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>
                      <p className="w-20 shrink-0 text-right font-bold">
                        {formatVnd(Number(l.item.price) * l.quantity)}
                      </p>
                    </div>
                  );
                })}
              </div>

              {estimatedDiscount > 0 && (
                <div className="my-2.5 flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-2 text-xs font-semibold text-primary">
                  <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                  Đơn này đủ điều kiện Giờ Vàng — giảm{" "}
                  {formatVnd(estimatedDiscount)}
                </div>
              )}

              <div className="mt-2 flex items-baseline justify-between border-t-2 border-border pt-2.5">
                <span className="text-xs text-muted-foreground">Tổng cộng</span>
                <span className="font-display text-2xl font-bold">
                  {formatVnd(itemsTotal - estimatedDiscount)}
                </span>
              </div>
              {estimatedDiscount > 0 && (
                <div className="mt-1 flex justify-between text-xs text-success">
                  <span>Đã giảm Giờ Vàng</span>
                  <span>−{formatVnd(estimatedDiscount)}</span>
                </div>
              )}

              <Button
                size="lg"
                className="mt-3.5 w-full"
                onClick={handleSubmit}
                disabled={submitting || mainDishLines.length === 0}
                data-ocid="counter.submit_button"
              >
                {submitting ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Đang đặt đơn…
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                    Đặt đơn · {formatVnd(itemsTotal - estimatedDiscount)}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Thanh dưới cùng cho màn hình nhỏ (< lg) — cột giỏ hàng ẩn ở trên
            không hiện được (không đủ chỗ cho bố cục 2 cột). */}
        <div className="sticky bottom-0 -mx-4 mt-4 border-t border-border bg-card px-4 py-3 md:-mx-6 md:px-6 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{itemCount} món</p>
              <p className="font-display text-2xl font-bold text-foreground">
                {formatVnd(itemsTotal - estimatedDiscount)}
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={submitting || mainDishLines.length === 0}
              data-ocid="counter.submit_button_mobile"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              )}
              Đặt đơn · {formatVnd(itemsTotal - estimatedDiscount)}
            </Button>
          </div>
        </div>
      </div>

      {activeOrder && (
        <CounterQRDisplay
          order={activeOrder}
          deviceId={deviceId ?? ""}
          onClose={handleCloseQr}
          onPaid={handlePaid}
        />
      )}

      <PrinterSettingsDialog
        open={printerDialogOpen}
        onOpenChange={setPrinterDialogOpen}
      />
    </div>
  );
}

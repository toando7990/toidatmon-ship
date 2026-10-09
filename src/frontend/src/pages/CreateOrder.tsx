// CreateOrder page — Đặt hàng.
// Flow: chọn địa chỉ nhận hàng (BẮT BUỘC, từ danh sách đã lưu — xem
//       DeliveryAddressSelector.tsx) → app tự chọn nhà hàng gần nhất
//       (lib/geo.ts) → chọn món (MenuPicker) → hồ sơ khách hàng (tự điền
//       từ "Thông tin của bạn", xem Profile.tsx — không nhập lại trong giỏ)
//       → đặt đơn (VPS /order/create).
// Theme: bọc trong .bbh-order-theme (sơn mài đỏ / vàng hoàng cung, xem index.css).
// UI tiếng Việt. Mobile-first.
//
// TÁI CẤU TRÚC (Phần 3/6): trước đây khách tự chọn nhà hàng (dropdown) và
// tự đặt tài xế bằng app ngoài (không qua hệ thống này) nên KHÔNG cần
// nhập địa chỉ giao hàng/tính phí ship. Giờ app tự động đặt tài xế
// (Lalamove — Phần 4-6), cần địa chỉ nhận hàng THẬT của khách để tính
// khoảng cách/phí ship/thời gian giao — BẮT BUỘC chọn 1 địa chỉ đã lưu
// trước khi đặt món. Tổng tiền hiển thị = giá hàng (đã gồm VAT) + phí
// ship (Phần 4, hiện chưa tính — chỉ hiện giá hàng).
//
// Chỉ tạo đơn qua POST /order/create (VPS worker) — KHÔNG tạo QR tại thời điểm
// đặt đơn. QR thanh toán được tạo theo yêu cầu ở trang theo dõi đơn
// (POST /order/:id/qr). Sau khi tạo đơn thành công, chuyển khách sang
// "Theo dõi đơn" (/track/$orderId).

import type { CustomerFormValues } from "@/components/CustomerForm";
import { DeliveryAddressSelector } from "@/components/DeliveryAddressSelector";
import { MenuPicker } from "@/components/MenuPicker";
import { NearestRestaurantDisplay } from "@/components/NearestRestaurantDisplay";
import { PromoMarquee } from "@/components/PromoMarquee";
import { PromotionBanner } from "@/components/PromotionBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCartDiscounts } from "@/hooks/useCartDiscounts";
import { useOpenCountdown } from "@/hooks/useOpenCountdown";
import {
  useGetStoreHours,
  useIsStoreOpen,
  useItemImage,
  useMenus,
  useRestaurantStatusMap,
  useRestaurants,
  useSoldOutToday,
  useTenantId,
} from "@/hooks/useQueries";
import { useTenant } from "@/hooks/useTenant";
import { findNearest } from "@/lib/geo";
import { getOrCreateGuestEmail } from "@/lib/guest-identity";
import { recordMyOrder } from "@/lib/my-orders";
import { takeCartHandoff } from "@/lib/platform-feed";
import { statusText } from "@/lib/restaurant-ops";
import { imageBytesToDataUrl } from "@/lib/utils";
import { getVerifiedEmail } from "@/lib/verification-storage";
import {
  create as vpsCreate,
  getCustomer as vpsGetCustomer,
  quote as vpsQuote,
} from "@/lib/vps-client";
import type {
  CreateOrderPayload,
  CustomerAddress,
  MenuItem,
  Restaurant,
} from "@/types";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Clock,
  Loader2,
  Receipt,
  ShoppingCart,
  Sparkles,
  User,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

// "YYYYMMDD" -> "DD/MM/YYYY", dùng để hiện hạn dùng phiếu giảm giá.
function formatVoucherDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

const EMPTY_CUSTOMER: CustomerFormValues = {
  cusName: "",
  cusPhone: "",
  cusAddress: "",
  cusTaxCode: "",
  receiverEmail: "",
};

// Ảnh thu nhỏ cho từng dòng trong giỏ hàng — giúp khách nhận diện món nhanh
// hơn khi xem lại giỏ trước khi đặt. Món dụng cụ (không có ảnh) hiện icon mặc định.
// Ảnh lấy RIÊNG qua getItemImage(itemId) — item.image từ danh sách menu luôn
// rỗng (tránh vượt giới hạn kích thước phản hồi IC 3MB).
function CartLineThumbnail({ item }: { item: MenuItem }) {
  const { data: imageBytes } = useItemImage(item.itemId);
  const imageUrl = useMemo(() => imageBytesToDataUrl(imageBytes), [imageBytes]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export default function CreateOrder() {
  const navigate = useNavigate();
  // Partner hiện tại — gửi kèm mọi lời gọi VPS (quote/create) để đơn được
  // gắn đúng đối tác phía VPS (xem lib/vps-client.ts).
  const tenantId = useTenantId();
  const { data: restaurants, isLoading: restaurantsLoading } = useRestaurants();
  // Chỉ hiện nhà hàng ĐANG BẬT hiển thị (admin tự ẩn/hiện ở
  // /admin/restaurants) trong dropdown chọn nhà hàng — PHÁT HIỆN khi điều
  // tra báo lỗi "bật/tắt hiển thị không có tác dụng": trước đây dropdown
  // này truyền THẲNG mảng restaurants chưa lọc, khiến nút ẩn/hiện của
  // admin hoàn toàn không có tác dụng gì với khách hàng (dù đã ẩn, khách
  // vẫn chọn được và đặt đơn bình thường). Vẫn giữ `restaurants` (chưa
  // lọc) cho selectedRestaurant bên dưới — để nếu khách ĐÃ chọn 1 nhà
  // hàng trước khi nó bị ẩn, chi tiết vẫn tra cứu được bình thường, không
  // vỡ giao diện.
  const visibleRestaurants = (restaurants ?? []).filter((r) => r.visible);
  // A1: trạng thái mở/đóng cửa hàng (toàn cục). data===false → cửa hàng đang
  // đóng → chặn đặt đơn và hiện màn hình chờ thay vì cho phép chọn món.
  const { data: storeOpen } = useIsStoreOpen();
  const storeClosed = storeOpen === false;
  const { data: storeHours } = useGetStoreHours();
  const openHourNum = storeHours ? Number(storeHours.openHour) : undefined;
  const openMinuteNum = storeHours ? Number(storeHours.openMinute) : undefined;
  const { formatted: countdownText } = useOpenCountdown(
    storeClosed ? openHourNum : undefined,
    storeClosed ? openMinuteNum : undefined,
  );

  const [restaurantId, setRestaurantId] = useState<string>("");
  // Địa chỉ nhận hàng khách đã chọn (BẮT BUỘC — Phần 3/6 tái cấu trúc đặt
  // món từ xa) — quyết định nhà hàng gần nhất VÀ được dùng làm cusAddress
  // khi submit thay vì khách gõ tay như trước.
  const [verifiedEmail] = useState<string | null>(() => {
    const v = getVerifiedEmail();
    return v ? v.email : null;
  });
  // Email "ngầm định" riêng cho trình duyệt này — dùng khi khách CHƯA xác
  // thực email thật, để vẫn có 1 định danh ổn định cho hồ sơ + khuyến mại
  // (xem lib/guest-identity.ts). Khách KHÔNG bao giờ thấy/nhập email này.
  const [guestEmail] = useState<string>(() => getOrCreateGuestEmail());
  // Email dùng để gửi lên VPS (receiverEmail, KM, hồ sơ) — ưu tiên email
  // thật đã xác thực, không thì dùng email ngầm định. LUÔN có giá trị,
  // khách không còn bị chặn đặt đơn vì "chưa có email" nữa.
  const identityEmail = verifiedEmail ?? guestEmail;
  const [selectedAddress, setSelectedAddress] =
    useState<CustomerAddress | null>(null);
  // Nhà hàng yêu thích của khách (Profile.tsx) — "" nếu chưa chọn. Ưu
  // tiên chọn nhà hàng này khi đặt món từ xa, thay cho tự động chọn gần
  // nhất — chỉ áp dụng nếu nhà hàng đó vẫn đang hiển thị (visible=true),
  // xem logic selectedRestaurant bên dưới.
  const [favoriteRestaurantId, setFavoriteRestaurantId] = useState("");
  // Menu dùng chung cho toàn bộ chuỗi nhà hàng — hiện ngay từ đầu, không phụ thuộc
  // vào việc đã chọn nhà hàng hay chưa. Chỉ chặn ở bước THÊM MÓN (xem handleQuantityChange).
  const { data: menuAll, isLoading: menuLoading } = useMenus();
  // Ẩn món chủ quán/nhân viên báo "Hết hôm nay" (trang /quan-ly).
  const { data: soldOutToday } = useSoldOutToday(restaurantId);
  const menu = useMemo(() => {
    if (!menuAll || !soldOutToday?.length) return menuAll;
    const sold = new Set(soldOutToday);
    return menuAll.filter((m) => !sold.has(m.itemId));
  }, [menuAll, soldOutToday]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState<CustomerFormValues>(EMPTY_CUSTOMER);
  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Giỏ chuyển từ trang chủ nhiều quán (PlatformHome) sang quán này: nạp
  // một lần khi đã có thực đơn, chỉ giữ món còn bán, rồi mở giỏ để thanh toán.
  const currentTenant = useTenant().tenant;
  const tenantSlug = currentTenant?.slug ?? "";
  const handoffDone = useRef(false);
  useEffect(() => {
    if (handoffDone.current || !tenantSlug || !menu || menu.length === 0)
      return;
    handoffDone.current = true;
    const items = takeCartHandoff(tenantSlug);
    if (!items) return;
    const next: Record<string, number> = {};
    for (const [id, qty] of Object.entries(items)) {
      if (qty > 0 && menu.some((m) => m.itemId === id && m.visible))
        next[id] = qty;
    }
    if (Object.keys(next).length === 0) return;
    setCart(next);
    setCartOpen(true);
    toast.success("Đã chuyển giỏ hàng — chọn địa chỉ nhận rồi đặt món.");
  }, [tenantSlug, menu]);

  // Gợi ý gọi thêm — hiện 1 lần khi khách thêm món đầu tiên vào giỏ.
  const [upsellItems, setUpsellItems] = useState<MenuItem[]>([]);

  const selectedRestaurant: Restaurant | undefined = restaurants?.find(
    (r) => r.restaurantId === restaurantId,
  );

  const cartLines = useMemo(() => {
    if (!menu) return [];
    return menu
      .filter((m) => (cart[m.itemId] ?? 0) > 0)
      .map((m) => ({ item: m, quantity: cart[m.itemId] }));
  }, [menu, cart]);

  // A1: Món dụng cụ 'Dụng cụ đựng đồ ăn' (danh mục 'Khác') là món thật trong
  // menu, được thêm tự động vào giỏ như món hàng bình thường (KHÔNG gọi là phí).
  // Đây là trạng thái DERIVED — tính lại mỗi khi giỏ thay đổi, không persist riêng.
  //   - mainDishLines: các dòng món chính (category === 'Món chính').
  //   - utensilQty = tổng số lượng món chính trong giỏ.
  //   - utensilLine: nếu món dụng cụ tồn tại trong menu VÀ utensilQty > 0 thì thêm
  //     như một dòng bình thường { item, quantity: utensilQty }.
  // Khi xoá hết món chính → utensilQty = 0 → dòng dụng cụ tự biến mất.
  // Khi giảm số lượng món chính → utensilQty giảm theo.
  const mainDishLines = useMemo(
    () => cartLines.filter((l) => l.item.category === "Món chính"),
    [cartLines],
  );

  const utensilItem = useMemo(
    () =>
      menu?.find(
        (m) => m.category === "Khác" && m.name === "Dụng cụ đựng đồ ăn",
      ),
    [menu],
  );

  const utensilQty = useMemo(
    () => mainDishLines.reduce((sum, l) => sum + l.quantity, 0),
    [mainDishLines],
  );

  const utensilLine = useMemo(() => {
    if (!utensilItem || utensilQty <= 0) return null;
    return { item: utensilItem, quantity: utensilQty };
  }, [utensilItem, utensilQty]);

  // Các dòng hiển thị trong giỏ (và gửi lên VPS): món đã chọn + dòng dụng cụ.
  const displayCartLines = useMemo(() => {
    if (!utensilLine) return cartLines;
    return [...cartLines, utensilLine];
  }, [cartLines, utensilLine]);

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

  // Hồ sơ khách hàng (Họ tên + SĐT) — email KHÔNG còn là điều kiện ở đây
  // nữa (identityEmail luôn có sẵn, xác thực hay chưa), khách mới chỉ cần
  // điền Họ tên + SĐT ngay trong giỏ hàng (không cần rời trang), khách đã
  // xác thực vẫn dùng hồ sơ đã lưu ở "Thông tin của bạn" (/profile) như cũ.
  const profileComplete = Boolean(
    customer.cusName.trim() && customer.cusPhone.trim(),
  );
  // useCallback: giữ tham chiếu hàm ổn định giữa các lần render để MenuPicker/
  // MenuCard (React.memo) không phải re-render toàn bộ danh sách món mỗi khi
  // component cha render lại (ví dụ khi gõ vào ô thông tin khách hàng).
  const handleQuantityChange = useCallback(
    (itemId: string, delta: number) => {
      // Chưa chọn nhà hàng → chặn thêm món, nhắc khách chọn nhà hàng trước (bước 1).
      if (delta > 0 && !restaurantId) {
        toast.error("Vui lòng chọn nhà hàng trước khi thêm món.");
        document
          .querySelector('[data-ocid="create_order.restaurant_card"]')
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      const prevQty = cart[itemId] ?? 0;

      setCart((prev) => {
        const next = Math.max(0, (prev[itemId] ?? 0) + delta);
        const copy = { ...prev };
        if (next === 0) delete copy[itemId];
        else copy[itemId] = next;
        return copy;
      });

      // Mỗi lần thêm MÓN CHÍNH mới (chưa có trong giỏ trước đó) → gợi ý món phụ.
      // Lặp lại cho từng món chính khác nhau, không giới hạn 1 lần/phiên.
      if (delta > 0 && prevQty === 0 && menu) {
        const addedItem = menu.find((m) => m.itemId === itemId);
        if (addedItem?.category === "Món chính") {
          const suggestions = menu
            .filter(
              (m) =>
                m.visible &&
                m.category === "Món phụ" &&
                (cart[m.itemId] ?? 0) === 0,
            )
            .slice(0, 5);
          if (suggestions.length > 0) {
            setUpsellItems(suggestions);
          }
        }
      }
    },
    [restaurantId, cart, menu],
  );

  // Tự động điền thông tin khách từ identityEmail (email đã xác thực HOẶC
  // email ngầm định của khách mới — luôn có giá trị). Gọi VPS GET
  // /customers/:email để lấy tên + số điện thoại đã lưu từ lần đặt trước
  // (nếu có) và điền vào form — áp dụng cho CẢ khách mới lẫn khách đã xác
  // thực, giúp lần đặt tiếp theo nhanh hơn dù chưa từng xác thực email.
  useEffect(() => {
    let cancelled = false;

    setCustomer((prev) => ({
      ...prev,
      receiverEmail: identityEmail,
    }));

    vpsGetCustomer(identityEmail)
      .then((customer) => {
        if (cancelled || !customer) return;
        setCustomer((prev) => ({
          ...prev,
          cusName: customer.name || prev.cusName,
          cusPhone: customer.phone || prev.cusPhone,
        }));
        setFavoriteRestaurantId(customer.favoriteRestaurantId || "");
      })
      .catch(() => {
        // Không tìm thấy khách (404) hoặc lỗi mạng — bỏ qua, khách tự nhập.
      });

    return () => {
      cancelled = true;
    };
  }, [identityEmail]);

  // App tự chọn nhà hàng gần nhất theo địa chỉ nhận hàng khách đã chọn —
  // khách KHÔNG còn tự chọn nhà hàng (bỏ handleRestaurantChange cũ, vốn
  // chỉ dùng khi RestaurantSelect còn là dropdown cho khách chọn tay).
  // Giai đoạn 3: bỏ qua nhà hàng đang tạm nghỉ / ngoài giờ khi tự chọn.
  const { data: statusMap } = useRestaurantStatusMap();
  const acceptsOrders = (r: Restaurant) => {
    const st = statusMap?.get(r.restaurantId);
    return !st || st.state === "open";
  };
  const openRestaurants = visibleRestaurants.filter(acceptsOrders);
  const nearestRestaurant = selectedAddress
    ? findNearest(openRestaurants, selectedAddress.lat, selectedAddress.lng)
    : null;
  const nearestAny = selectedAddress
    ? findNearest(visibleRestaurants, selectedAddress.lat, selectedAddress.lng)
    : null;
  // Nhà hàng yêu thích ƯU TIÊN hơn nhà hàng gần nhất — chỉ áp dụng khi
  // nhà hàng đó vẫn đang hiển thị (không bị ẩn/xoá sau khi khách chọn
  // làm yêu thích). Không hợp lệ (đã ẩn, hoặc chưa chọn) → dùng lại nhà
  // hàng gần nhất như hành vi cũ.
  const favoriteAny = favoriteRestaurantId
    ? (visibleRestaurants.find(
        (r) => r.restaurantId === favoriteRestaurantId,
      ) ?? null)
    : null;
  const favoriteRestaurant =
    favoriteAny && acceptsOrders(favoriteAny) ? favoriteAny : null;
  // Nhà hàng khách thường đặt (yêu thích / gần nhất) đang không nhận đơn.
  const skipped =
    favoriteAny && !favoriteRestaurant
      ? favoriteAny
      : !favoriteAny && nearestAny && !acceptsOrders(nearestAny)
        ? nearestAny
        : null;
  const closedNotice = skipped
    ? `${skipped.name}: ${statusText(statusMap?.get(skipped.restaurantId)).toLowerCase()}${
        nearestRestaurant ? " — đơn này do nhà hàng đang mở gần nhất làm" : ""
      }`
    : null;
  const orderRestaurant = favoriteRestaurant ?? nearestRestaurant;
  // Nhà hàng gần nhất khác nhà hàng yêu thích đang chọn — hiển thị gợi ý
  // đổi cho khách biết có lựa chọn khác gần hơn (không tự động đổi).
  const nearestIsDifferentFromFavorite =
    !!favoriteRestaurant &&
    !!nearestRestaurant &&
    nearestRestaurant.restaurantId !== favoriteRestaurant.restaurantId;

  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ cần chạy lại khi id nhà hàng đã chọn đổi, không cần theo dõi cả object
  useEffect(() => {
    if (orderRestaurant && orderRestaurant.restaurantId !== restaurantId) {
      setRestaurantId(orderRestaurant.restaurantId);
      // Đổi nhà hàng (VD khách đổi địa chỉ sang khu vực khác) → xoá giỏ
      // hàng cũ, cùng hành vi đã có khi khách tự đổi nhà hàng trước đây.
      setCart({});
      setUpsellItems([]);
    }
  }, [orderRestaurant?.restaurantId]);

  // Phí ship + thời gian giao dự kiến — gọi Lalamove "Get Quotation" qua
  // VPS (POST /quote). CHỈ gọi khi đổi nhà hàng/địa chỉ (Kế hoạch A) —
  // KHÔNG gọi lại khi khách chỉ thêm/bớt món, vì phí ship/thời gian giao
  // chỉ phụ thuộc khoảng cách 2 điểm, không phụ thuộc số món trong giỏ.
  // Dùng hasItems (boolean) làm dependency thay vì cả mảng displayCartLines
  // — mảng đổi reference mỗi lần đổi SỐ LƯỢNG món (dù restaurantId/địa chỉ
  // không đổi), còn boolean chỉ đổi giá trị khi giỏ hàng chuyển trạng thái
  // rỗng ⇄ có món — đúng ý "tính ngay khi có địa chỉ + nhà hàng hợp lệ lần
  // đầu, và tính lại khi có thay đổi địa chỉ + nhà hàng hợp lệ lần sau".
  const [shipQuote, setShipQuote] = useState<{
    shippingFee: number;
    estimatedDeliveryMinutes: number;
    lalamoveQuotationId: string;
    lalamovePickupStopId: string;
    lalamoveDropStopId: string;
  } | null>(null);
  const [shipQuoteLoading, setShipQuoteLoading] = useState(false);
  // Đọc giỏ hàng MỚI NHẤT tại thời điểm gọi quote, không làm effect chạy
  // lại mỗi khi giỏ hàng đổi (xem giải thích ở trên).
  const displayCartLinesRef = useRef(displayCartLines);
  useEffect(() => {
    displayCartLinesRef.current = displayCartLines;
  }, [displayCartLines]);
  const hasItemsInCart = displayCartLines.length > 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: orderRestaurant là object mới mỗi lần render — chỉ cần theo dõi id/address cụ thể + hasItemsInCart (boolean) ở dependency list bên dưới
  useEffect(() => {
    if (!orderRestaurant || !selectedAddress || !hasItemsInCart) {
      // Giỏ hàng tạm thời rỗng (khách vừa xoá hết món) mà nhà hàng/địa chỉ
      // không đổi — giữ nguyên kết quả cũ thay vì xoá, đỡ phải tính lại
      // ngay khi khách thêm món trở lại (vẫn cùng 2 điểm, số vẫn đúng).
      if (!orderRestaurant || !selectedAddress) setShipQuote(null);
      return;
    }
    let cancelled = false;
    setShipQuoteLoading(true);
    const timer = setTimeout(() => {
      vpsQuote(
        {
          restaurantId: orderRestaurant.restaurantId,
          pickupAddress: orderRestaurant.address,
          dropAddress: selectedAddress.address,
          dropLat: selectedAddress.lat,
          dropLng: selectedAddress.lng,
          items: displayCartLinesRef.current.map((l) => ({
            itemId: l.item.itemId,
            name: l.item.name,
            quantity: l.quantity,
          })),
        },
        tenantId,
      )
        .then((res) => {
          if (cancelled) return;
          setShipQuote({
            shippingFee: res.shippingFee,
            estimatedDeliveryMinutes: res.estimatedDeliveryMinutes,
            lalamoveQuotationId: res.ahamoveOrderId,
            lalamovePickupStopId: res.lalamovePickupStopId,
            lalamoveDropStopId: res.lalamoveDropStopId,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn("Không lấy được báo giá vận chuyển:", err);
          setShipQuote(null);
        })
        .finally(() => {
          if (!cancelled) setShipQuoteLoading(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    orderRestaurant?.restaurantId,
    orderRestaurant?.address,
    selectedAddress,
    hasItemsInCart,
    tenantId,
  ]);

  async function handleSubmit() {
    if (storeClosed) {
      toast.error("Ngoài giờ mở cửa — vui lòng quay lại sau.");
      return;
    }
    if (!profileComplete) {
      toast.error('Vui lòng hoàn thành "Thông tin của bạn" trước khi đặt đơn.');
      return;
    }
    // BẮT BUỘC chọn địa chỉ nhận hàng (Phần 3/6 tái cấu trúc đặt món từ
    // xa) — không còn cho khách gõ tay/bỏ trống như trước.
    if (!selectedAddress) {
      toast.error("Vui lòng chọn địa chỉ nhận hàng trước khi đặt đơn.");
      return;
    }
    if (!restaurantId || cartLines.length === 0) {
      toast.error("Vui lòng chọn nhà hàng và ít nhất một món.");
      return;
    }
    // A1: Đơn chỉ hợp lệ khi giỏ có ít nhất 1 món chính. Nếu không có món chính
    // (chỉ còn món dụng cụ hoặc giỏ trống) thì chặn đặt đơn với thông báo thân
    // thiện bằng tiếng Việt — không hiện mã lỗi kỹ thuật.
    if (mainDishLines.length === 0) {
      toast.error("Vui lòng chọn ít nhất một món chính để đặt đơn.");
      return;
    }

    setSubmitting(true);
    try {
      // Lấy lại báo giá Lalamove MỚI NHẤT ngay trước khi tạo đơn thật —
      // BUG THẬT NGHIÊM TRỌNG đã sửa: quotation Lalamove chỉ có hiệu lực
      // khoảng 5 phút kể từ lúc gọi. Từ Kế hoạch A (chỉ gọi /quote 1 lần
      // khi đổi địa chỉ/nhà hàng, KHÔNG gọi lại khi chọn món), nếu khách
      // dành nhiều thời gian chọn món/điền thông tin trước khi bấm đặt
      // đơn, shipQuote đang giữ có thể đã hết hạn — placeOrder() ở VPS
      // sẽ thất bại (Lalamove từ chối quotationId hết hạn), khiến tài
      // xế KHÔNG được gọi tự động dù mọi thứ khác đều đúng. Gọi lại
      // NGAY LÚC NÀY (không debounce, đồng bộ với việc tạo đơn) đảm bảo
      // quotationId luôn mới nhất có thể — nếu lần gọi lại này thất bại
      // (VD mạng lỗi tạm thời), vẫn dùng shipQuote cũ làm dự phòng thay
      // vì chặn hẳn việc đặt đơn.
      let freshShipQuote = shipQuote;
      if (orderRestaurant && selectedAddress) {
        try {
          const res = await vpsQuote(
            {
              restaurantId: orderRestaurant.restaurantId,
              pickupAddress: orderRestaurant.address,
              dropAddress: selectedAddress.address,
              dropLat: selectedAddress.lat,
              dropLng: selectedAddress.lng,
              items: displayCartLines.map((l) => ({
                itemId: l.item.itemId,
                name: l.item.name,
                quantity: l.quantity,
              })),
            },
            tenantId,
          );
          freshShipQuote = {
            shippingFee: res.shippingFee,
            estimatedDeliveryMinutes: res.estimatedDeliveryMinutes,
            lalamoveQuotationId: res.ahamoveOrderId,
            lalamovePickupStopId: res.lalamovePickupStopId,
            lalamoveDropStopId: res.lalamoveDropStopId,
          };
        } catch (err) {
          console.warn(
            "Không lấy lại được báo giá mới trước khi đặt đơn, dùng báo giá cũ:",
            err,
          );
        }
      }

      const payload: CreateOrderPayload = {
        restaurantId,
        pickupAddress: selectedRestaurant!.address,
        cusName: customer.cusName.trim(),
        cusPhone: customer.cusPhone.trim(),
        // Địa chỉ nhận hàng — từ danh sách địa chỉ đã lưu (bắt buộc chọn,
        // đã kiểm tra ở trên), KHÔNG còn gõ tay trong form như trước.
        cusAddress: selectedAddress.address,
        cusTaxCode: customer.cusTaxCode.trim(),
        receiverEmail: identityEmail,
        items: displayCartLines.map((l) => ({
          itemId: l.item.itemId,
          name: l.item.name,
          quantity: l.quantity,
          price: Number(l.item.price),
          vatRate: Number(l.item.vatRate),
          unitName: l.item.unitName,
        })),
        // Phí ship + mã báo giá Lalamove (Phần 4/6) — VPS lưu lại để
        // tham khảo/báo cáo, KHÔNG cộng vào amount (QR khách/tài xế
        // thanh toán vẫn chỉ là tiền hàng, xem routes/create.js). Có
        // thể chưa có (VD Lalamove tạm lỗi lúc đặt) — gửi 0/"" khi đó,
        // VPS tự fallback, không chặn đặt món.
        shippingFee: freshShipQuote?.shippingFee ?? 0,
        ahamoveOrderId: freshShipQuote?.lalamoveQuotationId ?? "",
        lalamovePickupStopId: freshShipQuote?.lalamovePickupStopId,
        lalamoveDropStopId: freshShipQuote?.lalamoveDropStopId,
        // Toạ độ khách — VPS đặt tài xế Lalamove/Ahamove (và đặt lại
        // bằng hãng kia nếu quá lâu chưa có tài xế).
        ...(selectedAddress
          ? { dropLat: selectedAddress.lat, dropLng: selectedAddress.lng }
          : {}),
        ...(cartDiscounts.selectedVoucherCode
          ? { voucherCode: cartDiscounts.selectedVoucherCode }
          : {}),
      };
      const res = await vpsCreate(payload, tenantId);
      if (!res.ok) {
        throw new Error(res.error ?? "VPS từ chối tạo đơn.");
      }
      // Lưu orderId vào danh sách "đơn của thiết bị này" — dùng cho trang
      // "Theo dõi đơn" (OrderList.tsx /track) chỉ hiện đúng đơn đã đặt từ trình
      // duyệt này. Áp dụng cho cả hai luồng.
      try {
        const raw = localStorage.getItem("bbh_my_orders");
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        list.push(res.orderId);
        localStorage.setItem("bbh_my_orders", JSON.stringify(list));
      } catch {
        // bỏ qua nếu localStorage không khả dụng
      }
      // Danh sách đơn dùng chung cho trang chính Tôi Đặt Món (mọi quán).
      if (currentTenant) {
        recordMyOrder({
          orderId: res.orderId,
          tenantId: currentTenant.tenantId,
          slug: currentTenant.slug,
          tenantName: currentTenant.name,
          amount: payload.items.reduce(
            (s, it) => s + it.price * it.quantity,
            0,
          ),
          createdAt: Date.now(),
        });
      }

      toast.success("Đặt đơn thành công!", {
        description: `Mã đơn: ${res.orderId}`,
      });
      setCart({});
      // Phiếu giảm giá vừa dùng (nếu có) đã bị đánh dấu "đã dùng" ở
      // canister — bỏ chọn để tránh giữ mã phiếu cũ (không còn hợp lệ) cho
      // lần đặt đơn tiếp theo. useCartDiscounts cũng tự bỏ chọn khi danh
      // sách phiếu hợp lệ tải lại và không còn thấy mã này, nhưng chủ động
      // reset ở đây cho tức thời, không cần chờ query tải lại.
      cartDiscounts.setSelectedVoucherCode(null);
      // KHÔNG reset customer về rỗng nữa — hồ sơ khách hàng (tên/SĐT/email)
      // giờ là dữ liệu bền vững từ "Thông tin của bạn" (/profile), không
      // phải form cần xoá sau mỗi lần đặt đơn. Giữ nguyên để khách đặt đơn
      // tiếp theo trong cùng phiên vẫn thấy tóm tắt hồ sơ ngay lập tức.
      setCartOpen(false);
      navigate({ to: "/track/$orderId", params: { orderId: res.orderId } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đặt đơn thất bại.";
      toast.error("Đặt đơn thất bại", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  const totalAmount = itemsTotal;
  // identityEmail luôn có giá trị (xác thực hay ngầm định) — khuyến mại Hệ
  // 1 áp dụng cho CẢ khách mới, không còn phụ thuộc profileComplete/email
  // xác thực (xem ghi chú trong applyPromotion, backend/mixins/promotion-api.mo).
  const cartDiscounts = useCartDiscounts(itemsTotal, identityEmail);

  return (
    <div className="bbh-order-theme bg-background text-foreground">
      <section
        className="mx-auto w-full max-w-2xl px-4 py-6 pb-28 md:px-6 md:py-10"
        data-ocid="create_order.page"
      >
        <header className="mb-4 flex flex-col gap-2.5">
          <PromotionBanner />
          <PromoMarquee />
        </header>

        <div className="flex flex-col gap-6">
          {/* Chọn nhà hàng + món — không còn bọc trong khung Card (đúng
              theo bản xem trước đã duyệt: bỏ viền/bóng thừa, để món nằm
              thẳng trên nền trang, hiện được nhiều món hơn). 1 đường kẻ
              mảnh phân tách nhẹ với phần trên thay cho khung card cũ.
              Hành vi giữ nguyên: menu hiện sẵn ngay từ đầu, không phụ
              thuộc đã chọn nhà hàng hay chưa — chỉ chặn ở bước THÊM MÓN
              (xem handleQuantityChange). */}
          <div data-ocid="create_order.menu_card">
            <hr className="mb-5 border-border" />
            <div
              className="mb-4 flex flex-col gap-3"
              data-ocid="create_order.restaurant_card"
            >
              <DeliveryAddressSelector
                verifiedEmail={verifiedEmail}
                guestEmail={guestEmail}
                selectedAddressId={selectedAddress?.id ?? null}
                onSelectAddress={setSelectedAddress}
              />
              <NearestRestaurantDisplay
                restaurantName={orderRestaurant?.name ?? null}
                restaurantAddress={orderRestaurant?.address ?? null}
                isLoading={restaurantsLoading}
                hasNoResult={!restaurantsLoading && !orderRestaurant}
                shippingFee={shipQuote?.shippingFee ?? null}
                estimatedDeliveryMinutes={
                  shipQuote?.estimatedDeliveryMinutes ?? null
                }
                isQuoteLoading={shipQuoteLoading}
                isFavorite={!!favoriteRestaurant}
                nearestIsDifferentFromFavorite={nearestIsDifferentFromFavorite}
                notice={closedNotice}
              />
            </div>
            <MenuPicker
              menu={menu}
              isLoading={menuLoading}
              cart={cart}
              onQuantityChange={handleQuantityChange}
              disabled={submitting}
              groupByCategory
            />
          </div>
        </div>

        {/* Gợi ý gọi thêm */}
        {upsellItems.length > 0 && (
          <div
            className="fixed inset-x-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-2xl rounded-xl border border-border bg-card p-3 shadow-elevated animate-fade-rise md:bottom-24"
            data-ocid="create_order.upsell_strip"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[oklch(var(--bbh-gold))]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Gọi thêm cho tròn vị?
              </span>
              <button
                type="button"
                aria-label="Đóng gợi ý"
                onClick={() => setUpsellItems([])}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div
              className="flex gap-2 overflow-x-auto pb-0.5"
              data-ocid="create_order.upsell_scroll"
            >
              {upsellItems.map((m) => (
                <div
                  key={m.itemId}
                  className="flex w-28 shrink-0 flex-col gap-1.5 rounded-lg bg-secondary p-2"
                >
                  <p className="line-clamp-2 text-xs font-semibold leading-snug">
                    {m.name}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-1">
                    <p className="text-[11px] text-muted-foreground">
                      {formatVnd(Number(m.price))}
                    </p>
                    <button
                      type="button"
                      aria-label={`Thêm ${m.name}`}
                      onClick={() => {
                        handleQuantityChange(m.itemId, 1);
                        setUpsellItems((prev) =>
                          prev.filter((x) => x.itemId !== m.itemId),
                        );
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Thanh giỏ hàng nổi — đẩy lên trên thanh điều hướng đáy (mobile,
            Layout.tsx) bằng bottom-[calc(...)] + env(safe-area-inset-bottom);
            desktop không có thanh điều hướng đáy nên giữ nguyên bottom-4. */}
        {itemCount > 0 && (
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-2xl items-center justify-between rounded-2xl bg-gradient-primary px-5 py-4 text-primary-foreground shadow-elevated md:bottom-4"
            data-ocid="create_order.open_cart_button"
          >
            <span className="flex flex-col items-start">
              <span className="text-xs opacity-90">{itemCount} món</span>
              <span className="font-display text-base font-bold">
                {formatVnd(totalAmount + (shipQuote?.shippingFee ?? 0))}
              </span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-sm font-semibold">
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              Xem giỏ hàng
            </span>
          </button>
        )}

        {/* Bottom sheet: giỏ hàng + thông tin khách + đặt đơn */}
        <Sheet open={cartOpen} onOpenChange={setCartOpen}>
          <SheetContent
            side="bottom"
            className="bbh-order-theme flex max-h-[92vh] flex-col overflow-y-auto rounded-t-2xl bg-background text-foreground"
            data-ocid="create_order.cart_sheet"
          >
            <SheetHeader>
              <SheetTitle className="font-display">Giỏ hàng của bạn</SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-4 pb-4">
              <ul
                className="flex flex-col gap-2"
                data-ocid="create_order.cart_lines"
              >
                {displayCartLines.map((l) => {
                  const isUtensil =
                    !!utensilLine && l.item.itemId === utensilLine.item.itemId;
                  return (
                    <li
                      key={l.item.itemId}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm"
                    >
                      <CartLineThumbnail item={l.item} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 font-medium">
                          {l.item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatVnd(Number(l.item.price))} × {l.quantity}
                        </p>
                      </div>
                      {isUtensil ? (
                        // Dòng dụng cụ là trạng thái DERIVED — số lượng tự
                        // đồng bộ theo món chính, không chỉnh sửa trực tiếp.
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Tự động
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() =>
                              handleQuantityChange(l.item.itemId, -1)
                            }
                          >
                            −
                          </Button>
                          <span className="w-6 text-center font-mono">
                            {l.quantity}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() =>
                              handleQuantityChange(l.item.itemId, 1)
                            }
                          >
                            +
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  Thông tin khách hàng
                </h3>
                {verifiedEmail ? (
                  profileComplete ? (
                    <div
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5"
                      data-ocid="create_order.profile_summary"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {customer.cusName} · {customer.cusPhone}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {customer.receiverEmail}
                        </p>
                      </div>
                      <Link
                        to="/profile"
                        className="shrink-0 text-xs font-semibold text-primary underline underline-offset-2"
                        data-ocid="create_order.profile_edit_link"
                      >
                        Sửa
                      </Link>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5"
                      data-ocid="create_order.profile_incomplete_notice"
                    >
                      <p className="text-sm text-warning">
                        Vui lòng hoàn thành "Thông tin của bạn" (họ tên, SĐT)
                        trước khi đặt đơn.
                      </p>
                      <Link
                        to="/profile"
                        className="inline-flex min-h-[36px] w-fit items-center gap-1.5 rounded-md bg-warning px-3 text-xs font-semibold text-warning-foreground transition-smooth hover:opacity-90"
                        data-ocid="create_order.profile_link"
                      >
                        <User className="h-3.5 w-3.5" aria-hidden="true" />
                        Đi tới Thông tin của bạn
                      </Link>
                    </div>
                  )
                ) : (
                  // Khách mới (chưa xác thực email) — điền ngay tại đây,
                  // KHÔNG điều hướng sang trang khác, không nhắc gì về xác
                  // thực email (chỉ có đúng 1 chỗ cho việc đó: mục "Tôi").
                  <div
                    className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
                    data-ocid="create_order.guest_profile_form"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="create-order-guest-name"
                        className="text-xs"
                      >
                        Họ tên
                      </Label>
                      <Input
                        id="create-order-guest-name"
                        value={customer.cusName}
                        onChange={(e) =>
                          setCustomer((prev) => ({
                            ...prev,
                            cusName: e.target.value,
                          }))
                        }
                        placeholder="VD: Nguyễn Văn A"
                        className="min-h-[40px]"
                        data-ocid="create_order.guest_name_input"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="create-order-guest-phone"
                        className="text-xs"
                      >
                        Số điện thoại
                      </Label>
                      <Input
                        id="create-order-guest-phone"
                        value={customer.cusPhone}
                        onChange={(e) =>
                          setCustomer((prev) => ({
                            ...prev,
                            cusPhone: e.target.value,
                          }))
                        }
                        placeholder="VD: 0912345678"
                        inputMode="tel"
                        className="min-h-[40px]"
                        data-ocid="create_order.guest_phone_input"
                      />
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Tổng tiền hàng + chiết khấu (nếu có) — Giai đoạn 3e. Hệ 1
                  chỉ hiện khi ĐANG trong khung giờ (không hiện lúc "sắp
                  tới") và giỏ hàng đã đạt mức nào đó. Đây CHỈ LÀ ƯỚC TÍNH
                  hiển thị — số tiền thật vẫn do canister xác nhận lúc đặt
                  đơn (applyPromotion/applyVoucher), không đổi logic đã có. */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tổng tiền hàng</span>
                <span className="font-mono">{formatVnd(totalAmount)}</span>
              </div>

              {/* BUG THẬT đã sửa: phí ship Lalamove (shipQuote.shippingFee)
                  trước đây không hiện ở đâu trong giỏ hàng — khách chỉ
                  thấy tiền hàng + khuyến mãi, "Tổng thanh toán" không hề
                  cộng phí ship vào dù đã tính được (hiện đúng ở khối
                  NearestRestaurantDisplay phía trên, nhưng KHÔNG được nối
                  sang đây). Chỉ hiện khi đã có kết quả (không hiện lúc
                  đang tính/chưa xác định — tránh hiện 0đ gây hiểu nhầm
                  miễn phí ship). */}
              {shipQuote && shipQuote.shippingFee > 0 && (
                <div
                  className="flex items-center justify-between text-sm"
                  data-ocid="create_order.shipping_fee_line"
                >
                  <span className="text-muted-foreground">Phí ship</span>
                  <span className="font-mono">
                    {formatVnd(shipQuote.shippingFee)}
                  </span>
                </div>
              )}

              {cartDiscounts.kmDiscount > 0 && (
                <div
                  className="flex items-center justify-between text-sm text-destructive"
                  data-ocid="create_order.km_discount_line"
                >
                  <span>{cartDiscounts.kmLabel || "Khuyến mãi giờ vàng"}</span>
                  <span className="font-mono">
                    -{formatVnd(cartDiscounts.kmDiscount)}
                  </span>
                </div>
              )}

              {cartDiscounts.validVouchers.length > 0 && (
                <div
                  className="flex flex-col gap-1.5"
                  data-ocid="create_order.voucher_selector"
                >
                  <Label
                    htmlFor="create-order-voucher-select"
                    className="text-xs text-muted-foreground"
                  >
                    Phiếu giảm giá
                  </Label>
                  <select
                    id="create-order-voucher-select"
                    value={cartDiscounts.selectedVoucherCode ?? ""}
                    onChange={(e) =>
                      cartDiscounts.setSelectedVoucherCode(
                        e.target.value || null,
                      )
                    }
                    className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                    data-ocid="create_order.voucher_select"
                  >
                    <option value="">Không dùng phiếu</option>
                    {cartDiscounts.validVouchers.map((v) => (
                      <option key={v.code} value={v.code}>
                        Giảm {formatVnd(Number(v.value))} (HSD{" "}
                        {formatVoucherDate(v.endDate)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {cartDiscounts.voucherDiscount > 0 && (
                <div
                  className="flex items-center justify-between text-sm text-destructive"
                  data-ocid="create_order.voucher_discount_line"
                >
                  <span>Phiếu giảm giá</span>
                  <span className="font-mono">
                    -{formatVnd(cartDiscounts.voucherDiscount)}
                  </span>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Receipt className="h-4 w-4" aria-hidden="true" />
                  Tổng thanh toán
                </span>
                <span className="font-mono text-lg font-bold text-[oklch(var(--bbh-gold))]">
                  {formatVnd(
                    cartDiscounts.finalTotal + (shipQuote?.shippingFee ?? 0),
                  )}
                </span>
              </div>

              <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                {storeClosed && (
                  <p
                    className="mb-2 text-center text-sm font-medium text-destructive"
                    data-ocid="create_order.closed_notice"
                  >
                    Ngoài giờ mở cửa — mở lại sau{" "}
                    <span className="font-mono font-bold">{countdownText}</span>
                  </p>
                )}
                <Button
                  type="button"
                  className="min-h-[48px] w-full bg-gradient-primary text-primary-foreground"
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    storeClosed ||
                    cartLines.length === 0 ||
                    !profileComplete ||
                    // BUG THẬT rất có khả năng là nguyên nhân "không gọi
                    // được tài xế Lalamove" — trước đây nút này KHÔNG chờ
                    // shipQuoteLoading, khách có thể bấm đặt đơn ngay sau
                    // khi thêm món đầu tiên, TRƯỚC khi /quote (debounce
                    // 500ms + gọi Lalamove thật) kịp trả về kết quả —
                    // lalamovePickupStopId/lalamoveDropStopId khi đó vẫn
                    // rỗng, VPS không đủ điều kiện tự động gọi tài xế
                    // (routes/create.js chỉ gọi khi có đủ cả 2 giá trị
                    // này — không phải lỗi, chỉ là thiếu dữ liệu do bấm
                    // quá nhanh). Buộc đợi quote xong (thành công hay
                    // thất bại đều được — shipQuoteLoading về false ở cả
                    // 2 trường hợp) trước khi cho đặt đơn.
                    shipQuoteLoading
                  }
                  data-ocid="create_order.submit_button"
                >
                  {submitting ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Đang đặt đơn…
                    </>
                  ) : storeClosed ? (
                    <>
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      Ngoài giờ mở cửa
                    </>
                  ) : shipQuoteLoading ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Đang tính phí ship…
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                      Đặt đơn ·{" "}
                      {formatVnd(
                        cartDiscounts.finalTotal +
                          (shipQuote?.shippingFee ?? 0),
                      )}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </section>
    </div>
  );
}

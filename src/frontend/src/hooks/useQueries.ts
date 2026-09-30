// Shared React Query hooks for backend reads (non-polling).
// Page tasks import from here; polling hooks live in their own files.
//
// MULTI-PARTNER: every hook below is scoped to the CURRENT partner. The
// tenantId comes from useTenant() (hooks/useTenant.tsx) and is threaded into
// both the canister call and the React Query cache key, so switching partners
// can never serve another partner's cached data. Hooks stay disabled until the
// partner is resolved (tenantId present) — a screen must never render another
// partner's data while the current partner is still loading.

import { type Backend, createActor } from "@/backend";
import type { DeviceRole, EnterpriseRole, StoreHours } from "@/backend";
import { useTenant } from "@/hooks/useTenant";
import {
  activateDevice as activateDeviceFn,
  addItem as addItemFn,
  addRestaurant as addRestaurantFn,
  cleanupExpiredActivations as cleanupFn,
  cleanupOrderByDevice as cleanupOrderByDeviceFn,
  countVouchersByProgram as countVouchersByProgramFn,
  createPromotion as createPromotionFn,
  createRegistrationPromo as createRegistrationPromoFn,
  createSalesPromo as createSalesPromoFn,
  createTenant as createTenantFn,
  deleteItem as deleteItemFn,
  deletePromotion as deletePromotionFn,
  deleteRegistrationPromo as deleteRegistrationPromoFn,
  deleteRestaurant as deleteRestaurantFn,
  deleteSalesPromo as deleteSalesPromoFn,
  generateActivationCode as genCodeFn,
  getCanisterIdText as getCanisterIdFn,
  getCurrentPromotion as getCurrentPromotionFn,
  getCurrentRegistrationPromo as getCurrentRegistrationPromoFn,
  getCurrentSalesPromo as getCurrentSalesPromoFn,
  getItemImage as getItemImageFn,
  getKmDailyCount as getKmDailyCountFn,
  getKmUsageCount as getKmUsageCountFn,
  getMenuForRestaurant as getMenuForRestaurantFn,
  getOrder as getOrderFn,
  getOrdersByEmail as getOrdersByEmailFn,
  getPaymentMode as getPaymentModeFn,
  getStoreHours as getStoreHoursFn,
  getTenantBySlug as getTenantBySlugFn,
  getTenant as getTenantFn,
  isCallerAdmin as isCallerAdminFn,
  isPromotionUsed as isPromotionUsedFn,
  isRegistrationPromoUsed as isRegistrationPromoUsedFn,
  isSalesPromoUsed as isSalesPromoUsedFn,
  isStoreOpen as isStoreOpenFn,
  issueInvoiceByDevice as issueInvoiceByDeviceFn,
  listDevicesByRestaurant as listDevicesByRestaurantFn,
  listDevicesByRole as listDevicesByRoleFn,
  listMenus as listMenusFn,
  listMyVouchers as listMyVouchersFn,
  listOrders as listOrdersFn,
  listPromotions as listPromotionsFn,
  listRegistrationPromos as listRegistrationPromosFn,
  listRestaurants as listRestaurantsFn,
  listSalesPromos as listSalesPromosFn,
  listTenants as listTenantsFn,
  markPickedUp as markPickedUpFn,
  revokeDevice as revokeDeviceFn,
  setItemVisible as setItemVisibleFn,
  setRestaurantPriceOverride as setOverrideFn,
  setPaymentMode as setPaymentModeFn,
  setStoreHours as setStoreHoursFn,
  setTenantActive as setTenantActiveFn,
  setVpsSecret as setVpsSecretFn,
  stopPromotion as stopPromotionFn,
  stopRegistrationPromo as stopRegistrationPromoFn,
  stopSalesPromo as stopSalesPromoFn,
  updateItem as updateItemFn,
  updatePromotion as updatePromotionFn,
  updateRegistrationPromo as updateRegistrationPromoFn,
  updateRestaurant as updateRestaurantFn,
  updateSalesPromo as updateSalesPromoFn,
  updateTenant as updateTenantFn,
} from "@/lib/canister";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function useActorOrNull() {
  const { actor, isFetching } = useActor(createActor);
  return { actor: actor as Backend | null, isFetching };
}

// The current partner's id, or "" while the partner is still loading / not
// found. Every tenant-scoped hook below keys its cache by this value and stays
// disabled while it is empty, so no screen can read another partner's data.
export function useTenantId(): string {
  return useTenant().tenant?.tenantId ?? "";
}

// ---- Orders ----
export function useOrders(deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["orders", tenantId, deviceId],
    queryFn: () =>
      actor ? listOrdersFn(actor, deviceId, tenantId) : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!tenantId,
  });
}

// Lịch sử đặt đơn — tra cứu theo email đã xác thực. Chỉ chạy khi có email
// (đã trim + lowercase phía gọi); hoạt động trên mọi thiết bị vì lọc ở
// canister thay vì dựa vào localStorage như useOrders/OrderList.
export function useOrdersByEmail(email: string | null, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["ordersByEmail", tenantId, email, deviceId],
    queryFn: () =>
      actor && email
        ? getOrdersByEmailFn(actor, email, deviceId, tenantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!email && !!tenantId,
  });
}

// Fetch a single full Order (includes createdAt/amount/billId/qrCode/expireAt
// that OrderStatus does not carry). Used by OrderTracker to render QrPayment.
export function useGetOrder(orderId: string | undefined, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["order", tenantId, orderId, deviceId],
    queryFn: () =>
      actor && orderId
        ? getOrderFn(actor, orderId, deviceId, tenantId)
        : Promise.resolve(null),
    enabled: !!actor && !isFetching && !!orderId && !!tenantId,
    // Poll every 5s so order.paymentStatus (which drives the QrPayment
    // 'Thanh toán' button) refreshes live after a customer pays while on the
    // page, matching the useOrderStatus poll. Without this, the button stays
    // visible until a manual refetch.
    refetchInterval: 5000,
  });
}

// Mark an order as picked up by the driver. Invalidates the paid-for-pickup
// polling query so the order disappears from the pickup queue immediately.
export function useMarkPickedUp() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (orderId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return markPickedUpFn(actor, orderId);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["orders", "paid-for-pickup"] }),
  });
}

// ---- Menu ----
export function useMenus() {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["menus", tenantId],
    queryFn: () => (actor ? listMenusFn(actor, tenantId) : Promise.resolve([])),
    enabled: !!actor && !isFetching && !!tenantId,
  });
}

export function useMenuForRestaurant(restaurantId: string | undefined) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["menu", tenantId, restaurantId],
    queryFn: () =>
      actor && restaurantId
        ? getMenuForRestaurantFn(actor, restaurantId, tenantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!restaurantId && !!tenantId,
  });
}

// Ảnh món ăn lấy RIÊNG theo itemId (listMenus()/getMenuForRestaurant() không
// còn kèm ảnh — tránh vượt giới hạn kích thước phản hồi IC 3MB). staleTime
// dài vì ảnh món hiếm khi đổi — tránh gọi lại canister mỗi lần component
// remount (mỗi thẻ món trong danh sách đều dùng hook này).
export function useItemImage(itemId: string | undefined) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["itemImage", tenantId, itemId],
    queryFn: () =>
      actor && itemId
        ? getItemImageFn(actor, itemId)
        : Promise.resolve(undefined),
    enabled: !!actor && !isFetching && !!itemId && !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (
      item: Omit<Parameters<typeof updateItemFn>[1], "tenantId">,
    ) => {
      if (!actor) throw new Error("Actor not ready");
      return updateItemFn(actor, { ...item, tenantId }, tenantId);
    },
    onSuccess: (_data, item) => {
      qc.invalidateQueries({ queryKey: ["menus"] });
      qc.invalidateQueries({ queryKey: ["itemImage", tenantId, item.itemId] });
    },
  });
}

// Bật/tắt hiển thị món — CHỈ đổi field visible, KHÔNG đụng tới ảnh. Dùng cho
// MenuItemTable.tsx thay vì useUpdateItem() để tránh gửi nhầm ảnh rỗng đè
// lên ảnh thật (item.image từ danh sách giờ luôn rỗng — xem useItemImage).
export function useSetItemVisible() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (args: { itemId: string; visible: boolean }) => {
      if (!actor) throw new Error("Actor not ready");
      return setItemVisibleFn(actor, args.itemId, args.visible, tenantId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menus"] }),
  });
}

export function useAddItem() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (item: Omit<Parameters<typeof addItemFn>[1], "tenantId">) => {
      if (!actor) throw new Error("Actor not ready");
      return addItemFn(actor, { ...item, tenantId }, tenantId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menus"] }),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (itemId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deleteItemFn(actor, itemId, tenantId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menus"] }),
  });
}

// ---- Restaurants ----
export function useRestaurants() {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["restaurants", tenantId],
    queryFn: () =>
      actor ? listRestaurantsFn(actor, tenantId) : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!tenantId,
  });
}

export function useAddRestaurant() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (
      r: Omit<Parameters<typeof addRestaurantFn>[1], "tenantId">,
    ) => {
      if (!actor) throw new Error("Actor not ready");
      return addRestaurantFn(actor, { ...r, tenantId }, tenantId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurants"] }),
  });
}

export function useUpdateRestaurant() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (
      r: Omit<Parameters<typeof updateRestaurantFn>[1], "tenantId">,
    ) => {
      if (!actor) throw new Error("Actor not ready");
      return updateRestaurantFn(actor, { ...r, tenantId }, tenantId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurants"] }),
  });
}

export function useDeleteRestaurant() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (restaurantId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deleteRestaurantFn(actor, restaurantId, tenantId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurants"] }),
  });
}

export function useSetRestaurantPriceOverride() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (args: {
      restaurantId: string;
      itemId: string;
      price: bigint;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return setOverrideFn(
        actor,
        args.restaurantId,
        args.itemId,
        args.price,
        tenantId,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

// ---- Devices ----
export function useDevicesByRestaurant(
  restaurantId: string | undefined,
  refetchIntervalMs?: number,
) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["devices", tenantId, restaurantId],
    queryFn: () =>
      actor && restaurantId
        ? listDevicesByRestaurantFn(actor, restaurantId, tenantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!restaurantId && !!tenantId,
    refetchInterval: refetchIntervalMs,
  });
}

export function useGenerateActivationCode() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (args: { restaurantId: string; role: DeviceRole }) => {
      if (!actor) throw new Error("Actor not ready");
      return genCodeFn(actor, args.restaurantId, args.role, tenantId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useActivateDevice() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: {
      code: string;
      deviceId: string;
      name: string;
      phone: string;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return activateDeviceFn(
        actor,
        args.code,
        args.deviceId,
        args.name,
        args.phone,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useRevokeDevice() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (deviceId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return revokeDeviceFn(actor, deviceId, tenantId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useCleanupExpiredActivations() {
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: () => {
      if (!actor) throw new Error("Actor not ready");
      return cleanupFn(actor);
    },
  });
}

// ---- Enterprise roles ----

// List devices bound to a specific role (admin/driver/cashier or one of the
// 3 enterprise roles). Used by DeviceManager to filter by enterprise role.
export function useDevicesByRole(role: DeviceRole | undefined) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["devices", tenantId, "role", role],
    queryFn: () =>
      actor && role
        ? listDevicesByRoleFn(actor, role, tenantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!role && !!tenantId,
  });
}

// Whether the current caller holds a specific enterprise role. Used by the
// enterprise gate to scope each role to its own module. deviceId is the
// current device's bound id (from the enterprise activation storage).
export function useCallerHasEnterpriseRole(
  role: EnterpriseRole | undefined,
  deviceId?: string,
) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["auth", "enterpriseRole", tenantId, role, deviceId],
    queryFn: () =>
      actor && role
        ? actor.callerHasEnterpriseRole(deviceId ?? "", tenantId, role)
        : Promise.resolve(false),
    enabled: !!actor && !isFetching && !!role && !!tenantId,
    staleTime: 60_000,
  });
}

// useListPendingPaymentOrders/useConfirmPaymentByDevice (vai trò "Hàng đợi
// thanh toán") đã XOÁ HẲN — xem giải thích ở mixins/core-api.mo (lỗ hổng tài
// chính: đánh dấu #paid không qua bất kỳ đối chiếu nào). /driver là nơi duy
// nhất xử lý thanh toán, dùng listPendingPaymentOrders (canister, đã khôi
// phục về đúng 1 tham số) qua VPS worker, không qua hook này.

// Accounting role: manually clean up (cancel) an order.
export function useCleanupOrderByDevice(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (orderId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return cleanupOrderByDeviceFn(actor, deviceId ?? "", orderId, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// Accounting role: manually issue an e-invoice for an order.
export function useIssueInvoiceByDevice(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (args: {
      orderId: string;
      invoiceId: string;
      pdfUrl: string;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return issueInvoiceByDeviceFn(
        actor,
        deviceId ?? "",
        args.orderId,
        args.invoiceId,
        args.pdfUrl,
        tenantId,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// ---- Admin / VPS secret ----
export function useIsAdmin() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["auth", "isAdmin"],
    queryFn: () => (actor ? isCallerAdminFn(actor) : Promise.resolve(false)),
    enabled: !!actor && !isFetching,
  });
}

export function useCanisterIdText() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["canister-id"],
    queryFn: () => (actor ? getCanisterIdFn(actor) : Promise.resolve("")),
    enabled: !!actor && !isFetching,
  });
}

export function useSetVpsSecret() {
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (newSecret: string) => {
      if (!actor) throw new Error("Actor not ready");
      return setVpsSecretFn(actor, newSecret);
    },
  });
}

// ---- Admin / payment mode ----
// A9: the payment-mode query drives isCustomerMode on the order page. It
// refetches on mount, window focus, and network reconnect so the frontend
// mode always matches the VPS and never drifts into the wrong payment flow.
// Per-partner: the mode is read/written for the current partner only.
export function useGetPaymentMode() {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["paymentMode", tenantId],
    queryFn: () =>
      actor ? getPaymentModeFn(actor, tenantId) : Promise.resolve(""),
    enabled: !!actor && !isFetching && !!tenantId,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });
}

export function useSetPaymentMode() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (mode: string) => {
      if (!actor) throw new Error("Actor not ready");
      return setPaymentModeFn(actor, mode, tenantId);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["paymentMode", tenantId] }),
  });
}

// ---- Store hours (per partner) ----
export function useGetStoreHours() {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["storeHours", tenantId],
    queryFn: () =>
      actor ? getStoreHoursFn(actor, tenantId) : Promise.resolve(null),
    enabled: !!actor && !isFetching && !!tenantId,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useSetStoreHours() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (hours: StoreHours) => {
      if (!actor) throw new Error("Actor not ready");
      return setStoreHoursFn(actor, hours, tenantId);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["storeHours", tenantId] }),
  });
}

// Whether the store is currently open (drives the waiting/closed screen).
// Polls every 30s so the closed screen automatically unlocks the moment the
// store's opening time passes, without the customer needing to refresh.
export function useIsStoreOpen() {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["storeOpen", tenantId],
    queryFn: () =>
      actor ? isStoreOpenFn(actor, tenantId) : Promise.resolve(true),
    enabled: !!actor && !isFetching && !!tenantId,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
}

// Chương trình KM đang có hiệu lực hôm nay (banner trang đặt món). Poll
// 30s giống useIsStoreOpen — đủ để banner cập nhật khi admin vừa
// tạo/sửa/tắt chương trình mà không cần khách tự tải lại trang.
export function useCurrentPromotion() {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["currentPromotion", tenantId],
    queryFn: () =>
      actor ? getCurrentPromotionFn(actor, tenantId) : Promise.resolve(null),
    enabled: !!actor && !isFetching && !!tenantId,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
}

// Chương trình "Khuyến mại đăng ký" đang có hiệu lực hôm nay — hiện ở
// trang đặt món cho khách CHƯA TỪNG xác thực email (xem
// RegistrationPromoBanner.tsx, tự kiểm tra localStorage riêng, hook này
// chỉ lấy dữ liệu chương trình, không quyết định hiện/ẩn).
export function useCurrentRegistrationPromo() {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["currentRegistrationPromo", tenantId],
    queryFn: () =>
      actor
        ? getCurrentRegistrationPromoFn(actor, tenantId)
        : Promise.resolve(null),
    enabled: !!actor && !isFetching && !!tenantId,
  });
}

// Tổng số đơn KM Hệ 1 đã dùng hôm nay (toàn hệ thống) — hiện "Đã dùng
// X/Y đơn khuyến mại hôm nay" cạnh banner. Refetch cùng nhịp với
// useCurrentPromotion (30s) — đủ mới, không cần realtime tuyệt đối.
export function useKmDailyCount(programCode: string | null) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["kmDailyCount", tenantId, programCode],
    queryFn: () =>
      actor && programCode
        ? getKmDailyCountFn(actor, programCode, tenantId)
        : Promise.resolve(0n),
    enabled: !!actor && !isFetching && !!programCode && !!tenantId,
    refetchInterval: 30000,
  });
}

// Số phiếu (Đăng ký/Doanh số) đã phát cho 1 chương trình — dùng ở trang
// /admin/theo-doi-km (việc 1).
export function useVoucherCountByProgram(programCode: string | null) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["voucherCountByProgram", tenantId, programCode],
    queryFn: () =>
      actor && programCode
        ? countVouchersByProgramFn(actor, programCode, tenantId)
        : Promise.resolve(0n),
    enabled: !!actor && !isFetching && !!programCode && !!tenantId,
  });
}

// Số đơn KM Hệ 1 khách NÀY đã dùng hôm nay — hiện "Bạn đã dùng X/Y lượt
// hôm nay", chỉ khi khách đã xác thực email (cần email để tra).
export function useKmUsageCount(
  email: string | null,
  programCode: string | null,
) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["kmUsageCount", tenantId, email, programCode],
    queryFn: () =>
      actor && email && programCode
        ? getKmUsageCountFn(actor, email, programCode, tenantId)
        : Promise.resolve(0n),
    enabled: !!actor && !isFetching && !!email && !!programCode && !!tenantId,
    refetchInterval: 30000,
  });
}

// Chương trình "Khuyến mại doanh số" đang có hiệu lực hôm nay — dùng cho
// dòng gợi ý "còn X đ nữa để đạt mức thưởng tiếp theo" ở tab "Tuần
// này"/"Tháng này" (Giai đoạn 3f).
export function useCurrentSalesPromo() {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["currentSalesPromo", tenantId],
    queryFn: () =>
      actor ? getCurrentSalesPromoFn(actor, tenantId) : Promise.resolve(null),
    enabled: !!actor && !isFetching && !!tenantId,
  });
}

// ---- Quản lý chương trình KM (admin) ----

export function usePromotions(deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["promotions", tenantId, deviceId],
    queryFn: () =>
      actor ? listPromotionsFn(actor, deviceId, tenantId) : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!tenantId,
  });
}

export function useCreatePromotion(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (input: Parameters<typeof createPromotionFn>[2]) => {
      if (!actor) throw new Error("Actor not ready");
      return createPromotionFn(actor, deviceId ?? "", input, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["currentPromotion"] });
    },
  });
}

export function useUpdatePromotion(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (args: {
      code: string;
      input: Parameters<typeof createPromotionFn>[2];
      active: boolean;
      enabledOnline: boolean;
      enabledCounter: boolean;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return updatePromotionFn(
        actor,
        deviceId ?? "",
        args.code,
        args.input,
        args.active,
        args.enabledOnline,
        args.enabledCounter,
        tenantId,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["currentPromotion"] });
    },
  });
}

export function useDeletePromotion(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deletePromotionFn(actor, deviceId ?? "", code, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["currentPromotion"] });
    },
  });
}

// Chương trình đã có khách dùng thành công chưa (Giai đoạn 4f) — quyết
// định hiện nút Sửa/Xoá hay chỉ Dừng. Gọi riêng theo từng dòng bảng (mỗi
// hàng PromotionTableRow tự gọi hook này cho mã của chính nó).
export function useIsPromotionUsed(code: string, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["promotionUsed", tenantId, code, deviceId],
    queryFn: () =>
      actor
        ? isPromotionUsedFn(actor, deviceId ?? "", code, tenantId)
        : Promise.resolve(false),
    enabled: !!actor && !isFetching && !!code && !!tenantId,
  });
}

export function useStopPromotion(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return stopPromotionFn(actor, deviceId ?? "", code, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["currentPromotion"] });
    },
  });
}

// ---- Quản lý "Khuyến mại đăng ký" (admin) ----

export function useRegistrationPromos(deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["registrationPromos", tenantId, deviceId],
    queryFn: () =>
      actor
        ? listRegistrationPromosFn(actor, deviceId, tenantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!tenantId,
  });
}

export function useCreateRegistrationPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (input: Parameters<typeof createRegistrationPromoFn>[2]) => {
      if (!actor) throw new Error("Actor not ready");
      return createRegistrationPromoFn(actor, deviceId ?? "", input, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registrationPromos"] });
    },
  });
}

export function useUpdateRegistrationPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (args: {
      code: string;
      input: Parameters<typeof createRegistrationPromoFn>[2];
      active: boolean;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return updateRegistrationPromoFn(
        actor,
        deviceId ?? "",
        args.code,
        args.input,
        args.active,
        tenantId,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registrationPromos"] });
    },
  });
}

export function useDeleteRegistrationPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deleteRegistrationPromoFn(actor, deviceId ?? "", code, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registrationPromos"] });
    },
  });
}

export function useIsRegistrationPromoUsed(code: string, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["registrationPromoUsed", tenantId, code, deviceId],
    queryFn: () =>
      actor
        ? isRegistrationPromoUsedFn(actor, deviceId ?? "", code, tenantId)
        : Promise.resolve(false),
    enabled: !!actor && !isFetching && !!code && !!tenantId,
  });
}

export function useStopRegistrationPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return stopRegistrationPromoFn(actor, deviceId ?? "", code, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registrationPromos"] });
    },
  });
}

// ---- Quản lý "Khuyến mại doanh số tuần/tháng" (admin) ----

export function useSalesPromos(deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["salesPromos", tenantId, deviceId],
    queryFn: () =>
      actor
        ? listSalesPromosFn(actor, deviceId, tenantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!tenantId,
  });
}

export function useCreateSalesPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (input: Parameters<typeof createSalesPromoFn>[2]) => {
      if (!actor) throw new Error("Actor not ready");
      return createSalesPromoFn(actor, deviceId ?? "", input, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesPromos"] });
    },
  });
}

export function useUpdateSalesPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (args: {
      code: string;
      input: Parameters<typeof createSalesPromoFn>[2];
      active: boolean;
      enabledCounter: boolean;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return updateSalesPromoFn(
        actor,
        deviceId ?? "",
        args.code,
        args.input,
        args.active,
        args.enabledCounter,
        tenantId,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesPromos"] });
    },
  });
}

export function useDeleteSalesPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deleteSalesPromoFn(actor, deviceId ?? "", code, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesPromos"] });
    },
  });
}

export function useIsSalesPromoUsed(code: string, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["salesPromoUsed", tenantId, code, deviceId],
    queryFn: () =>
      actor
        ? isSalesPromoUsedFn(actor, deviceId ?? "", code, tenantId)
        : Promise.resolve(false),
    enabled: !!actor && !isFetching && !!code && !!tenantId,
  });
}

export function useStopSalesPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return stopSalesPromoFn(actor, deviceId ?? "", code, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesPromos"] });
    },
  });
}

// ---- Phiếu giảm giá (khách xem/áp dụng) ----

export function useMyVouchers(email: string | null) {
  const { actor, isFetching } = useActorOrNull();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["myVouchers", tenantId, email],
    queryFn: () =>
      actor && email
        ? listMyVouchersFn(actor, email, tenantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!email && !!tenantId,
  });
}

// ---- Đối tác (tenant) — admin trung tâm ----
// Các hook dưới đây KHÔNG tenant-scoped: admin trung tâm quản lý xuyên đối tác,
// nên không dùng useTenantId() và không bị vô hiệu khi đối tác chưa phân giải.

// Danh sách đối tác. activeOnly=false (mặc định) trả về cả đối tác đang ẩn để
// trang quản lý hiện đủ; activeOnly=true dùng cho nơi chỉ cần đối tác hoạt động.
export function useTenants(activeOnly = false) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["tenants", activeOnly],
    queryFn: () =>
      actor ? listTenantsFn(actor, activeOnly) : Promise.resolve([]),
    enabled: !!actor && !isFetching,
  });
}

export function useTenantById(tenantId: string | undefined) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () =>
      actor && tenantId ? getTenantFn(actor, tenantId) : Promise.resolve(null),
    enabled: !!actor && !isFetching && !!tenantId,
  });
}

export function useTenantBySlug(slug: string | null | undefined) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["tenantBySlug", slug],
    queryFn: () =>
      actor && slug ? getTenantBySlugFn(actor, slug) : Promise.resolve(null),
    enabled: !!actor && !isFetching && !!slug,
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (input: Parameters<typeof createTenantFn>[1]) => {
      if (!actor) throw new Error("Actor not ready");
      return createTenantFn(actor, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateTenantFn>[1]) => {
      if (!actor) throw new Error("Actor not ready");
      return updateTenantFn(actor, input);
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant", input.tenantId] });
      qc.invalidateQueries({ queryKey: ["tenantBySlug"] });
    },
  });
}

export function useSetTenantActive() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: { tenantId: string; active: boolean }) => {
      if (!actor) throw new Error("Actor not ready");
      return setTenantActiveFn(actor, args.tenantId, args.active);
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant", args.tenantId] });
      qc.invalidateQueries({ queryKey: ["tenantBySlug"] });
    },
  });
}

// Poll listPendingPaymentOrders every 5s for DriverPaymentScreen.
// Mobile-first: returns flat list ready for QR-focused driver UI.
//
// SỬA (đã bỏ vai trò doanh nghiệp "Hàng đợi thanh toán" — xem
// mixins/core-api.mo): listPendingPaymentOrders khôi phục về ĐÚNG 1 tham
// số (restaurantId), không còn deviceId/role gating nữa. Bản trước gọi
// VỚI deviceId="" (không truyền) — dưới logic role-gating cũ, deviceId
// rỗng KHÔNG CÓ role nào, khiến hàm LUÔN trả về mảng rỗng — đây chính là
// nguyên nhân "Hàng đợi thanh toán" không hiển thị đơn nào ở /driver.

import { createActor } from "@/backend";
import { useTenantId } from "@/hooks/useQueries";
import { listPaidOrdersForPickup as listPaidOrdersForPickupFn } from "@/lib/canister";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";

export function usePendingOrders(restaurantId: string | undefined) {
  const { actor, isFetching } = useActor(createActor);
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["orders", "pending", tenantId, restaurantId],
    queryFn: async () => {
      if (!actor || !restaurantId) return [];
      return actor.listPendingPaymentOrders(tenantId, restaurantId);
    },
    enabled: !!actor && !isFetching && !!restaurantId && !!tenantId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

// Poll listPaidOrdersForPickup every 5s — today's paid+confirmed orders ready
// for the driver to pick up. No restaurantId needed (caller-scoped on canister).
export function usePaidOrdersForPickup(enabled: boolean) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["orders", "paid-for-pickup"],
    queryFn: async () => {
      if (!actor) return [];
      return listPaidOrdersForPickupFn(actor);
    },
    enabled: !!actor && !isFetching && enabled,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

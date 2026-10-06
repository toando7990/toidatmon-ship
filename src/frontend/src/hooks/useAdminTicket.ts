// Vé admin để gọi API quản trị trên VPS (canister issueVpsAdminTicket, ký
// HMAC bằng VPS_SECRET — xem lib/payouts.ts getAdminTicket). Trả hàm lấy vé
// (có nhớ đệm đến gần hết hạn).
import { useCanister } from "@/lib/canister";
import { getAdminTicket } from "@/lib/payouts";
import { useCallback } from "react";

export function useVpsAdminTicket() {
  const { actor, isFetching } = useCanister();
  const getTicket = useCallback(async () => {
    if (!actor) throw new Error("Đang kết nối hệ thống, thử lại sau giây lát");
    return getAdminTicket(actor);
  }, [actor]);
  return { ready: !!actor && !isFetching, getTicket };
}

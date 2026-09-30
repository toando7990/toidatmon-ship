// Poll getOrderStatus every 5s for OrderTracker.
// Canister is the source of truth for status/QR — no HTTP outcalls.

import { createActor } from "@/backend";
import { useTenantId } from "@/hooks/useQueries";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";

export function useOrderStatus(orderId: string | undefined) {
  const { actor, isFetching } = useActor(createActor);
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["order", "status", tenantId, orderId],
    queryFn: async () => {
      if (!actor || !orderId) return null;
      const r = await actor.getOrderStatus(tenantId, orderId);
      if (r.__kind__ === "ok") return r.ok;
      throw new Error(r.err);
    },
    enabled: !!actor && !isFetching && !!orderId && !!tenantId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

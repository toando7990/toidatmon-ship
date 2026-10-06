// Khuyến mại chung (sàn tài trợ): sàn gánh (100 − promo_share_percent)% tiền
// giảm của chương trình, trả lại cho đối tác khi đối soát. Chỉ admin sàn
// đánh dấu được; đối tác thấy nhãn "Sàn tài trợ".

import { useIsAdmin, useTenantId } from "@/hooks/useQueries";
import { useCanister } from "@/lib/canister";
import {
  hasFinanceApi,
  listPlatformFundedPromos,
  setPromoPlatformFunded,
} from "@/lib/partner-finance";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const QK = ["platform-funded-promos"];

export function usePlatformFunded() {
  const tenantId = useTenantId();
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const isAdminQ = useIsAdmin();
  const q = useQuery({
    queryKey: QK,
    queryFn: () => listPlatformFundedPromos(actor as NonNullable<typeof actor>),
    enabled: !!actor && !isFetching,
  });
  const set = q.data ?? new Set<string>();
  const canEdit =
    !!isAdminQ.data && !!actor && hasFinanceApi(actor) && !!tenantId;
  const toggle = useMutation({
    mutationFn: ({ code, on }: { code: string; on: boolean }) =>
      setPromoPlatformFunded(
        actor as NonNullable<typeof actor>,
        tenantId,
        code,
        on,
      ),
    onSuccess: (_, v) => {
      toast.success(
        v.on
          ? `${v.code}: đã đánh dấu khuyến mại chung (sàn tài trợ)`
          : `${v.code}: đã bỏ khuyến mại chung`,
      );
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Không lưu được"),
  });
  return {
    isFunded: (code: string) => set.has(`${tenantId}|${code}`),
    canEdit,
    setFunded: (code: string, on: boolean) => toggle.mutate({ code, on }),
  };
}

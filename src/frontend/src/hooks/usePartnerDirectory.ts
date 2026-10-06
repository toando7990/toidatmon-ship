// Danh bạ đối tác cho các màn hình của sàn: tên pháp lý (đối tác) + thương
// hiệu + hồ sơ + số nhà hàng. credential: thẻ máy cấp sàn (/san); rỗng = admin.

import { useTenants } from "@/hooks/useQueries";
import { useCanister } from "@/lib/canister";
import {
  type PartnerProfile,
  countRestaurantsByTenant,
  listPartnerProfiles,
  partnerName,
} from "@/lib/partner-profile";
import type { Tenant } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export const PARTNER_PROFILE_QK = ["partner-profiles"];

export interface PartnerEntry {
  tenant: Tenant;
  /** Tên pháp lý của đối tác (hoặc thương hiệu nếu chưa khai). */
  partner: string;
  brand: string;
  profile?: PartnerProfile;
  restaurants: number;
}

export function usePartnerDirectory(credential = "") {
  const { actor, isFetching } = useCanister();
  const ready = !!actor && !isFetching;
  const tenantsQ = useTenants(false);
  const profilesQ = useQuery({
    queryKey: [...PARTNER_PROFILE_QK, credential],
    queryFn: () =>
      listPartnerProfiles(actor as NonNullable<typeof actor>, credential),
    enabled: ready,
  });
  const countsQ = useQuery({
    queryKey: ["restaurant-counts"],
    queryFn: () => countRestaurantsByTenant(actor as NonNullable<typeof actor>),
    enabled: ready,
  });
  const byId = useMemo(() => {
    const m = new Map<string, PartnerEntry>();
    for (const t of tenantsQ.data ?? []) {
      m.set(t.tenantId, {
        tenant: t,
        partner: partnerName(t),
        brand: t.name,
        profile: profilesQ.data?.get(t.tenantId),
        restaurants: countsQ.data?.get(t.tenantId) ?? 0,
      });
    }
    return m;
  }, [tenantsQ.data, profilesQ.data, countsQ.data]);
  return {
    byId,
    /** Tên đối tác theo tenantId (fallback: tenantId). */
    partnerOf: (id: string) => byId.get(id)?.partner ?? id,
    brandOf: (id: string) => byId.get(id)?.brand ?? "",
    loading: tenantsQ.isLoading,
  };
}

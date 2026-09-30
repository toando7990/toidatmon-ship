// II auth + authorization role check (admin gate).
// Uses InternetIdentityProvider (already in main.tsx) + canister isCallerAdmin().
// No hardcoded principals — admin role is assigned via backend assignCallerUserRole.

import { createActor } from "@/backend";
import { EnterpriseRole } from "@/backend";
import { useTenantId } from "@/hooks/useQueries";
import { useActor } from "@caffeineai/core-infrastructure";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";

export interface AuthState {
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: () => void;
  clear: () => void;
  isAdmin: boolean;
  isAdminLoading: boolean;
}

export function useAuth(): AuthState {
  const ii = useInternetIdentity();
  const { actor, isFetching } = useActor(createActor);

  const adminQuery = useQuery({
    queryKey: ["auth", "isAdmin", !!ii.identity],
    queryFn: async () => {
      if (!actor) return false;
      try {
        return await actor.isCallerAdmin();
      } catch {
        return false;
      }
    },
    enabled: !!ii.identity && !!actor && !isFetching,
    staleTime: 60_000,
  });

  return {
    isAuthenticated: ii.isAuthenticated,
    isInitializing: ii.isInitializing,
    login: ii.login,
    clear: ii.clear,
    isAdmin: Boolean(adminQuery.data),
    isAdminLoading: adminQuery.isLoading && !!ii.identity,
  };
}

// The 3 enterprise device roles, in display order. Each maps to one enterprise
// module page. A device is bound to exactly one of these at activation time.
export const ENTERPRISE_ROLES: EnterpriseRole[] = [
  EnterpriseRole.paymentQueue,
  EnterpriseRole.accounting,
  EnterpriseRole.salesPromoReporting,
];

// Vietnamese labels for the enterprise roles (used by nav + gates).
export const ENTERPRISE_ROLE_LABELS: Record<EnterpriseRole, string> = {
  [EnterpriseRole.paymentQueue]: "Hàng đợi thanh toán",
  [EnterpriseRole.accounting]: "Kế toán",
  [EnterpriseRole.salesPromoReporting]: "Báo cáo bán hàng & KM",
};

export interface EnterpriseRoleState {
  // The enterprise role the current device is bound to, or null when the
  // caller is not an enterprise device (admin/driver/cashier/guest).
  enterpriseRole: EnterpriseRole | null;
  isEnterpriseRoleLoading: boolean;
}

// Determines which enterprise role the current device has by probing the
// canister's callerHasEnterpriseRole for each of the 3 roles. Used to gate
// access to the enterprise module pages so each role only sees its own module.
// deviceId is the current device's bound id (from the enterprise activation
// storage); pass it so the canister can authorize the device by role.
export function useEnterpriseRole(deviceId?: string): EnterpriseRoleState {
  const { actor, isFetching } = useActor(createActor);
  const tenantId = useTenantId();

  const roleQuery = useQuery({
    queryKey: ["auth", "enterpriseRole", tenantId, deviceId],
    queryFn: async () => {
      if (!actor || !tenantId) return null;
      for (const role of ENTERPRISE_ROLES) {
        try {
          if (
            await actor.callerHasEnterpriseRole(deviceId ?? "", tenantId, role)
          )
            return role;
        } catch {
          // Probe failure for one role shouldn't block the others.
        }
      }
      return null;
    },
    enabled: !!actor && !isFetching && !!tenantId,
    staleTime: 60_000,
  });

  return {
    enterpriseRole: roleQuery.data ?? null,
    isEnterpriseRoleLoading: roleQuery.isLoading && !!actor && !!tenantId,
  };
}

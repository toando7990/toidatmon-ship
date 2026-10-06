// TenantProvider — loads the current partner record from the backend by slug
// and exposes it to the whole app. Wraps the router in main.tsx so every route
// renders inside a resolved partner context.
//
// Behaviour:
//   - On a partner subdomain (phoba.toidatmon.com) or a path prefix (/phoba/…)
//     the slug is resolved and getTenantBySlug(slug) is called.
//   - On the draft/preview domain (no partner subdomain) the provider falls
//     back to the default partner so the app still renders.
//   - An unknown or hidden slug resolves to isNotFound=true; the app renders
//     the partner-unavailable notice instead of a blank screen.
//   - The backend tenant API is being built in parallel, so a missing method
//     or a failed call is treated as "not found" rather than a crash.

import { createActor } from "@/backend";
import { setCurrentCompanyTenant } from "@/lib/company-info";
import { type TenantResolution, resolveTenant } from "@/lib/tenant";
import type { Tenant } from "@/types";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type TenantStatus = "loading" | "ready" | "not-found";

export interface TenantContextValue {
  /** The resolved partner record, or null while loading / when not found. */
  tenant: Tenant | null;
  /** The resolved partner slug, or null on the default (draft) domain. */
  slug: string | null;
  /** Where the slug came from — hostname, path, or none (default). */
  source: TenantResolution["source"];
  /** Overall resolution state. */
  status: TenantStatus;
  /** True while the partner record is being fetched. */
  isLoading: boolean;
  /** True when a slug was resolved but no active partner matches it. */
  isNotFound: boolean;
  /** True when running on the default partner (no partner subdomain). */
  isDefault: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

// The default partner slug used on the draft/preview domain. The backend
// seeds this partner; when it is missing the app still renders with the
// built-in Bunbohue65 branding.
const DEFAULT_TENANT_SLUG = "bunbohue65";

// Read the tenant record for a slug. Tolerates the backend tenant API not
// existing yet (built in parallel): a missing method or a thrown error is
// reported as null so the caller can decide between default and not-found.
async function fetchTenantBySlug(
  actor: unknown,
  slug: string,
): Promise<Tenant | null> {
  const maybe = actor as {
    getTenantBySlug?: (s: string) => Promise<Tenant | null>;
  };
  if (typeof maybe.getTenantBySlug !== "function") return null;
  try {
    const result = await maybe.getTenantBySlug(slug);
    return result ?? null;
  } catch {
    return null;
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { actor, isFetching } = useActor(createActor);
  const resolution = useMemo(() => resolveTenant(), []);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [status, setStatus] = useState<TenantStatus>("loading");

  const slug = resolution.slug;
  const isDefault = resolution.status === "default";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (isFetching) return;
      if (!actor) {
        // Actor not ready yet — stay in loading; the effect re-runs when the
        // actor arrives (isFetching/actor are dependencies).
        return;
      }

      // No partner subdomain (draft/preview): fall back to the default partner
      // so the app renders. If the default partner is absent, keep the
      // built-in branding rather than blocking the app.
      if (isDefault) {
        const fallback = await fetchTenantBySlug(actor, DEFAULT_TENANT_SLUG);
        if (cancelled) return;
        setTenant(fallback);
        setStatus("ready");
        return;
      }

      if (!slug) {
        if (cancelled) return;
        setTenant(null);
        setStatus("not-found");
        return;
      }

      const found = await fetchTenantBySlug(actor, slug);
      if (cancelled) return;
      if (found && found.active !== false) {
        setTenant(found);
        setStatus("ready");
      } else {
        setTenant(null);
        setStatus("not-found");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [actor, isFetching, slug, isDefault]);

  // Phiếu in (thanh toán / hoá đơn) lấy thông tin doanh nghiệp của quán này.
  useEffect(() => {
    setCurrentCompanyTenant(tenant);
  }, [tenant]);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant,
      slug,
      source: resolution.source,
      status,
      isLoading: status === "loading",
      isNotFound: status === "not-found",
      isDefault,
    }),
    [tenant, slug, resolution.source, status, isDefault],
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

// Safe default used when a component renders outside TenantProvider (e.g. an
// isolated unit test). Returning a ready/default context instead of throwing
// keeps the app — and any consumer — from ever blanking out.
const DEFAULT_TENANT_CONTEXT: TenantContextValue = {
  tenant: null,
  slug: null,
  source: "none",
  status: "ready",
  isLoading: false,
  isNotFound: false,
  isDefault: true,
};

export function useTenant(): TenantContextValue {
  return useContext(TenantContext) ?? DEFAULT_TENANT_CONTEXT;
}

// Convenience accessor for the current partner slug, defaulting to null.
export function useTenantSlug(): string | null {
  return useTenant().slug;
}

/**
 * Bọc 1 phần giao diện trong ngữ cảnh của MỘT quán cụ thể (theo slug) — dùng
 * ở tên miền chính (Tôi Đặt Món) khi xem chi tiết đơn của quán nào đó: các
 * hook theo đối tác (useTenantId…) bên trong sẽ dùng đúng quán đó.
 */
export function TenantScope({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const { actor, isFetching } = useActor(createActor);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [status, setStatus] = useState<TenantStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    if (!actor || isFetching) return;
    void fetchTenantBySlug(actor, slug).then((t) => {
      if (cancelled) return;
      setTenant(t && t.active !== false ? t : null);
      setStatus(t && t.active !== false ? "ready" : "not-found");
    });
    return () => {
      cancelled = true;
    };
  }, [actor, isFetching, slug]);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant,
      slug,
      source: "path",
      status,
      isLoading: status === "loading",
      isNotFound: status === "not-found",
      isDefault: false,
    }),
    [tenant, slug, status],
  );
  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

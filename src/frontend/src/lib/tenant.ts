// Partner (tenant) resolution — multi-partner platform.
//
// A partner is identified by a slug. The slug is resolved from TWO sources,
// in priority order:
//   1. The hostname subdomain of toidatmon.com — e.g. phoba.toidatmon.com
//      resolves to "phoba". The apex (toidatmon.com / www.toidatmon.com) and
//      the Caffeine draft/preview domains have NO partner subdomain.
//   2. A fallback path prefix — e.g. /phoba/... resolves to "phoba". This is
//      what makes the app usable on the draft/preview domain where no partner
//      subdomain exists.
//
// This module MUST NOT throw and MUST NOT leave the app blank: an unknown or
// hidden slug resolves to a not-found state that the app renders as a notice
// page, never as an empty screen.

/** Tên miền chính (hiển thị, đường dẫn gửi quán): ten-quan.toidatmon.vn */
export const PARTNER_ROOT_DOMAIN = "toidatmon.vn";
/** Tên miền được nhận diện quán từ tên miền con (giữ .com cho đường cũ). */
export const PARTNER_ROOT_DOMAINS = ["toidatmon.vn", "toidatmon.com"];

// Slug shape: lowercase letters, digits and single hyphens. Kept deliberately
// strict so a path segment like "admin" or "assets" is never mistaken for a
// partner slug.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Path segments that are app routes, never partner slugs. A path prefix is
// only treated as a partner slug when it is NOT one of these.
const RESERVED_PATH_SEGMENTS = new Set([
  "admin",
  "assets",
  "claim",
  "counter",
  "dang-ky-doi-tac",
  "driver",
  "enterprise",
  "gioi-thieu",
  "history",
  "ordering-partners",
  "profile",
  "quan-ly",
  "track",
]);

export type TenantResolutionStatus =
  | "resolved" // a slug was found (hostname or path prefix)
  | "default" // no slug found — draft/preview domain, use the default partner
  | "not-found"; // a slug was found but is malformed / reserved

export interface TenantResolution {
  /** Resolved partner slug, or null when none applies. */
  slug: string | null;
  /** How the slug was found. */
  source: "hostname" | "path" | "none";
  /** Resolution outcome — drives the provider's loading/not-found state. */
  status: TenantResolutionStatus;
}

// Normalize a raw candidate into a valid slug, or null when it cannot be one.
export function normalizeSlug(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  if (slug === "" || !SLUG_PATTERN.test(slug)) return null;
  return slug;
}

// Extract the partner slug from a hostname. Returns null for the apex domain,
// the www host, Caffeine domains, localhost, and any non-toidatmon host.
export function slugFromHostname(hostname: string): string | null {
  if (typeof hostname !== "string") return null;
  const host = hostname.trim().toLowerCase().split(":")[0];
  if (host === "" || host === "localhost") return null;
  const root = PARTNER_ROOT_DOMAINS.find((d) => host.endsWith(`.${d}`));
  if (!root) return null;
  const sub = host.slice(0, host.length - root.length - 1);
  if (sub === "" || sub === "www") return null;
  // Only a single-label subdomain is a partner (phoba.toidatmon.com). A
  // multi-label host (a.b.toidatmon.com) is not a partner host.
  if (sub.includes(".")) return null;
  return normalizeSlug(sub);
}

// Extract the partner slug from a pathname prefix. Returns null when the first
// segment is empty, reserved, or not a valid slug.
export function slugFromPath(pathname: string): string | null {
  if (typeof pathname !== "string") return null;
  const segments = pathname.split("/").filter((s) => s !== "");
  if (segments.length === 0) return null;
  const first = segments[0].toLowerCase();
  if (RESERVED_PATH_SEGMENTS.has(first)) return null;
  return normalizeSlug(first);
}

// Resolve the current partner from the browser location. Never throws.
export function resolveTenant(
  hostname: string = typeof window !== "undefined"
    ? window.location.hostname
    : "",
  pathname: string = typeof window !== "undefined"
    ? window.location.pathname
    : "/",
): TenantResolution {
  try {
    const fromHost = slugFromHostname(hostname);
    if (fromHost) {
      return { slug: fromHost, source: "hostname", status: "resolved" };
    }
    const fromPath = slugFromPath(pathname);
    if (fromPath) {
      return { slug: fromPath, source: "path", status: "resolved" };
    }
    // No partner subdomain and no path prefix — the draft/preview domain.
    // Fall back to the default partner so the app still renders.
    return { slug: null, source: "none", status: "default" };
  } catch {
    return { slug: null, source: "none", status: "default" };
  }
}

// Strip a leading partner path prefix from a pathname so the router sees the
// app-relative path. "/phoba/track" -> "/track"; "/phoba" -> "/".
export function stripPartnerPrefix(
  pathname: string,
  slug: string | null,
): string {
  if (!slug) return pathname;
  const prefix = `/${slug}`;
  if (pathname === prefix) return "/";
  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length);
  }
  return pathname;
}

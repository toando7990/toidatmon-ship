// Partner branding helpers — map a Tenant record onto the --brand-* CSS
// custom properties defined by the design wave (index.css). When no partner
// brand is set the properties are left untouched, so the existing Bunbohue65
// look is preserved byte-for-byte.

import type { Tenant } from "@/types";
import type { CSSProperties } from "react";

// Brand color values are hex strings from the backend. Only accept a strict
// hex form so a malformed value can never break the stylesheet.
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidBrandColor(value: string | null | undefined): boolean {
  return typeof value === "string" && HEX_COLOR.test(value.trim());
}

// Build the inline style that applies a partner's brand color at the app
// root. Returns an empty object when there is no valid brand color, which
// leaves the --brand-* defaults (aliases of the existing tokens) in place.
export function tenantBrandStyle(
  tenant: Tenant | null | undefined,
): CSSProperties {
  if (!tenant || !isValidBrandColor(tenant.brandColor)) return {};
  const color = tenant.brandColor.trim();
  return {
    "--brand-primary": color,
    "--brand-accent": color,
    "--brand-ring": color,
  } as CSSProperties;
}

// First letter of the partner name, used for the monogram fallback when a
// partner has no logo image.
export function tenantMonogram(tenant: Tenant | null | undefined): string {
  const name = tenant?.name?.trim();
  if (!name) return "B";
  return name.charAt(0).toUpperCase();
}

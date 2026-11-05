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

// Inline style for the storefront root. The platform uses ONE brand palette
// (brick red + lime) everywhere, so a partner's brandColor no longer
// overrides the --brand-* tokens; they always resolve to the unified
// defaults defined in index.css. Kept as a function so callers stay stable.
export function tenantBrandStyle(
  _tenant: Tenant | null | undefined,
): CSSProperties {
  return {};
}

// First letter of the partner name, used for the monogram fallback when a
// partner has no logo image.
export function tenantMonogram(tenant: Tenant | null | undefined): string {
  const name = tenant?.name?.trim();
  if (!name) return "B";
  return name.charAt(0).toUpperCase();
}

import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Convert raw image bytes stored on the canister into a displayable data URL.
// Returns null for empty/zero-length images so callers can show a placeholder.
export function imageBytesToDataUrl(
  bytes: Uint8Array | undefined | null,
): string | null {
  if (!bytes || bytes.length === 0) return null;
  const blob = new Blob([bytes as BlobPart], { type: "image/jpeg" });
  return URL.createObjectURL(blob);
}

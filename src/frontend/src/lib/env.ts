// Runtime environment loader.
//
// env.json is copied verbatim into dist/ at build time (see package.json
// `copy:env`). At app boot we fetch it from the deployed origin so the same
// bundle can run against different environments without rebuilding. The loader
// MUST resolve before React renders — see main.tsx.
//
// Four platform keys are required. If any is missing, empty, or the literal
// string "undefined" (the placeholder written into env.json before deployment),
// the loader throws and the app refuses to boot with a clear message instead
// of silently calling the backend with garbage.
//
// `vps_url` is intentionally NOT required: the Caffeine platform's loadConfig()
// only knows the keys below and overwrites env.json at deploy time, dropping
// any custom key. Requiring vps_url here would make loadEnv() throw on Live
// after every deploy. The VPS client (vps-client.ts) resolves the VPS URL with
// its own fallback chain (env.vps_url → DEV/PROD fallback) so the app boots
// even when vps_url is absent from env.json.
//
// `ii_derivation_origin` is also NOT required: the platform may inject an
// invalid value (missing/empty/"undefined") into env.json at deploy time, which
// previously blocked boot. When the raw value is invalid we derive a safe
// origin from backend_host — the draft domain if backend_host contains
// "-draft.", otherwise the live domain — and fall back to the live domain if
// backend_host is itself invalid. This mirrors the vps_url fallback pattern.

export interface EnvConfig {
  backend_host: string;
  backend_canister_id: string;
  project_id: string;
  ii_derivation_origin: string;
  storage_gateway_url: string;
  vps_url: string;
}

const REQUIRED_KEYS = [
  "backend_host",
  "backend_canister_id",
  "project_id",
  "storage_gateway_url",
] as const satisfies ReadonlyArray<keyof EnvConfig>;

// Domains used to derive ii_derivation_origin when the deployed env.json value
// is invalid. backend_host containing "-draft." selects the draft domain;
// otherwise the live domain is used. The live domain is the final default when
// backend_host is itself invalid.
const II_DERIVATION_ORIGIN_LIVE = "https://bunbohue65-ship-l4d.caffeine.xyz";
const II_DERIVATION_ORIGIN_DRAFT =
  "https://simple-purple-6pr-draft.caffeine.xyz";

// Resolve ii_derivation_origin with a fallback chain mirroring vps_url: if the
// raw value is a valid non-"undefined" string, use it trimmed; otherwise derive
// from backend_host (draft vs live), finally defaulting to the live domain.
function resolveIiDerivationOrigin(
  rawIiDerivationOrigin: unknown,
  backendHost: string,
): string {
  if (
    typeof rawIiDerivationOrigin === "string" &&
    rawIiDerivationOrigin.trim() !== "" &&
    rawIiDerivationOrigin.trim() !== "undefined"
  ) {
    return rawIiDerivationOrigin.trim();
  }
  if (
    typeof backendHost === "string" &&
    backendHost.trim() !== "" &&
    backendHost.trim() !== "undefined"
  ) {
    return backendHost.includes("-draft.")
      ? II_DERIVATION_ORIGIN_DRAFT
      : II_DERIVATION_ORIGIN_LIVE;
  }
  return II_DERIVATION_ORIGIN_LIVE;
}

// A value is invalid if it is not a string, empty after trim, or the literal
// "undefined" placeholder that the build pipeline writes before real values
// are injected at deploy time.
function isInvalidValue(value: unknown): boolean {
  return (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.trim() === "undefined"
  );
}

// Validate a raw parsed object against the required-key contract. Returns the
// list of offending keys so the caller can surface them in the error message.
function findInvalidKeys(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) {
    return [...REQUIRED_KEYS];
  }
  const record = raw as Record<string, unknown>;
  const invalid: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (!(key in record) || isInvalidValue(record[key])) {
      invalid.push(key);
    }
  }
  return invalid;
}

let cachedConfig: EnvConfig | null = null;

// Fetch and validate /env.json. Resolves to a typed config object. Throws an
// Error with a human-readable message if the file cannot be loaded or any
// required key is missing/empty/"undefined". Safe to call multiple times —
// the first successful result is cached for the lifetime of the page.
export async function loadEnv(): Promise<EnvConfig> {
  if (cachedConfig) return cachedConfig;

  let response: Response;
  try {
    response = await fetch("/env.json", { cache: "no-store" });
  } catch {
    throw new Error(
      "Không thể tải cấu hình môi trường (env.json). Vui lòng kiểm tra kết nối mạng và tải lại trang.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Không tìm thấy tệp cấu hình env.json (HTTP ${response.status}). Vui lòng liên hệ quản trị viên.`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error(
      "Tệp env.json không hợp lệ (lỗi định dạng JSON). Vui lòng liên hệ quản trị viên.",
    );
  }

  const invalid = findInvalidKeys(raw);
  if (invalid.length > 0) {
    throw new Error(
      `Cấu hình môi trường chưa được thiết lập đầy đủ. Các khoá còn thiếu hoặc không hợp lệ: ${invalid.join(", ")}. Vui lòng liên hệ quản trị viên để cấu hình trước khi sử dụng ứng dụng.`,
    );
  }

  const record = raw as Record<string, string>;
  // vps_url is optional in env.json (platform may drop it on deploy); default
  // to empty string so the VPS client's fallback chain takes over. The 4
  // required keys above are guaranteed present and valid by findInvalidKeys.
  // ii_derivation_origin is also optional (platform may inject an invalid
  // value at deploy); resolve it with a fallback chain so boot never blocks.
  const vpsUrlRaw = record.vps_url;
  const iiDerivationOriginRaw = record.ii_derivation_origin;
  cachedConfig = {
    backend_host: record.backend_host.trim(),
    backend_canister_id: record.backend_canister_id.trim(),
    project_id: record.project_id.trim(),
    ii_derivation_origin: resolveIiDerivationOrigin(
      iiDerivationOriginRaw,
      record.backend_host,
    ),
    storage_gateway_url: record.storage_gateway_url.trim(),
    vps_url:
      typeof vpsUrlRaw === "string" && vpsUrlRaw.trim() !== "undefined"
        ? vpsUrlRaw.trim()
        : "",
  };

  return cachedConfig;
}

// Synchronous accessor for the already-loaded config. Returns null if
// loadEnv() has not yet resolved. Components should prefer awaiting loadEnv()
// at boot; this accessor is a convenience for code paths that run only after
// the app has booted (and can reasonably throw on null).
export function getEnv(): EnvConfig | null {
  return cachedConfig;
}

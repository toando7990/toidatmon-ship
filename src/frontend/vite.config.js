import { fileURLToPath, URL } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import environment from "vite-plugin-environment";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const ii_url =
  process.env.DFX_NETWORK === "local"
    ? `http://uqzsh-gqaaa-aaaaq-qaada-cai.localhost:8081/authorize`
    : `https://id.ai/authorize`;

process.env.II_URL = process.env.II_URL || ii_url;
process.env.STORAGE_GATEWAY_URL =
  process.env.STORAGE_GATEWAY_URL || "https://blob.caffeine.ai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_JSON_PATH = resolve(__dirname, "env.json");

// Build-time precheck: fail `vite build` if env.json contains any value that
// is empty or the literal string "undefined" (the placeholder written before
// real values are injected at deploy time). This catches misconfigured
// deployments before they ship. Dev mode is intentionally NOT checked —
// developers may run with placeholders locally.
function envPrecheckPlugin() {
  return {
    name: "env-json-precheck",
    apply: "build",
    buildStart() {
      let raw;
      try {
        raw = readFileSync(ENV_JSON_PATH, "utf8");
      } catch {
        this.error(
          `[env-json-precheck] Không tìm thấy tệp env.json tại ${ENV_JSON_PATH}. ` +
            "Tạo tệp với 5 khoá: backend_host, backend_canister_id, project_id, " +
            "ii_derivation_origin, storage_gateway_url.",
        );
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        this.error(
          `[env-json-precheck] env.json không hợp lệ (lỗi JSON): ${e.message}`,
        );
        return;
      }

      const required = [
        "backend_host",
        "backend_canister_id",
        "project_id",
        "ii_derivation_origin",
        "storage_gateway_url",
      ];
      const invalid = required.filter((key) => {
        const v = parsed[key];
        return (
          typeof v !== "string" || v.trim() === "" || v.trim() === "undefined"
        );
      });

      if (invalid.length > 0) {
        this.error(
          `[env-json-precheck] Build bị huỷ — env.json có giá trị chưa được ` +
            `cấu hình (rỗng hoặc "undefined") cho các khoá: ${invalid.join(", ")}. ` +
            "Vui lòng điền giá trị thật trước khi build production.",
        );
      }
    },
  };
}

export default defineConfig({
  logLevel: "error",
  build: {
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4943",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    environment("all", { prefix: "CANISTER_" }),
    environment("all", { prefix: "DFX_" }),
    environment(["II_URL"]),
    environment(["STORAGE_GATEWAY_URL"]),
    envPrecheckPlugin(),
    react(),
  ],
  resolve: {
    alias: [
      {
        find: "declarations",
        replacement: fileURLToPath(new URL("../declarations", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
    dedupe: ["@icp-sdk/core"]
  },
});

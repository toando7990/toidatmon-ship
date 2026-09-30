import { ErrorBoundary } from "@/components/ErrorBoundary";
import { InternetIdentityProvider } from "@caffeineai/core-infrastructure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadEnv } from "./lib/env";
import "./index.css";

BigInt.prototype.toJSON = function () {
  return this.toString();
};

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

const queryClient = new QueryClient();

// Friendly Vietnamese error screen shown when env.json cannot be loaded or
// validated. Rendered into #root before React mounts so the user never sees a
// blank white page. Uses inline styles (not Tailwind) because index.css may
// not have loaded yet and we must not depend on the design system being ready.
function renderEnvError(message: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:#faf8f3;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:32rem;width:100%;background:#fff;border:1px solid #e6e0d4;border-radius:0.75rem;padding:2rem;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
          <div style="width:2.5rem;height:2.5rem;border-radius:9999px;background:#b91c1c;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.25rem;flex-shrink:0;">!</div>
          <h1 style="font-size:1.25rem;font-weight:700;color:#1a1a1a;margin:0;">Không thể khởi động ứng dụng</h1>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0 0 1.25rem;">${message}</p>
        <button
          type="button"
          data-ocid="env_error.retry_button"
          style="background:#b91c1c;color:#fff;border:none;border-radius:0.5rem;padding:0.625rem 1.25rem;font-size:0.95rem;font-weight:600;cursor:pointer;"
        >
          Tải lại trang
        </button>
      </div>
    </div>
  `;
  const btn = root.querySelector<HTMLButtonElement>(
    '[data-ocid="env_error.retry_button"]',
  );
  if (btn) {
    btn.addEventListener("click", () => window.location.reload());
  }
}

// Boot sequence: load + validate env.json BEFORE mounting React. If the loader
// throws, show a friendly error screen instead of crashing to a blank page.
// The ErrorBoundary wraps the entire app so any render-time throw (including
// from providers or route components) shows the error card instead of a blank
// white screen. Note: a module-eval throw during static import resolution
// happens before this code runs and is NOT catchable here — that is why
// vps-client.ts and all other modules must never throw at top level.
loadEnv()
  .then(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <InternetIdentityProvider>
            <App />
          </InternetIdentityProvider>
        </QueryClientProvider>
      </ErrorBoundary>,
    );
  })
  .catch((err: unknown) => {
    const message =
      err instanceof Error
        ? err.message
        : "Lỗi không xác định khi tải cấu hình môi trường.";
    renderEnvError(message);
  });

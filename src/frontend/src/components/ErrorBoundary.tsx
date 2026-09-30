// React ErrorBoundary — catches render-time throws from anywhere in the tree
// and shows a friendly Vietnamese error card instead of a blank white screen.
//
// Used in two places:
//   1. main.tsx — wraps the entire app (providers + App) so a throw during
//      provider init or root render is caught.
//   2. App.tsx — wraps RouterProvider so a throw inside a route component is
//      caught without unmounting the providers (Toaster stays available).
//
// The fallback uses inline styles (not Tailwind) for the same reason as
// renderEnvError in main.tsx: we cannot assume the design system / index.css
// is in a usable state when a render error occurs.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  // Optional override for the error card heading. Defaults to a generic
  // "something went wrong" message.
  heading?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console for diagnostics. In production this could be forwarded to
    // a monitoring endpoint, but we intentionally do not surface the component
    // stack to the user.
    console.error("ErrorBoundary caught a render error:", error, info);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleDismiss = (): void => {
    // Reset boundary so the app attempts to re-render the children. If the
    // underlying error persists, the boundary will catch again on next render.
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const heading = this.props.heading ?? "Ứng dụng gặp lỗi";
    // Show a short, user-friendly message. Avoid leaking raw error text in
    // production; in dev the message helps debugging.
    const isDev = import.meta.env.DEV;
    const detail = isDev
      ? (this.state.error?.message ?? "Không có thông tin chi tiết.")
      : "Vui lòng tải lại trang. Nếu lỗi vẫn tiếp diễn, liên hệ quản trị viên.";

    return (
      <div
        data-ocid="error_boundary.state"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#faf8f3",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "32rem",
            width: "100%",
            background: "#fff",
            border: "1px solid #e6e0d4",
            borderRadius: "0.75rem",
            padding: "2rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                width: "2.5rem",
                height: "2.5rem",
                borderRadius: "9999px",
                background: "#b91c1c",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "1.25rem",
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              !
            </div>
            <h1
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#1a1a1a",
                margin: 0,
              }}
            >
              {heading}
            </h1>
          </div>
          <p
            style={{ color: "#525252", lineHeight: 1.6, margin: "0 0 1.25rem" }}
          >
            {detail}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              data-ocid="error_boundary.retry_button"
              onClick={this.handleReload}
              style={{
                background: "#b91c1c",
                color: "#fff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.625rem 1.25rem",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              Tải lại trang
            </button>
            <button
              type="button"
              data-ocid="error_boundary.dismiss_button"
              onClick={this.handleDismiss}
              style={{
                background: "transparent",
                color: "#525252",
                border: "1px solid #e6e0d4",
                borderRadius: "0.5rem",
                padding: "0.625rem 1.25rem",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;

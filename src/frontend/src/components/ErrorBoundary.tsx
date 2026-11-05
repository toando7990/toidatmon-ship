// React ErrorBoundary — catches render-time throws from anywhere in the tree
// and shows a friendly Vietnamese error card instead of a blank white screen.
//
// Used in two places:
//   1. main.tsx — wraps the entire app (providers + App) so a throw during
//      provider init or root render is caught.
//   2. App.tsx — wraps RouterProvider so a throw inside a route component is
//      caught without unmounting the providers (Toaster stays available).
//
// The fallback uses the shared StateScreen (brand tokens + fonts from
// index.css, which is imported by main.tsx before any render). Its actions
// are plain buttons only — no router Link — because the boundary may sit
// outside RouterProvider.

import { StateScreen } from "@/components/AppStates";
import { RefreshCw, RotateCcw } from "lucide-react";
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
      <div className="min-h-screen bg-background font-body text-foreground">
        <StateScreen
          variant="error"
          ocid="error_boundary.state"
          className="min-h-screen"
          title={heading}
          description={<span className="break-words">{detail}</span>}
          primaryAction={{
            label: "Tải lại trang",
            icon: RefreshCw,
            onClick: this.handleReload,
            ocid: "error_boundary.retry_button",
          }}
          secondaryAction={{
            label: "Thử lại",
            icon: RotateCcw,
            onClick: this.handleDismiss,
            ocid: "error_boundary.dismiss_button",
          }}
        />
      </div>
    );
  }
}

export default ErrorBoundary;

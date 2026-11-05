// Mẫu màn hình trạng thái dùng chung: biểu tượng → tiêu đề → mô tả → nút.
// Biến thể: cần đăng nhập, không có quyền, trống, lỗi, không tìm thấy, cảnh
// báo. Dùng lớp .state-* trong index.css; nút dùng .btn-* như mọi nơi khác.

import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CircleAlert,
  Inbox,
  Loader2,
  type LucideIcon,
  SearchX,
  ShieldX,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

export type StateVariant =
  | "signin"
  | "forbidden"
  | "empty"
  | "error"
  | "notFound"
  | "warning";

const VARIANTS: Record<StateVariant, { icon: LucideIcon; tone: string }> = {
  signin: { icon: UserRound, tone: "" },
  forbidden: { icon: ShieldX, tone: "state-icon-destructive" },
  empty: { icon: Inbox, tone: "state-icon-muted" },
  error: { icon: CircleAlert, tone: "state-icon-destructive" },
  notFound: { icon: SearchX, tone: "state-icon-muted" },
  warning: { icon: AlertTriangle, tone: "state-icon-warning" },
};

export interface StateAction {
  label: ReactNode;
  /** Nút thường. */
  onClick?: () => void;
  /** Liên kết trong app (TanStack Router). */
  to?: string;
  /** Liên kết tải lại trang / ngoài app. */
  href?: string;
  icon?: LucideIcon;
  ocid?: string;
  disabled?: boolean;
  busy?: boolean;
}

function ActionControl({
  action,
  kind,
}: {
  action: StateAction;
  kind: "primary" | "outline";
}) {
  const Icon = action.busy ? Loader2 : action.icon;
  const cls = cn(
    "btn w-full sm:w-auto",
    kind === "primary" ? "btn-primary" : "btn-outline",
    action.busy && "is-busy",
  );
  const content = (
    <>
      {Icon && (
        <Icon
          className={cn("h-4 w-4", action.busy && "animate-spin")}
          aria-hidden="true"
        />
      )}
      {action.label}
    </>
  );
  if (action.to) {
    return (
      <Link to={action.to} className={cls} data-ocid={action.ocid}>
        {content}
      </Link>
    );
  }
  if (action.href) {
    return (
      <a href={action.href} className={cls} data-ocid={action.ocid}>
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.busy}
      aria-busy={action.busy || undefined}
      className={cls}
      data-ocid={action.ocid}
    >
      {content}
    </button>
  );
}

export function StateScreen({
  variant,
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  children,
  layout = "screen",
  ocid,
  className,
}: {
  variant: StateVariant;
  /** Đổi biểu tượng mặc định của biến thể. */
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: StateAction;
  secondaryAction?: StateAction;
  /** Nội dung phụ dưới mô tả (vd. mã đường dẫn). */
  children?: ReactNode;
  /** screen = thẻ giữa màn hình; inline = trong một khối trang. */
  layout?: "screen" | "inline";
  ocid?: string;
  className?: string;
}) {
  const v = VARIANTS[variant];
  const Icon = icon ?? v.icon;
  const body = (
    <>
      <div className={cn("state-icon", v.tone)} aria-hidden="true">
        <Icon className="h-7 w-7" />
      </div>
      <h1 className="state-title">{title}</h1>
      {description && <p className="state-desc">{description}</p>}
      {children}
      {(primaryAction || secondaryAction) && (
        <div className="state-actions">
          {primaryAction && (
            <ActionControl action={primaryAction} kind="primary" />
          )}
          {secondaryAction && (
            <ActionControl action={secondaryAction} kind="outline" />
          )}
        </div>
      )}
    </>
  );

  if (layout === "inline") {
    return (
      <div className={cn("state-inline", className)} data-ocid={ocid}>
        {body}
      </div>
    );
  }
  return (
    <section className={cn("state-screen", className)} data-ocid={ocid}>
      <div className="state-card animate-fade-rise">{body}</div>
    </section>
  );
}

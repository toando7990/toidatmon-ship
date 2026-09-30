// StatCard — KPI card hiển thị một số liệu (label, value, icon).
// Sử dụng bento-box style: card bo góc, icon trong khối accent, value font-display lớn.

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  tone?: "primary" | "success" | "warning" | "info";
  testId?: string;
}

const TONE_STYLES: Record<
  NonNullable<StatCardProps["tone"]>,
  { iconWrap: string; value: string }
> = {
  primary: {
    iconWrap: "bg-primary/10 text-primary",
    value: "text-primary",
  },
  success: {
    iconWrap: "bg-success/15 text-success",
    value: "text-success",
  },
  warning: {
    iconWrap: "bg-warning/20 text-warning-foreground",
    value: "text-warning-foreground",
  },
  info: {
    iconWrap: "bg-info/15 text-info",
    value: "text-info",
  },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "primary",
  testId,
}: StatCardProps) {
  const styles = TONE_STYLES[tone];
  return (
    <div
      data-ocid={testId ?? "stat.card"}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition-smooth hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            styles.iconWrap,
          )}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span
          className={cn(
            "font-display text-2xl font-bold tracking-tight md:text-3xl",
            styles.value,
          )}
        >
          {value}
        </span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

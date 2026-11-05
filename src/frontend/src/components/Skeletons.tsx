// Khung chờ (skeleton) dùng chung — thay cho mọi dòng chữ "Đang tải…".
// Dùng các lớp .skeleton-* trong index.css (hiệu ứng shimmer, tắt khi người
// dùng bật giảm chuyển động). Mỗi khối có aria-busy + nhãn đọc màn hình.

import { cn } from "@/lib/utils";

function ids(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
}

/** Khối chờ cơ bản — đặt kích thước bằng className (h-*, w-*). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

/** Vài dòng chữ chờ; dòng cuối ngắn hơn. */
export function SkeletonLines({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  const list = ids("line", lines);
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {list.map((id, i) => (
        <div
          key={id}
          className={cn(
            "skeleton-text",
            i === list.length - 1 && lines > 1 && "w-3/5",
          )}
        />
      ))}
    </div>
  );
}

/** Thẻ chờ: (ảnh tròn) + tiêu đề + dòng mô tả. */
export function SkeletonCard({
  media = false,
  avatar = false,
  lines = 2,
  className,
}: {
  media?: boolean;
  avatar?: boolean;
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("skeleton-card", className)} aria-hidden="true">
      {media && <div className="skeleton mb-3 aspect-[16/10] w-full" />}
      <div className="flex items-start gap-3">
        {avatar && <div className="skeleton-circle shrink-0" />}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="skeleton-title" />
          <SkeletonLines lines={lines} />
        </div>
      </div>
    </div>
  );
}

/** Danh sách thẻ chờ. */
export function SkeletonList({
  count = 3,
  avatar = true,
  label = "Đang tải…",
  ocid,
  className,
}: {
  count?: number;
  avatar?: boolean;
  label?: string;
  ocid?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      aria-busy="true"
      aria-live="polite"
      data-ocid={ocid}
    >
      <span className="sr-only">{label}</span>
      {ids("card", count).map((id) => (
        <SkeletonCard key={id} avatar={avatar} />
      ))}
    </div>
  );
}

/** Lưới thẻ chờ (món ăn, KPI…). */
export function SkeletonGrid({
  count = 6,
  media = true,
  className,
}: {
  count?: number;
  media?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", className)}
      aria-busy="true"
    >
      <span className="sr-only">Đang tải…</span>
      {ids("grid", count).map((id) => (
        <SkeletonCard key={id} media={media} lines={1} />
      ))}
    </div>
  );
}

/** Bảng chờ: hàng đầu + các hàng dữ liệu. */
export function SkeletonTable({
  rows = 5,
  cols = 4,
  ocid,
  className,
}: {
  rows?: number;
  cols?: number;
  ocid?: string;
  className?: string;
}) {
  const colIds = ids("col", cols);
  return (
    <div
      className={cn("surface-card overflow-hidden", className)}
      aria-busy="true"
      data-ocid={ocid}
    >
      <span className="sr-only">Đang tải…</span>
      <div className="flex gap-4 bg-muted/60 px-3 py-3" aria-hidden="true">
        {colIds.map((id) => (
          <div key={id} className="skeleton h-3 flex-1 bg-border" />
        ))}
      </div>
      {ids("row", rows).map((rowId) => (
        <div
          key={rowId}
          className="flex gap-4 border-t border-border px-3 py-3.5"
          aria-hidden="true"
        >
          {colIds.map((id, i) => (
            <div
              key={id}
              className={cn("skeleton-text flex-1", i === 0 && "max-w-[30%]")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Khung chờ cả trang: tiêu đề + mô tả + danh sách thẻ. */
export function PageSkeleton({
  ocid,
  label = "Đang tải…",
  cards = 3,
  className,
}: {
  ocid?: string;
  label?: string;
  cards?: number;
  className?: string;
}) {
  return (
    <section
      className={cn("page-container py-8 md:py-10", className)}
      aria-busy="true"
      aria-live="polite"
      data-ocid={ocid}
    >
      <span className="sr-only">{label}</span>
      <div className="mb-6 flex flex-col gap-2.5" aria-hidden="true">
        <div className="skeleton h-7 w-56 max-w-[70%]" />
        <div className="skeleton-text w-80 max-w-[85%]" />
      </div>
      <div className="flex flex-col gap-3" aria-hidden="true">
        {ids("page", cards).map((id) => (
          <SkeletonCard key={id} avatar />
        ))}
      </div>
    </section>
  );
}

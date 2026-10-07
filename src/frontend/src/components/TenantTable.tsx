// Bảng đối tác (tenant) — admin trung tâm.
// Cột: ĐỐI TÁC (pháp nhân: tên pháp lý, loại hình, MST) · thương hiệu (logo,
// tên, tên miền) · số nhà hàng · liên hệ của đối tác · trạng thái · thao tác.
// Responsive: card list trên mobile, table trên md+.
// UI tiếng Việt.

import type { PartnerEntry } from "@/hooks/usePartnerDirectory";
import { BUSINESS_TYPE_LABEL } from "@/lib/partner-applications";
import { partnerPath } from "@/lib/tenant";
import { tenantMonogram } from "@/lib/tenant-branding";
import { cn } from "@/lib/utils";
import type { Tenant } from "@/types";
import { Building2, Eye, EyeOff, Pencil, Store } from "lucide-react";

interface TenantTableProps {
  tenants: Tenant[];
  /** Hồ sơ đối tác + số nhà hàng theo tenantId. */
  directory?: Map<string, PartnerEntry>;
  loading?: boolean;
  /** Đang đổi trạng thái cho tenantId nào (optional UX). */
  togglingId?: string | null;
  onEdit: (t: Tenant) => void;
  onToggleActive: (t: Tenant) => void;
}

// Backend trả createdAt dạng nanosecond bigint — đổi qua ms trước khi tạo Date.
function formatCreatedAt(createdAt: bigint): string {
  const date = new Date(Number(createdAt / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function BrandCell({ tenant }: { tenant: Tenant }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background"
        aria-hidden="true"
      >
        {tenant.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-secondary font-display text-sm font-bold text-foreground">
            {tenantMonogram(tenant)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{tenant.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {partnerPath(tenant.slug)}
        </p>
      </div>
    </div>
  );
}

function PartnerCell({ tenant, e }: { tenant: Tenant; e?: PartnerEntry }) {
  const type = e?.profile ? BUSINESS_TYPE_LABEL[e.profile.businessType] : "";
  return (
    <div className="min-w-0">
      {tenant.companyName ? (
        <p className="truncate font-semibold text-foreground">
          {tenant.companyName}
        </p>
      ) : (
        <p className="text-sm font-medium text-destructive">
          Chưa có tên pháp lý
        </p>
      )}
      <p className="truncate text-xs text-muted-foreground">
        {[type, tenant.taxCode && `MST ${tenant.taxCode}`]
          .filter(Boolean)
          .join(" · ") || "Chưa có MST"}
      </p>
    </div>
  );
}

function ContactCell({ tenant, e }: { tenant: Tenant; e?: PartnerEntry }) {
  const name = e?.profile?.contactName || e?.profile?.representativeName;
  return (
    <div className="min-w-0 text-xs">
      <p className="truncate text-foreground">{name || "—"}</p>
      <p className="truncate font-mono text-muted-foreground">
        {tenant.phone || "—"}
      </p>
    </div>
  );
}

function RestaurantCount({ n }: { n: number | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-foreground">
      <Store className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {n ?? "—"}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        active
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {active ? "Hoạt động" : "Tạm ẩn"}
    </span>
  );
}

export function TenantTable({
  tenants,
  directory,
  loading = false,
  togglingId = null,
  onEdit,
  onToggleActive,
}: TenantTableProps) {
  if (loading) {
    return (
      <div
        className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground"
        data-ocid="tenant.table.loading_state"
      >
        Đang tải danh sách đối tác…
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card p-10 text-center"
        data-ocid="tenant.table.empty_state"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Building2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="font-display text-base font-semibold text-foreground">
            Chưa có đối tác
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Thêm đối tác đầu tiên để cấp trang đặt món và không gian dữ liệu
            riêng.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card list */}
      <ul
        className="space-y-3 md:hidden"
        data-ocid="tenant.table.list"
        aria-label="Danh sách đối tác"
      >
        {tenants.map((t, i) => {
          const isToggling = togglingId === t.tenantId;
          return (
            <li
              key={t.tenantId}
              className="rounded-md border border-border bg-card p-4 shadow-sm"
              data-ocid={`tenant.table.row.${i + 1}`}
            >
              <div className="flex items-start justify-between gap-2">
                <PartnerCell tenant={t} e={directory?.get(t.tenantId)} />
                <StatusBadge active={t.active} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <BrandCell tenant={t} />
                <RestaurantCount n={directory?.get(t.tenantId)?.restaurants} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t.phone || "—"} · tạo {formatCreatedAt(t.createdAt)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleActive(t)}
                  disabled={isToggling}
                  aria-label={t.active ? "Tạm ẩn đối tác" : "Kích hoạt đối tác"}
                  data-ocid={`tenant.table.toggle.${i + 1}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
                >
                  {t.active ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t.active ? "Tạm ẩn" : "Kích hoạt"}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(t)}
                  aria-label="Sửa đối tác"
                  data-ocid={`tenant.table.edit_button.${i + 1}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-secondary"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Sửa
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div
        className="hidden overflow-hidden rounded-md border border-border bg-card shadow-sm md:block"
        data-ocid="tenant.table"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Đối tác
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Thương hiệu
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Nhà hàng
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Liên hệ
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.map((t, i) => {
                const isToggling = togglingId === t.tenantId;
                return (
                  <tr
                    key={t.tenantId}
                    className="transition-smooth hover:bg-secondary/40"
                    data-ocid={`tenant.table.row.${i + 1}`}
                  >
                    <td className="max-w-[260px] px-4 py-3">
                      <PartnerCell tenant={t} e={directory?.get(t.tenantId)} />
                    </td>
                    <td className="px-4 py-3">
                      <BrandCell tenant={t} />
                    </td>
                    <td className="px-4 py-3">
                      <RestaurantCount
                        n={directory?.get(t.tenantId)?.restaurants}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <ContactCell tenant={t} e={directory?.get(t.tenantId)} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge active={t.active} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onToggleActive(t)}
                          disabled={isToggling}
                          aria-label={
                            t.active ? "Tạm ẩn đối tác" : "Kích hoạt đối tác"
                          }
                          aria-pressed={t.active}
                          data-ocid={`tenant.table.toggle.${i + 1}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
                        >
                          {t.active ? (
                            <EyeOff
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {t.active ? "Tạm ẩn" : "Kích hoạt"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(t)}
                          aria-label="Sửa đối tác"
                          data-ocid={`tenant.table.edit_button.${i + 1}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-secondary"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Sửa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

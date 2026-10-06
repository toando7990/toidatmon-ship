// PartnerManager — trang /admin/partners (admin trung tâm).
// Danh sách đối tác (listTenants(false)) + form thêm/sửa (TenantForm) +
// ẩn/hiện (setTenantActive). UI tiếng Việt.
//
// LƯU Ý: route và nav link đã được đăng ký sẵn ở App.tsx/Layout.tsx — file này
// chỉ dựng phần thân trang.

import { CounterPaymentPanel } from "@/components/CounterPaymentPanel";
import { CounterPlanPanel } from "@/components/CounterPlanPanel";
import { TenantForm, type TenantFormValues } from "@/components/TenantForm";
import { TenantTable } from "@/components/TenantTable";
import {
  useCreateTenant,
  useSetTenantActive,
  useTenants,
  useUpdateTenant,
} from "@/hooks/useQueries";
import type { Tenant } from "@/types";
import { Building2, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";

type Mode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; tenant: Tenant };

export default function PartnerManager() {
  const tenantsQuery = useTenants(false);
  const createMutation = useCreateTenant();
  const updateMutation = useUpdateTenant();
  const setActiveMutation = useSetTenantActive();

  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  function notify(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function handleAddSubmit(values: TenantFormValues) {
    createMutation.mutate(values, {
      onSuccess: () => {
        notify("ok", "Đã thêm đối tác");
        setMode({ kind: "list" });
      },
      onError: (e) =>
        notify("err", e instanceof Error ? e.message : "Lỗi khi thêm đối tác"),
    });
  }

  function handleEditSubmit(values: TenantFormValues) {
    if (mode.kind !== "edit") return;
    updateMutation.mutate(
      { tenantId: mode.tenant.tenantId, ...values },
      {
        onSuccess: () => {
          notify("ok", "Đã lưu thay đổi");
          setMode({ kind: "list" });
        },
        onError: (e) =>
          notify("err", e instanceof Error ? e.message : "Lỗi khi lưu"),
      },
    );
  }

  function handleToggleActive(t: Tenant) {
    setActiveMutation.mutate(
      { tenantId: t.tenantId, active: !t.active },
      {
        onSuccess: () =>
          notify("ok", t.active ? "Đã tạm ẩn đối tác" : "Đã kích hoạt đối tác"),
        onError: (e) =>
          notify(
            "err",
            e instanceof Error ? e.message : "Lỗi khi đổi trạng thái",
          ),
      },
    );
  }

  const tenants = tenantsQuery.data ?? [];
  const isAdd = mode.kind === "add";
  const isEdit = mode.kind === "edit";

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6"
      data-ocid="page.partner_manager"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Quản lý đối tác
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tạo và quản lý đối tác: thương hiệu, subdomain, thông tin liên hệ và
            trạng thái hoạt động.
          </p>
        </div>
        {mode.kind === "list" && (
          <button
            type="button"
            onClick={() => setMode({ kind: "add" })}
            data-ocid="tenant.add_button"
            className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm đối tác
          </button>
        )}
      </header>

      {/* Toast */}
      {toast && (
        <output
          data-ocid={`tenant.toast.${toast.kind}`}
          className={
            toast.kind === "ok"
              ? "mt-4 block rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
              : "mt-4 block rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          }
        >
          {toast.msg}
        </output>
      )}

      {/* Add form */}
      {isAdd && (
        <div
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="tenant.add_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Thêm đối tác
            </h2>
            <button
              type="button"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng form thêm"
              data-ocid="tenant.add.close_button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background text-foreground transition-smooth hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <TenantForm
            submitting={createMutation.isPending}
            submitError={
              createMutation.isError
                ? createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Lỗi khi thêm đối tác"
                : null
            }
            onSubmit={handleAddSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {/* Edit form */}
      {isEdit && (
        <div
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="tenant.edit_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Sửa đối tác
            </h2>
            <button
              type="button"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng form sửa"
              data-ocid="tenant.edit.close_button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background text-foreground transition-smooth hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <TenantForm
            initial={mode.tenant}
            submitting={updateMutation.isPending}
            submitError={
              updateMutation.isError
                ? updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Lỗi khi lưu"
                : null
            }
            onSubmit={handleEditSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {/* Table (ẩn khi đang add/edit để tập trung) */}
      {mode.kind === "list" && (
        <div className="mt-6">
          {tenantsQuery.isLoading && (
            <div
              className="flex items-center gap-2 rounded-md border border-border bg-card p-6 text-sm text-muted-foreground"
              data-ocid="tenant.loading_state"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Đang tải danh sách đối tác…
            </div>
          )}
          {tenantsQuery.isError && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive"
              data-ocid="tenant.error_state"
              role="alert"
            >
              Lỗi tải danh sách đối tác:{" "}
              {tenantsQuery.error instanceof Error
                ? tenantsQuery.error.message
                : "Không xác định"}
            </div>
          )}
          {!tenantsQuery.isLoading && !tenantsQuery.isError && (
            <TenantTable
              tenants={tenants}
              loading={false}
              onEdit={(t) => setMode({ kind: "edit", tenant: t })}
              onToggleActive={handleToggleActive}
              togglingId={
                setActiveMutation.isPending
                  ? (setActiveMutation.variables?.tenantId ?? null)
                  : null
              }
            />
          )}
        </div>
      )}

      {mode.kind === "list" && <CounterPlanPanel tenants={tenants} />}
      {mode.kind === "list" && <CounterPaymentPanel tenants={tenants} />}

      {mode.kind === "list" && tenants.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
          Mỗi đối tác có subdomain riêng và không gian dữ liệu tách biệt hoàn
          toàn.
        </p>
      )}
    </section>
  );
}

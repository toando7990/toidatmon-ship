// PartnerDevConsole — máy sàn "Phát triển đối tác": sơ duyệt đơn đăng ký
// (chỉ được "yêu cầu bổ sung" — duyệt / từ chối vẫn là việc của admin) và
// xem (chỉ đọc) thực đơn, chi nhánh, thiết bị của quán để hỗ trợ cài đặt.

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTenants } from "@/hooks/useQueries";
import { listMenus, listRestaurants, useCanister } from "@/lib/canister";
import {
  type PartnerApplication,
  listPartnerApplicationsAs,
  requestApplicationInfo,
} from "@/lib/partner-applications";
import { listTenantDevicesAs } from "@/lib/platform-devices";
import { formatVnd } from "@/lib/platform-feed";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Chờ duyệt", tone: "bg-amber-100 text-amber-800" },
  needsInfo: { label: "Chờ bổ sung", tone: "bg-blue-100 text-blue-800" },
  approved: { label: "Đã duyệt", tone: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Từ chối", tone: "bg-muted text-foreground/70" },
};

function statusOf(a: PartnerApplication): string {
  const s = a.status as unknown;
  return typeof s === "string" ? s : Object.keys(s as object)[0];
}

function ApplicationCard({
  a,
  credential,
}: {
  a: PartnerApplication;
  credential: string;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const st = STATUS[statusOf(a)] ?? STATUS.pending;
  const ask = useMutation({
    mutationFn: () =>
      requestApplicationInfo(
        actor as NonNullable<typeof actor>,
        credential,
        a.applicationId,
        note.trim(),
      ),
    onSuccess: () => {
      toast.success("Đã gửi yêu cầu bổ sung cho đối tác");
      setNote("");
      qc.invalidateQueries({ queryKey: ["san", "applications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const i = a.input;
  const rows: Array<[string, string]> = [
    ["Đối tác", `${i.legalName} · MST ${i.taxCode || "—"}`],
    ["Người đại diện", i.representativeName],
    ["Địa chỉ trụ sở", i.headOfficeAddress || "— (đơn cũ)"],
    ["Liên hệ", `${i.contactName} · ${i.contactPhone} · ${i.contactEmail}`],
    ["Hoá đơn điện tử", i.usesEInvoice ? "Có" : "Chưa"],
    ["Món chính", i.cuisine],
    ["Số nhà hàng", String(i.branchCount)],
    ["Nhà hàng chính", i.storeAddress],
  ];
  return (
    <article
      className="rounded-2xl border bg-card p-3 text-[13px]"
      data-ocid="san_partner.application"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <b className="min-w-0 flex-1 truncate text-[14.5px]">
          {i.brandName}{" "}
          <span className="font-normal text-muted-foreground">
            · {i.desiredSlug}.toidatmon.vn
          </span>
        </b>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11.5px] font-bold",
            st.tone,
          )}
        >
          {st.label}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {a.adminNote && (
            <p className="rounded-lg bg-muted p-2">
              Ghi chú trước: {a.adminNote}
            </p>
          )}
          {statusOf(a) !== "approved" && statusOf(a) !== "rejected" && (
            <>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Quán cần bổ sung gì? VD: ảnh giấy phép kinh doanh, số tài khoản đúng tên pháp nhân"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Duyệt / từ chối do admin quyết định.
                </span>
                <Button
                  size="sm"
                  disabled={!note.trim() || ask.isPending}
                  onClick={() => ask.mutate()}
                >
                  {ask.isPending && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  )}
                  Yêu cầu bổ sung
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function StoreView({ credential }: { credential: string }) {
  const { actor, isFetching } = useCanister();
  const ready = !!actor && !isFetching;
  const tenantsQ = useTenants(false);
  const [tenantId, setTenantId] = useState("");
  const restQ = useQuery({
    queryKey: ["san", "rest", tenantId],
    queryFn: () =>
      listRestaurants(actor as NonNullable<typeof actor>, tenantId),
    enabled: ready && !!tenantId,
  });
  const menuQ = useQuery({
    queryKey: ["san", "menu", tenantId],
    queryFn: () => listMenus(actor as NonNullable<typeof actor>, tenantId),
    enabled: ready && !!tenantId,
  });
  const devQ = useQuery({
    queryKey: ["san", "devices", tenantId],
    queryFn: () =>
      listTenantDevicesAs(
        actor as NonNullable<typeof actor>,
        credential,
        tenantId,
      ),
    enabled: ready && !!tenantId,
  });
  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-12 items-center gap-2 rounded-xl border bg-card px-3">
        <Store className="h-4 w-4 text-muted-foreground" />
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          aria-label="Chọn quán"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        >
          <option value="">Chọn quán để xem…</option>
          {(tenantsQ.data ?? []).map((t) => (
            <option key={t.tenantId} value={t.tenantId}>
              {t.name}
              {t.active ? "" : " (tạm dừng)"}
            </option>
          ))}
        </select>
      </label>
      {tenantId && (
        <div className="grid gap-3 lg:grid-cols-3">
          <section className="rounded-2xl border bg-card p-3.5 text-sm">
            <h3 className="mb-2 font-extrabold">
              Chi nhánh ({restQ.data?.length ?? "…"})
            </h3>
            {(restQ.data ?? []).map((r) => (
              <p key={r.restaurantId} className="border-t py-1.5">
                <b>{r.name}</b>
                {!r.visible && (
                  <span className="text-muted-foreground"> · đang ẩn</span>
                )}
                <br />
                <span className="text-muted-foreground">
                  {r.address} · {r.phone || "chưa có SĐT"}
                  {r.lat === 0 && r.lng === 0 && " · CHƯA GHIM TOẠ ĐỘ"}
                </span>
              </p>
            ))}
          </section>
          <section className="rounded-2xl border bg-card p-3.5 text-sm">
            <h3 className="mb-2 font-extrabold">
              Thực đơn ({menuQ.data?.length ?? "…"} món)
            </h3>
            <div className="max-h-80 overflow-y-auto">
              {(menuQ.data ?? []).map((m) => (
                <p
                  key={m.itemId}
                  className={cn(
                    "flex gap-2 border-t py-1.5",
                    !m.visible && "opacity-50",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {m.name}{" "}
                    <span className="text-muted-foreground">
                      · {m.category || "chưa có danh mục"}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatVnd(Number(m.price))}
                  </span>
                </p>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border bg-card p-3.5 text-sm">
            <h3 className="mb-2 font-extrabold">
              Thiết bị ({devQ.data?.filter((d) => d.active).length ?? "…"} đang
              dùng)
            </h3>
            {devQ.isError && (
              <p className="text-destructive">
                {(devQ.error as Error).message}
              </p>
            )}
            {(devQ.data ?? []).map((d) => (
              <p key={d.deviceId} className="border-t py-1.5">
                <b>{d.name || d.deviceId}</b>{" "}
                <span className="text-muted-foreground">
                  · {d.role}
                  {!d.active && " · đã thu hồi"}
                </span>
              </p>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

export function PartnerDevConsole({ credential }: { credential: string }) {
  const { actor, isFetching } = useCanister();
  const [tab, setTab] = useState<"apps" | "stores">("apps");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const appsQ = useQuery({
    queryKey: ["san", "applications"],
    queryFn: () =>
      listPartnerApplicationsAs(
        actor as NonNullable<typeof actor>,
        credential,
        null,
      ),
    enabled: !!actor && !isFetching,
  });
  const apps = (appsQ.data ?? [])
    .filter(
      (a) => filter === "all" || ["pending", "needsInfo"].includes(statusOf(a)),
    )
    .sort((x, y) => Number(y.createdAt - x.createdAt));
  return (
    <div className="flex flex-col gap-3" data-ocid="san_partner.page">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["apps", "Đơn đăng ký"],
            ["stores", "Xem quán"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "h-10 rounded-xl border px-3.5 text-sm font-bold",
              tab === k
                ? "border-foreground bg-foreground text-background"
                : "bg-card",
            )}
          >
            {l}
          </button>
        ))}
        {tab === "apps" && (
          <button
            type="button"
            onClick={() => setFilter(filter === "open" ? "all" : "open")}
            className="ml-auto h-10 rounded-xl border bg-card px-3 text-sm font-semibold"
          >
            {filter === "open" ? "Đang chờ xử lý" : "Tất cả"}
          </button>
        )}
      </div>
      {tab === "stores" ? (
        <StoreView credential={credential} />
      ) : appsQ.isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      ) : appsQ.isError ? (
        <p className="text-sm text-destructive">
          {(appsQ.error as Error).message}
        </p>
      ) : apps.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Không có đơn đăng ký nào đang chờ.
        </p>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {apps.map((a) => (
            <ApplicationCard
              key={a.applicationId}
              a={a}
              credential={credential}
            />
          ))}
        </div>
      )}
    </div>
  );
}

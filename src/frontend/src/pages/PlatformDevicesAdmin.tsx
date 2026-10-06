// PlatformDevicesAdmin — /admin/thiet-bi-san (admin Tôi Đặt Món): máy của
// nhân viên sàn (không thuộc quán nào). 6 thẻ vai trò, danh sách máy đã kích
// hoạt (dùng gần nhất, thu hồi), tạo mã kích hoạt dùng 1 lần (hạn 24 giờ,
// kèm QR) — nhân viên mở toidatmon.vn/san trên máy cần cấp rồi nhập mã.
// Giao diện đã duyệt 06/10/2026.

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCanister } from "@/lib/canister";
import {
  PLATFORM_ROLES,
  type PlatformActivation,
  type PlatformDeviceView,
  type PlatformRole,
  ROLE_INFO,
  cancelPlatformActivation,
  createPlatformActivation,
  formatCode,
  hasPlatformDeviceApi,
  isStale,
  lastSeenLabel,
  listPlatformActivations,
  listPlatformDevices,
  revokePlatformDevice,
} from "@/lib/platform-devices";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Lock, MonitorCog, Plus, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const QK = ["platform-devices"];

export function RoleChip({ role }: { role: PlatformRole }) {
  const r = ROLE_INFO[role];
  const Icon = r.icon;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ color: r.color, background: r.bg }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {r.name}
    </span>
  );
}

function activationUrl(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/san?ma=${formatCode(code)}`;
}

function CreateSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const [role, setRole] = useState<PlatformRole>("ops");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<PlatformActivation | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!actor) throw new Error("Chưa kết nối");
      return createPlatformActivation(actor, role, note.trim());
    },
    onSuccess: (a) => {
      setCreated(a);
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setCreated(null);
      setNote("");
    }
  }

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Tạo mã kích hoạt thiết bị sàn</SheetTitle>
          <SheetDescription>
            Mã dùng 1 lần, hết hạn sau 24 giờ. Máy kích hoạt chỉ thấy đúng chức
            năng của vai trò được cấp.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <fieldset disabled={!!created} className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-bold">Vai trò</legend>
            {PLATFORM_ROLES.map((k) => {
              const r = ROLE_INFO[k];
              const Icon = r.icon;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={role === k}
                  onClick={() => setRole(k)}
                  className={cn(
                    "flex min-h-[52px] items-center gap-2.5 rounded-xl border-[1.5px] px-3 py-2 text-left",
                    role === k
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted",
                  )}
                  data-ocid={`platform_devices.role_option.${k}`}
                >
                  <span
                    className={cn(
                      "h-4 w-4 shrink-0 rounded-full border-2",
                      role === k ? "border-[5px] border-primary" : "",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: r.bg, color: r.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.can.join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
          </fieldset>
          <div>
            <label
              htmlFor="san-note"
              className="mb-1.5 block text-sm font-bold"
            >
              Ghi chú máy (tuỳ chọn)
            </label>
            <Input
              id="san-note"
              value={note}
              disabled={!!created}
              onChange={(e) => setNote(e.target.value)}
              maxLength={80}
              placeholder="VD: CSKH — Zalo ca tối"
              className="h-11"
            />
          </div>

          {created ? (
            <>
              <div
                className="flex items-center gap-4 rounded-2xl bg-foreground p-4 text-background"
                data-ocid="platform_devices.created_code"
              >
                <div className="shrink-0 rounded-lg bg-white p-1.5">
                  <QRCodeSVG value={activationUrl(created.code)} size={84} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs opacity-75">
                    Mã kích hoạt · hết hạn sau 24 giờ
                  </p>
                  <p className="font-mono text-3xl font-bold tracking-widest">
                    {formatCode(created.code)}
                  </p>
                  <p className="text-xs opacity-75">
                    Mở toidatmon.vn/san trên máy cần cấp → nhập mã hoặc quét QR
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(activationUrl(created.code))
                      .then(() => toast.success("Đã sao chép link kích hoạt"));
                  }}
                >
                  <Copy className="mr-1.5 h-4 w-4" /> Sao chép link
                </Button>
                <Button className="h-11 flex-1" onClick={() => close(false)}>
                  Xong
                </Button>
              </div>
            </>
          ) : (
            <Button
              className="h-11"
              disabled={create.isPending}
              onClick={() => create.mutate()}
              data-ocid="platform_devices.create_submit"
            >
              {create.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Tạo mã
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type Filter = "all" | "active" | "stale" | "revoked";

export default function PlatformDevicesAdmin() {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const apiReady = ready && hasPlatformDeviceApi(actor);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [revoking, setRevoking] = useState<PlatformDeviceView | null>(null);

  const devicesQ = useQuery({
    queryKey: [...QK, "devices"],
    queryFn: () => listPlatformDevices(actor as NonNullable<typeof actor>),
    enabled: apiReady,
  });
  const codesQ = useQuery({
    queryKey: [...QK, "codes"],
    queryFn: () => listPlatformActivations(actor as NonNullable<typeof actor>),
    enabled: apiReady,
  });
  const devices = devicesQ.data ?? [];
  const countBy = useMemo(() => {
    const m = new Map<PlatformRole, number>();
    for (const d of devices) {
      if (d.active) m.set(d.role, (m.get(d.role) ?? 0) + 1);
    }
    return m;
  }, [devices]);
  const shown = devices.filter((d) =>
    filter === "all"
      ? d.active
      : filter === "revoked"
        ? !d.active
        : d.active && (filter === "stale") === isStale(d.lastSeenAt),
  );

  const revoke = useMutation({
    mutationFn: (id: string) =>
      revokePlatformDevice(actor as NonNullable<typeof actor>, id),
    onSuccess: () => {
      toast.success("Đã thu hồi máy");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setRevoking(null),
  });
  const cancelCode = useMutation({
    mutationFn: (code: string) =>
      cancelPlatformActivation(actor as NonNullable<typeof actor>, code),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: (e: Error) => toast.error(e.message),
  });

  const FILTERS: Array<[Filter, string]> = [
    ["all", `Đang dùng (${devices.filter((d) => d.active).length})`],
    ["stale", "Lâu không dùng"],
    ["revoked", "Đã thu hồi"],
  ];

  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6"
      data-ocid="platform_devices.page"
    >
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <MonitorCog className="h-6 w-6 text-primary" aria-hidden="true" />
            Thiết bị sàn
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Máy của nhân viên Tôi Đặt Món (không thuộc quán nào). Mỗi máy kích
            hoạt bằng mã một lần và chỉ thấy đúng chức năng của vai trò được
            cấp.
          </p>
        </div>
        <Button
          className="h-11"
          disabled={!apiReady}
          onClick={() => setCreating(true)}
          data-ocid="platform_devices.create_button"
        >
          <Plus className="mr-1 h-4 w-4" /> Tạo mã kích hoạt
        </Button>
      </div>

      {ready && !apiReady && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Hệ thống đang cập nhật — chức năng thiết bị sàn có sau lần build kế
          tiếp.
        </p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORM_ROLES.map((k) => {
          const r = ROLE_INFO[k];
          const Icon = r.icon;
          return (
            <div
              key={k}
              className="flex flex-col gap-2 rounded-2xl border bg-card p-3.5"
              data-ocid={`platform_devices.role_card.${k}`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: r.bg, color: r.color }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex flex-col">
                  <span className="font-extrabold">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {countBy.get(k) ?? 0} thiết bị đang dùng
                  </span>
                </span>
              </div>
              <p className="text-[13px] leading-snug text-foreground/80">
                {r.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {r.can.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-bold text-[var(--tdm-olive)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {(codesQ.data?.length ?? 0) > 0 && (
        <section className="mb-6" data-ocid="platform_devices.codes">
          <h2 className="mb-2 text-base font-extrabold">
            Mã chưa dùng ({codesQ.data?.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {codesQ.data?.map((a) => (
              <span
                key={a.code}
                className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm"
              >
                <span className="font-mono font-bold">
                  {formatCode(a.code)}
                </span>
                <RoleChip role={a.role} />
                {a.note && (
                  <span className="text-xs text-muted-foreground">
                    {a.note}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Huỷ mã ${formatCode(a.code)}`}
                  onClick={() => cancelCode.mutate(a.code)}
                  className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-base font-extrabold">
          Thiết bị đã kích hoạt
        </h2>
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={cn(
              "h-9 rounded-full border px-3 text-[13px] font-bold",
              filter === k
                ? "border-foreground bg-foreground text-background"
                : "bg-card hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3.5 py-2.5 font-bold">Máy / người dùng</th>
              <th className="px-3.5 py-2.5 font-bold">SĐT</th>
              <th className="px-3.5 py-2.5 font-bold">Vai trò</th>
              <th className="px-3.5 py-2.5 font-bold">Dùng gần nhất</th>
              <th className="px-3.5 py-2.5 font-bold">Trạng thái</th>
              <th className="px-3.5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {devicesQ.isLoading && (
              <tr>
                <td colSpan={6} className="px-3.5 py-6 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </td>
              </tr>
            )}
            {!devicesQ.isLoading && shown.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3.5 py-6 text-center text-muted-foreground"
                >
                  Chưa có máy nào. Bấm “Tạo mã kích hoạt” để cấp máy cho nhân
                  viên.
                </td>
              </tr>
            )}
            {shown.map((d) => {
              const stale = isStale(d.lastSeenAt);
              return (
                <tr
                  key={d.deviceId}
                  className="border-t"
                  data-ocid="platform_devices.row"
                >
                  <td className="px-3.5 py-2.5">
                    <p className="font-bold">{d.note || d.deviceId}</p>
                    <p className="text-xs text-muted-foreground">{d.name}</p>
                  </td>
                  <td className="px-3.5 py-2.5">{d.phone || "—"}</td>
                  <td className="px-3.5 py-2.5">
                    <RoleChip role={d.role} />
                  </td>
                  <td className="px-3.5 py-2.5">
                    {lastSeenLabel(d.lastSeenAt)}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[13px] font-bold",
                        !d.active
                          ? "text-muted-foreground"
                          : stale
                            ? "text-muted-foreground"
                            : "text-emerald-700",
                      )}
                    >
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          !d.active
                            ? "bg-muted-foreground/40"
                            : stale
                              ? "bg-muted-foreground/50"
                              : "bg-emerald-500",
                        )}
                      />
                      {!d.active
                        ? "Đã thu hồi"
                        : stale
                          ? "Lâu không dùng"
                          : "Đang dùng"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    {d.active && (
                      <button
                        type="button"
                        onClick={() => setRevoking(d)}
                        className="text-[13px] font-bold text-primary hover:underline"
                        data-ocid="platform_devices.revoke_button"
                      >
                        Thu hồi
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex gap-2.5 rounded-2xl border border-dashed bg-card px-3.5 py-3 text-[13px] text-foreground/80">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          <b>Chỉ admin (đăng nhập Internet Identity) mới làm được:</b> cài đặt
          mức phí &amp; tham số nền tảng, duyệt cuối / tạm dừng đối tác, tạo
          &amp; thu hồi thiết bị sàn, khoá hệ thống VPS.
        </span>
      </div>

      <CreateSheet open={creating} onOpenChange={setCreating} />

      <AlertDialog
        open={!!revoking}
        onOpenChange={(o) => {
          if (!o) setRevoking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Thu hồi máy này?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{revoking?.note || revoking?.deviceId}</b> ({revoking?.name})
              sẽ mất quyền ngay; các chức năng trên máy chủ ngừng chậm nhất sau
              5 phút. Muốn dùng lại phải tạo mã mới.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revoking && revoke.mutate(revoking.deviceId)}
            >
              Thu hồi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

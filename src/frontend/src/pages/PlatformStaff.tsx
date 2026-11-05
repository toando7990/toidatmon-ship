// PlatformStaff — /san: máy của nhân viên Tôi Đặt Món (thiết bị cấp sàn).
//   - Chưa kích hoạt: nhập mã admin cấp (/san?ma=XXXX-XXXX từ QR) + tên + SĐT.
//   - Đã kích hoạt: chỉ thấy đúng phần việc của vai trò được cấp:
//       Điều phối vận hành · Chăm sóc khách hàng · Kế toán sàn · Phát triển
//       đối tác · Kiểm duyệt nội dung · Báo cáo sàn.
// Máy bị thu hồi → báo rõ, cho kích hoạt lại bằng mã mới.

import { StateScreen } from "@/components/AppStates";
import { PageSkeleton } from "@/components/Skeletons";
import { TdmIcon } from "@/components/TdmLogo";
import { OpsConsole } from "@/components/san/OpsConsole";
import { PartnerDevConsole } from "@/components/san/PartnerDevConsole";
import { ReportConsole } from "@/components/san/ReportConsole";
import { SupportConsole } from "@/components/san/SupportConsole";
import { Input } from "@/components/ui/input";
import { useCanister } from "@/lib/canister";
import { usePageTitle } from "@/lib/page-title";
import {
  type PlatformDeviceView,
  ROLE_INFO,
  activatePlatformDevice,
  currentPlatformDevice,
  forgetPlatformDevice,
  hasPlatformDeviceApi,
  platformCredential,
} from "@/lib/platform-devices";
import { cn } from "@/lib/utils";
import DishGroupsAdmin from "@/pages/DishGroupsAdmin";
import PayoutsAdmin from "@/pages/PayoutsAdmin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, LogOut, RefreshCw, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function useTdmTheme() {
  useEffect(() => {
    document.documentElement.classList.add("tdm-theme");
    return () => document.documentElement.classList.remove("tdm-theme");
  }, []);
}

/** "Nguyễn Văn Hậu" → "Chào Hậu 👋"; máy không có tên người (TV…) → "Xin chào 👋". */
function greeting(name: string): string {
  const last = name.trim().split(/\s+/).pop() ?? "";
  return /\p{L}/u.test(last) ? `Chào ${last} 👋` : "Xin chào 👋";
}

function initialCode(): string {
  try {
    return new URLSearchParams(window.location.search).get("ma") ?? "";
  } catch {
    return "";
  }
}

function Activate({
  onDone,
  revoked,
}: {
  onDone: (d: PlatformDeviceView) => void;
  revoked: boolean;
}) {
  const { actor, isFetching } = useCanister();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = !!actor && !isFetching;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    setBusy(true);
    try {
      const d = await activatePlatformDevice(actor, code, name, phone);
      toast.success(`Đã kích hoạt — ${ROLE_INFO[d.role].name}`);
      onDone(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kích hoạt lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StateScreen
      variant={revoked ? "forbidden" : "signin"}
      icon={revoked ? ShieldX : KeyRound}
      title="Kích hoạt máy nhân viên sàn"
      description="Nhập mã admin Tôi Đặt Món cấp cho máy này (hạn 24 giờ, dùng 1 lần)."
      ocid={revoked ? "san.revoked_state" : "san.activate_state"}
    >
      {revoked && (
        <p
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-left text-sm text-destructive"
          role="alert"
          data-ocid="san.revoked_notice"
        >
          Máy này đã bị thu hồi hoặc khoá không còn hợp lệ. Xin admin mã mới để
          kích hoạt lại.
        </p>
      )}
      {ready && !hasPlatformDeviceApi(actor) && (
        <p
          className="badge-warning mt-4 rounded-lg border p-3 text-left text-sm"
          aria-live="polite"
          data-ocid="san.updating_notice"
        >
          Hệ thống đang cập nhật — thử lại sau ít phút.
        </p>
      )}
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4 text-left">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="san-code"
            className="text-sm font-semibold text-foreground"
          >
            Mã kích hoạt
          </label>
          <Input
            id="san-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            className="h-12 rounded-md bg-card text-center font-mono text-xl tracking-widest"
            data-ocid="san.activate_code"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="san-name"
            className="text-sm font-semibold text-foreground"
          >
            Tên người dùng máy
          </label>
          <Input
            id="san-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Nguyễn Văn Hậu"
            className="h-12 rounded-md bg-card"
            maxLength={60}
            data-ocid="san.activate_name.input"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="san-phone"
            className="text-sm font-semibold text-foreground"
          >
            SĐT (tuỳ chọn)
          </label>
          <Input
            id="san-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className="h-12 rounded-md bg-card"
            maxLength={20}
            data-ocid="san.activate_phone.input"
          />
        </div>
        <button
          type="submit"
          className={cn(
            "btn btn-primary btn-lg mt-1 w-full",
            busy && "is-busy",
          )}
          aria-busy={busy || undefined}
          disabled={
            !ready ||
            busy ||
            code.replace(/[-\s]/g, "").length < 8 ||
            !name.trim()
          }
          data-ocid="san.activate_submit"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          )}
          Kích hoạt
        </button>
      </form>
    </StateScreen>
  );
}

/** Nhãn vai trò theo token thương hiệu (thay màu riêng từng vai trò). */
function StaffRoleChip({ role }: { role: PlatformDeviceView["role"] }) {
  const r = ROLE_INFO[role];
  const Icon = r.icon;
  return (
    <span
      className="badge-lime inline-flex h-8 min-w-0 max-w-[45vw] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold"
      data-ocid="san.role_chip"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{r.name}</span>
    </span>
  );
}

function RoleBody({
  device,
  credential,
}: {
  device: PlatformDeviceView;
  credential: string;
}) {
  const auth = `device:${credential}`;
  switch (device.role) {
    case "ops":
      return <OpsConsole auth={auth} />;
    case "support":
      return <SupportConsole auth={auth} />;
    case "viewer":
      return <ReportConsole auth={auth} />;
    case "partnerDev":
      return <PartnerDevConsole credential={credential} />;
    case "accounting":
      return (
        <div className="-mx-4 -my-4 md:-mx-6">
          <PayoutsAdmin deviceCredential={credential} />
        </div>
      );
    case "moderator":
      return (
        <div className="-mx-4 -my-4 md:-mx-6">
          <DishGroupsAdmin credential={credential} />
        </div>
      );
  }
}

export default function PlatformStaff() {
  useTdmTheme();
  usePageTitle("Tôi Đặt Món · Sàn");
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const [credential, setCredential] = useState(() => platformCredential());
  const ready = !!actor && !isFetching && hasPlatformDeviceApi(actor);

  const meQ = useQuery({
    queryKey: ["san", "me", credential],
    queryFn: () => currentPlatformDevice(actor as NonNullable<typeof actor>),
    enabled: ready && !!credential,
    staleTime: 5 * 60 * 1000,
  });
  const device = meQ.data ?? null;
  const revoked = !!credential && meQ.isSuccess && !device;

  function logout() {
    if (
      !window.confirm(
        "Gỡ máy này? Muốn dùng lại phải xin admin mã kích hoạt mới.",
      )
    )
      return;
    forgetPlatformDevice();
    setCredential(null);
    qc.removeQueries({ queryKey: ["san"] });
  }

  return (
    <div className="min-h-screen bg-background" data-ocid="san.page">
      <header className="app-header shadow-subtle">
        <div className="flex h-14 items-center gap-2.5 px-3.5 md:px-5">
          <TdmIcon className="h-8 w-8 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-display text-base font-bold tracking-tight text-primary">
            Tôi Đặt Món · Sàn
          </span>
          {device && <StaffRoleChip role={device.role} />}
          {device && (
            <button
              type="button"
              onClick={logout}
              aria-label="Gỡ máy"
              title="Gỡ máy"
              className="icon-btn-bordered hover:bg-destructive/10 hover:text-destructive"
              data-ocid="san.logout_button"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {credential && actor && !isFetching && !hasPlatformDeviceApi(actor) ? (
        <StateScreen
          variant="warning"
          title="Hệ thống đang cập nhật — thử lại sau ít phút."
          primaryAction={{
            label: "Thử lại",
            icon: RefreshCw,
            onClick: () => window.location.reload(),
            ocid: "san.updating_retry_button",
          }}
          ocid="san.updating_state"
        />
      ) : credential && meQ.isError ? (
        <StateScreen
          variant="error"
          title="Không tải được thông tin máy"
          description={
            meQ.error instanceof Error ? meQ.error.message : undefined
          }
          primaryAction={{
            label: "Thử lại",
            icon: RefreshCw,
            onClick: () => void meQ.refetch(),
            busy: meQ.isFetching,
            ocid: "san.error_retry_button",
          }}
          secondaryAction={{
            label: "Gỡ máy",
            icon: LogOut,
            onClick: logout,
            ocid: "san.error_logout_button",
          }}
          ocid="san.error_state"
        />
      ) : !credential || revoked ? (
        <Activate
          revoked={revoked}
          onDone={() => {
            if (revoked) forgetPlatformDevice();
            setCredential(platformCredential());
            qc.invalidateQueries({ queryKey: ["san", "me"] });
          }}
        />
      ) : !device ? (
        <PageSkeleton ocid="san.loading_state" cards={4} />
      ) : (
        <main className="mx-auto w-full max-w-6xl px-4 py-4 md:px-6">
          <div className="mb-4">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              {greeting(device.name)}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {device.note || device.deviceId} · {ROLE_INFO[device.role].name}
            </p>
          </div>
          <RoleBody device={device} credential={credential} />
        </main>
      )}
    </div>
  );
}

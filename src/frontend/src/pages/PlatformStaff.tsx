// PlatformStaff — /san: máy của nhân viên Tôi Đặt Món (thiết bị cấp sàn).
//   - Chưa kích hoạt: nhập mã admin cấp (/san?ma=XXXX-XXXX từ QR) + tên + SĐT.
//   - Đã kích hoạt: chỉ thấy đúng phần việc của vai trò được cấp:
//       Điều phối vận hành · Chăm sóc khách hàng · Kế toán sàn · Phát triển
//       đối tác · Kiểm duyệt nội dung · Báo cáo sàn.
// Máy bị thu hồi → báo rõ, cho kích hoạt lại bằng mã mới.

import { TdmIcon } from "@/components/TdmLogo";
import { OpsConsole } from "@/components/san/OpsConsole";
import { PartnerDevConsole } from "@/components/san/PartnerDevConsole";
import { ReportConsole } from "@/components/san/ReportConsole";
import { SupportConsole } from "@/components/san/SupportConsole";
import { Button } from "@/components/ui/button";
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
import DishGroupsAdmin from "@/pages/DishGroupsAdmin";
import PayoutsAdmin from "@/pages/PayoutsAdmin";
import { RoleChip } from "@/pages/PlatformDevicesAdmin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, LogOut } from "lucide-react";
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
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <TdmIcon className="h-14 w-14" />
        <h1 className="text-xl font-extrabold">Kích hoạt máy nhân viên sàn</h1>
        <p className="text-sm text-muted-foreground">
          Nhập mã admin Tôi Đặt Món cấp cho máy này (hạn 24 giờ, dùng 1 lần).
        </p>
      </div>
      {revoked && (
        <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
          Máy này đã bị thu hồi hoặc khoá không còn hợp lệ. Xin admin mã mới để
          kích hoạt lại.
        </p>
      )}
      {ready && !hasPlatformDeviceApi(actor) && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Hệ thống đang cập nhật — thử lại sau ít phút.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="san-code" className="text-sm font-bold">
            Mã kích hoạt
          </label>
          <Input
            id="san-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            className="h-12 text-center font-mono text-xl tracking-widest"
            data-ocid="san.activate_code"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="san-name" className="text-sm font-bold">
            Tên người dùng máy
          </label>
          <Input
            id="san-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Nguyễn Văn Hậu"
            className="h-12"
            maxLength={60}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="san-phone" className="text-sm font-bold">
            SĐT (tuỳ chọn)
          </label>
          <Input
            id="san-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className="h-12"
            maxLength={20}
          />
        </div>
        <Button
          type="submit"
          className="h-12 text-base"
          disabled={
            !ready ||
            busy ||
            code.replace(/[-\s]/g, "").length < 8 ||
            !name.trim()
          }
          data-ocid="san.activate_submit"
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="mr-1.5 h-4 w-4" />
          )}
          Kích hoạt
        </Button>
      </form>
    </div>
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
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b bg-card px-3.5 md:px-5">
        <TdmIcon className="h-8 w-8" />
        <b className="min-w-0 flex-1 truncate text-primary">
          Tôi Đặt Món · Sàn
        </b>
        {device && <RoleChip role={device.role} />}
        {device && (
          <button
            type="button"
            onClick={logout}
            aria-label="Gỡ máy"
            title="Gỡ máy"
            className="flex h-10 w-10 items-center justify-center rounded-xl border"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </header>

      {!credential || revoked ? (
        <Activate
          revoked={revoked}
          onDone={() => {
            if (revoked) forgetPlatformDevice();
            setCredential(platformCredential());
            qc.invalidateQueries({ queryKey: ["san", "me"] });
          }}
        />
      ) : !device ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <main className="mx-auto w-full max-w-6xl px-4 py-4 md:px-6">
          <div className="mb-3">
            <h1 className="text-lg font-extrabold">{greeting(device.name)}</h1>
            <p className="text-[13px] text-muted-foreground">
              {device.note || device.deviceId} · {ROLE_INFO[device.role].name}
            </p>
          </div>
          <RoleBody device={device} credential={credential} />
        </main>
      )}
    </div>
  );
}

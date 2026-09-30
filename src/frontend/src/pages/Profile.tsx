// Profile — "Thông tin của bạn". KHÔNG còn yêu cầu xác thực email để
// dùng trang này — khách mới ("khách vãng lai") vẫn xem/sửa họ tên + SĐT
// + địa chỉ nhận hàng ngay, dùng email ngầm định riêng cho trình duyệt
// (xem lib/guest-identity.ts). Xác thực email (OTP) giờ CHỈ còn xuất hiện
// ở đúng 1 chỗ trong trang này: bật "Nhận thông báo khuyến mại qua
// email" — khi bật, dữ liệu khách (tên/SĐT/nhà hàng yêu thích/địa chỉ đã
// lưu cục bộ) được "di chuyển" sang email thật vừa xác thực.
//
// Đây là hồ sơ dùng chung cho CreateOrder.tsx (giỏ hàng không còn hỏi lại
// tên/SĐT/email, tự lấy từ đây).

import { DeliveryAddressPanel } from "@/components/DeliveryAddressPanel";
import { EmailVerificationDialog } from "@/components/EmailVerificationDialog";
import { GuestAddressPanel } from "@/components/GuestAddressPanel";
import { VoucherListPanel } from "@/components/VoucherListPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRestaurants } from "@/hooks/useQueries";
import {
  clearGuestIdentity,
  getOrCreateGuestEmail,
  listGuestAddresses,
} from "@/lib/guest-identity";
import { getVerifiedEmail } from "@/lib/verification-storage";
import {
  addCustomerAddress,
  getCustomer,
  updateCustomer,
} from "@/lib/vps-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

const PHONE_RE = /^0\d{9,10}$/;

export default function Profile() {
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(() => {
    const v = getVerifiedEmail();
    return v ? normalizeEmail(v.email) : null;
  });
  // Email ngầm định riêng cho trình duyệt này — dùng khi khách chưa xác
  // thực email thật (xem lib/guest-identity.ts). Cùng cơ chế/khoá
  // localStorage được CreateOrder.tsx dùng, nên hồ sơ khách mới điền ở
  // đây tự động xuất hiện lại khi đặt món (và ngược lại).
  const [guestEmail] = useState<string>(() => getOrCreateGuestEmail());
  const identityEmail = verifiedEmail ?? guestEmail;
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  // Khách bấm bật "Nhận thông báo khuyến mại qua email" trong khi CHƯA
  // xác thực → mở hộp thoại OTP trước, chỉ thật sự bật cờ notifyKm SAU
  // khi xác thực thành công (xem EmailVerificationDialog.onVerified bên
  // dưới). true = hộp thoại đang mở vì lý do này (khác khách tự bấm nút
  // xác thực trực tiếp — hiện không còn nút đó nữa, chỉ còn đường này).
  const [verifyingForNotify, setVerifyingForNotify] = useState(false);
  const queryClient = useQueryClient();

  const customerQuery = useQuery({
    queryKey: ["customer", identityEmail],
    queryFn: () => getCustomer(identityEmail),
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyKm, setNotifyKm] = useState(false);
  // "Nhà hàng yêu thích" — ưu tiên chọn khi đặt món từ xa, thay cho tự
  // động chọn nhà hàng gần nhất (CreateOrder.tsx). "" = chưa chọn/không
  // có nhà hàng yêu thích, dùng lại hành vi tự động như cũ.
  const [favoriteRestaurantId, setFavoriteRestaurantId] = useState("");
  const restaurantsQuery = useRestaurants();
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  // Tự điền khi tải xong hồ sơ đã có — chỉ điền 1 lần lúc mới tải xong,
  // không ghi đè nếu khách đang gõ dở (cùng nguyên tắc đã áp dụng ở
  // MenuItemForm.tsx khi tải ảnh món ăn từ canister).
  //
  // BUG THẬT đã sửa: trước đây dùng customerQuery.isFetched (true cả khi
  // LỖI, không chỉ khi thành công) — nếu lần gọi ĐẦU TIÊN gặp lỗi mạng
  // tạm thời, prefilled bị đánh dấu true ngay lập tức dù chưa điền được
  // gì, và React Query tự động thử lại thành công SAU ĐÓ cũng không còn
  // kích hoạt lại useEffect này nữa (điều kiện !prefilled đã false) —
  // khách sẽ thấy ô tên/SĐT trống mãi mãi dù dữ liệu thật vẫn còn nguyên
  // trên server, trông như "mất" dữ liệu. Đổi sang isSuccess — CHỈ đánh
  // dấu đã điền khi request thực sự thành công.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!prefilled && customerQuery.isSuccess) {
      if (customerQuery.data) {
        setName(customerQuery.data.name);
        setPhone(customerQuery.data.phone);
        setNotifyKm(customerQuery.data.notifyKm);
        setFavoriteRestaurantId(customerQuery.data.favoriteRestaurantId);
      }
      setPrefilled(true);
    }
  }, [prefilled, customerQuery.isSuccess, customerQuery.data]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: { name?: string; phone?: string } = {};
    if (!name.trim() || name.trim().length < 2) {
      nextErrors.name = "Vui lòng nhập họ tên (ít nhất 2 ký tự).";
    }
    if (!phone.trim() || !PHONE_RE.test(phone.trim())) {
      nextErrors.phone =
        "Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0).";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await updateCustomer(
        identityEmail,
        name.trim(),
        phone.trim(),
        notifyKm,
        favoriteRestaurantId,
      );
      queryClient.invalidateQueries({ queryKey: ["customer", identityEmail] });
      toast.success("Đã lưu thông tin của bạn.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể lưu thông tin.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Khách bấm bật ô "Nhận thông báo khuyến mại qua email" — nếu đã xác
  // thực thì bật thẳng, chưa thì mở OTP trước (đây là NƠI DUY NHẤT trong
  // toàn bộ luồng đặt món/hồ sơ còn nhắc tới xác thực email).
  function handleNotifyKmToggle(checked: boolean) {
    if (!checked || verifiedEmail) {
      setNotifyKm(checked);
      return;
    }
    setVerifyingForNotify(true);
    setVerifyDialogOpen(true);
  }

  // Xác thực xong (dù bấm từ ô "nhận thông báo" hay cách khác trong tương
  // lai) — "di chuyển" toàn bộ hồ sơ khách vãng lai (tên/SĐT/nhà hàng yêu
  // thích + từng địa chỉ đã lưu cục bộ) sang email thật vừa xác thực, rồi
  // xoá dữ liệu khách vãng lai trên trình duyệt này. Đơn hàng CŨ vẫn nằm
  // dưới email ngầm định trước đây (không di chuyển được, chấp nhận đánh
  // đổi này).
  async function handleVerified(rawEmail: string) {
    const newEmail = normalizeEmail(rawEmail);
    setVerifyDialogOpen(false);
    const wantsNotify = verifyingForNotify;
    setVerifyingForNotify(false);

    try {
      await updateCustomer(
        newEmail,
        name.trim(),
        phone.trim(),
        wantsNotify ? true : notifyKm,
        favoriteRestaurantId,
      );
      const guestAddresses = listGuestAddresses();
      for (const addr of guestAddresses) {
        try {
          await addCustomerAddress(newEmail, {
            label: addr.label,
            address: addr.address,
            lat: addr.lat,
            lng: addr.lng,
          });
        } catch {
          // 1 địa chỉ lỗi không nên chặn cả quá trình — bỏ qua, khách có
          // thể tự thêm lại địa chỉ đó nếu thiếu.
        }
      }
      clearGuestIdentity();
      if (wantsNotify) setNotifyKm(true);
      setVerifiedEmail(newEmail);
      toast.success("Đã xác thực email — thông tin của bạn được giữ nguyên.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Xác thực thành công nhưng không lưu được thông tin, vui lòng thử lưu lại.",
      );
      setVerifiedEmail(newEmail);
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-lg px-4 py-8 md:px-6"
      data-ocid="profile.page"
    >
      <header className="mb-6">
        <h1
          className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight md:text-3xl"
          data-ocid="profile.title"
        >
          <User className="h-6 w-6 text-primary" aria-hidden="true" />
          Thông tin của bạn
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Thông tin này dùng để tự điền khi đặt món, không cần nhập lại mỗi lần.
        </p>
      </header>

      <form
        onSubmit={handleSave}
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
        data-ocid="profile.form"
      >
        {verifiedEmail && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-email">Email (đã xác thực)</Label>
            <Input
              id="profile-email"
              type="email"
              value={verifiedEmail}
              disabled
              data-ocid="profile.email_input"
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="profile-name">Họ tên</Label>
          <Input
            id="profile-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nguyễn Văn A"
            aria-invalid={!!errors.name}
            data-ocid="profile.name_input"
          />
          {errors.name && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {errors.name}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profile-phone">Số điện thoại</Label>
          <Input
            id="profile-phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0912345678"
            aria-invalid={!!errors.phone}
            data-ocid="profile.phone_input"
          />
          {errors.phone && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {errors.phone}
            </p>
          )}
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <input
            type="checkbox"
            checked={notifyKm}
            onChange={(e) => handleNotifyKmToggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
            data-ocid="profile.notify_km_checkbox"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Nhận thông báo khuyến mại qua email
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Tuỳ chọn — cần xác thực email để gửi thông báo trước 15 phút mỗi
              khi khung giờ khuyến mãi sắp bắt đầu.
            </span>
          </span>
        </label>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profile-favorite-restaurant">
            Nhà hàng yêu thích
          </Label>
          <select
            id="profile-favorite-restaurant"
            value={favoriteRestaurantId}
            onChange={(e) => setFavoriteRestaurantId(e.target.value)}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm"
            data-ocid="profile.favorite_restaurant_select"
          >
            <option value="">Không chọn — tự động chọn gần nhất</option>
            {(restaurantsQuery.data ?? [])
              .filter((r) => r.visible)
              .map((r) => (
                <option key={r.restaurantId} value={r.restaurantId}>
                  {r.name}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Khi đặt món từ xa, hệ thống sẽ ưu tiên chọn nhà hàng này thay vì tự
            động chọn nhà hàng gần nhất.
          </p>
        </div>
        <Button
          type="submit"
          disabled={saving || customerQuery.isLoading}
          data-ocid="profile.save_button"
        >
          {saving && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Lưu thông tin
        </Button>
      </form>

      <div className="mt-6" data-ocid="profile.delivery_address_section">
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
          Địa chỉ nhận hàng
        </h2>
        {verifiedEmail ? (
          <DeliveryAddressPanel email={verifiedEmail} />
        ) : (
          <GuestAddressPanel guestEmail={guestEmail} />
        )}
      </div>

      {verifiedEmail && (
        <div className="mt-6" data-ocid="profile.vouchers_section">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
            Phiếu giảm giá của bạn
          </h2>
          <VoucherListPanel email={verifiedEmail} />
        </div>
      )}

      <EmailVerificationDialog
        open={verifyDialogOpen}
        onOpenChange={(open) => {
          setVerifyDialogOpen(open);
          if (!open) setVerifyingForNotify(false);
        }}
        onVerified={handleVerified}
      />
    </section>
  );
}

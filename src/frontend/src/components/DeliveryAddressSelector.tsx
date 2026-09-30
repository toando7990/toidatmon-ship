// DeliveryAddressSelector — chọn 1 địa chỉ nhận hàng (BẮT BUỘC) trong
// trang đặt món từ xa (CreateOrder.tsx). Phần 3/6 tái cấu trúc đặt món
// từ xa: khách không còn gõ tay địa chỉ, chỉ chọn từ danh sách đã lưu ở
// mục "Tôi" > "Địa chỉ nhận hàng" (xem DeliveryAddressPanel.tsx).
//
// KHÔNG còn yêu cầu xác thực email — khách mới ("khách vãng lai") vẫn
// đặt món ngay, địa chỉ của họ được lưu CỤC BỘ trong trình duyệt (xem
// lib/guest-identity.ts) thay vì qua API địa chỉ đã xác thực. Khi khách
// đã xác thực email thật (đăng ký nhận thông báo KM ở mục "Tôi"), quay
// lại dùng danh sách địa chỉ đã lưu trên máy chủ như trước.
//
// 3 trạng thái (áp dụng cho cả 2 luồng, khác nhau ở nguồn dữ liệu):
//   1. Đang tải (chỉ khi đã xác thực, cần gọi API).
//   2. Chưa có địa chỉ nào — hiện form thêm địa chỉ ngay tại chỗ (khách
//      mới) hoặc hướng dẫn sang mục "Tôi" (khách đã xác thực, giữ hành vi
//      cũ để không phá vỡ luồng quản lý địa chỉ hiện có).
//   3. Có >= 1 địa chỉ — chọn 1 (tự chọn địa chỉ ĐẦU nếu khách chưa chọn
//      gì), hiện địa chỉ đang chọn + nút "Sửa"/"Thêm địa chỉ khác".

import { MapPicker } from "@/components/MapPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type GuestAddress,
  addGuestAddress,
  listGuestAddresses,
} from "@/lib/guest-identity";
import { listCustomerAddresses } from "@/lib/vps-client";
import type { CustomerAddress } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, MapPin, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";

interface DeliveryAddressSelectorProps {
  verifiedEmail: string | null;
  guestEmail: string;
  selectedAddressId: number | null;
  onSelectAddress: (address: CustomerAddress | null) => void;
}

export function DeliveryAddressSelector({
  verifiedEmail,
  guestEmail,
  selectedAddressId,
  onSelectAddress,
}: DeliveryAddressSelectorProps) {
  const addressesQuery = useQuery({
    queryKey: ["customerAddresses", verifiedEmail],
    queryFn: () =>
      verifiedEmail
        ? listCustomerAddresses(verifiedEmail)
        : Promise.resolve([]),
    enabled: !!verifiedEmail,
  });

  const [guestAddresses, setGuestAddresses] = useState<GuestAddress[]>(() =>
    verifiedEmail ? [] : listGuestAddresses(),
  );
  const [addingAddress, setAddingAddress] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAddressText, setNewAddressText] = useState("");
  const [newLat, setNewLat] = useState<number | null>(null);
  const [newLng, setNewLng] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const addresses: CustomerAddress[] = verifiedEmail
    ? (addressesQuery.data ?? [])
    : guestAddresses;
  const selected =
    addresses.find((a) => a.id === selectedAddressId) ?? addresses[0] ?? null;

  // Tự động chọn địa chỉ ĐẦU TIÊN khi danh sách vừa tải xong và khách
  // chưa chọn gì (VD lần đầu vào trang) — không ghi đè nếu khách đã tự
  // chọn 1 địa chỉ khác trong danh sách.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy lại khi addresses/selectedAddressId đổi, onSelectAddress là setter ổn định
  useEffect(() => {
    if (selectedAddressId === null && addresses.length > 0) {
      onSelectAddress(addresses[0]);
    }
  }, [addresses, selectedAddressId]);

  function openAddForm() {
    setNewLabel("");
    setNewAddressText("");
    setNewLat(null);
    setNewLng(null);
    setFormError(null);
    setAddingAddress(true);
  }

  function handleSaveGuestAddress() {
    if (!newAddressText.trim()) {
      setFormError("Vui lòng nhập địa chỉ.");
      return;
    }
    if (newLat === null || newLng === null) {
      setFormError("Vui lòng ghim vị trí trên bản đồ.");
      return;
    }
    const created = addGuestAddress(guestEmail, {
      label: newLabel.trim(),
      address: newAddressText.trim(),
      lat: newLat,
      lng: newLng,
    });
    const next = listGuestAddresses();
    setGuestAddresses(next);
    onSelectAddress(created);
    setAddingAddress(false);
  }

  if (verifiedEmail && addressesQuery.isLoading) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        data-ocid="delivery_address_selector.loading_state"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải địa chỉ…
      </div>
    );
  }

  // Khách ĐÃ xác thực nhưng chưa có địa chỉ đã lưu — giữ hành vi cũ,
  // hướng dẫn sang mục "Tôi" (nơi có công cụ quản lý địa chỉ đầy đủ).
  if (verifiedEmail && addresses.length === 0) {
    return (
      <div
        className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-card/50 p-4"
        data-ocid="delivery_address_selector.empty_state"
      >
        <p className="text-sm text-muted-foreground">
          Bạn chưa có địa chỉ nhận hàng nào — thêm 1 địa chỉ ở mục "Tôi" trước
          khi đặt món.
        </p>
        <Link
          to="/profile"
          data-ocid="delivery_address_selector.add_link"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Thêm địa chỉ nhận hàng
        </Link>
      </div>
    );
  }

  // Khách MỚI (chưa xác thực) chưa có địa chỉ nào lưu trên máy này, hoặc
  // đang bấm "Thêm địa chỉ khác" — hiện form thêm ngay tại chỗ, không cần
  // rời trang, không cần xác thực gì.
  if (!verifiedEmail && (addresses.length === 0 || addingAddress)) {
    return (
      <div
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        data-ocid="delivery_address_selector.guest_add_form"
      >
        <p className="font-display text-sm font-semibold">
          {addresses.length === 0
            ? "Nhập địa chỉ nhận hàng"
            : "Thêm địa chỉ khác"}
        </p>
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Đặt tên (tuỳ chọn) — VD: Nhà, Công ty"
          data-ocid="delivery_address_selector.label_input"
          className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="text"
          value={newAddressText}
          onChange={(e) => setNewAddressText(e.target.value)}
          placeholder="Số nhà, đường, phường/xã, quận/huyện…"
          data-ocid="delivery_address_selector.address_input"
          className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <MapPicker
          lat={newLat}
          lng={newLng}
          onChange={(lat, lng) => {
            setNewLat(lat);
            setNewLng(lng);
          }}
        />
        {formError && (
          <p
            className="text-xs font-medium text-destructive"
            role="alert"
            data-ocid="delivery_address_selector.form_error"
          >
            {formError}
          </p>
        )}
        <div className="flex gap-2">
          {addresses.length > 0 && (
            <button
              type="button"
              onClick={() => setAddingAddress(false)}
              data-ocid="delivery_address_selector.cancel_add_button"
              className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary"
            >
              Huỷ
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveGuestAddress}
            data-ocid="delivery_address_selector.save_guest_address_button"
            className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Lưu địa chỉ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
      data-ocid="delivery_address_selector.panel"
    >
      {addresses.length > 1 && (
        <Select
          value={String(selected?.id ?? "")}
          onValueChange={(v) => {
            const found = addresses.find((a) => a.id === Number(v));
            if (found) onSelectAddress(found);
          }}
        >
          <SelectTrigger
            data-ocid="delivery_address_selector.select"
            aria-label="Chọn địa chỉ nhận hàng"
            className="min-h-[44px] w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {addresses.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.label ? `${a.label} — ${a.address}` : a.address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selected && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              {selected.label && (
                <p className="text-sm font-semibold">{selected.label}</p>
              )}
              <p
                className="text-sm text-muted-foreground"
                data-ocid="delivery_address_selector.selected_address_text"
              >
                {selected.address}
              </p>
            </div>
          </div>
          {verifiedEmail ? (
            <Link
              to="/profile"
              data-ocid="delivery_address_selector.edit_link"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              Sửa
            </Link>
          ) : (
            <button
              type="button"
              onClick={openAddForm}
              data-ocid="delivery_address_selector.add_another_button"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Thêm địa chỉ khác
            </button>
          )}
        </div>
      )}
    </div>
  );
}

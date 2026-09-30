// DeliveryAddressPanel — tab "Địa chỉ nhận hàng" trong mục "Tôi"
// (Profile.tsx). Danh sách địa chỉ đã lưu + thêm/sửa/xoá, mỗi địa chỉ
// bắt buộc có toạ độ (ghim qua MapPicker.tsx). Yêu cầu email ĐÃ XÁC
// THỰC — VPS tự chặn nếu chưa (xem lib/vps-client.ts).

import { MapPicker } from "@/components/MapPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  updateCustomerAddress,
} from "@/lib/vps-client";
import type { CustomerAddress } from "@/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface DeliveryAddressPanelProps {
  email: string;
}

type FormState = {
  id: number | null; // null = đang thêm mới, có giá trị = đang sửa
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

const EMPTY_FORM: FormState = {
  id: null,
  label: "",
  address: "",
  lat: null,
  lng: null,
};

export function DeliveryAddressPanel({ email }: DeliveryAddressPanelProps) {
  const queryClient = useQueryClient();
  const addressesQuery = useQuery({
    queryKey: ["customerAddresses", email],
    queryFn: () => listCustomerAddresses(email),
  });

  const [form, setForm] = useState<FormState | null>(null); // null = đóng form
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openAddForm() {
    setForm({ ...EMPTY_FORM });
    setError(null);
  }

  function openEditForm(a: CustomerAddress) {
    setForm({
      id: a.id,
      label: a.label,
      address: a.address,
      lat: a.lat,
      lng: a.lng,
    });
    setError(null);
  }

  function closeForm() {
    setForm(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.address.trim()) {
      setError("Vui lòng nhập địa chỉ.");
      return;
    }
    if (form.lat === null || form.lng === null) {
      setError("Vui lòng ghim vị trí trên bản đồ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = {
        label: form.label.trim(),
        address: form.address.trim(),
        lat: form.lat,
        lng: form.lng,
      };
      if (form.id === null) {
        await addCustomerAddress(email, data);
        toast.success("Đã thêm địa chỉ nhận hàng.");
      } else {
        await updateCustomerAddress(email, form.id, data);
        toast.success("Đã lưu thay đổi.");
      }
      queryClient.invalidateQueries({ queryKey: ["customerAddresses", email] });
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu địa chỉ.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteCustomerAddress(email, id);
      queryClient.invalidateQueries({ queryKey: ["customerAddresses", email] });
      toast.success("Đã xoá địa chỉ.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể xoá địa chỉ.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const addresses = addressesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4" data-ocid="delivery_address.panel">
      {!form && (
        <Button
          type="button"
          onClick={openAddForm}
          variant="outline"
          data-ocid="delivery_address.add_button"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Thêm địa chỉ mới
        </Button>
      )}

      {form && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          data-ocid="delivery_address.form"
        >
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-semibold">
              {form.id === null ? "Thêm địa chỉ mới" : "Sửa địa chỉ"}
            </p>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Đóng"
              data-ocid="delivery_address.form.close_button"
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="addr-label">Đặt tên (tuỳ chọn)</Label>
            <Input
              id="addr-label"
              value={form.label}
              onChange={(e) =>
                setForm((s) => (s ? { ...s, label: e.target.value } : s))
              }
              placeholder="VD: Nhà, Công ty"
              data-ocid="delivery_address.label_input"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="addr-address">
              Địa chỉ <span className="text-destructive">*</span>
            </Label>
            <Input
              id="addr-address"
              value={form.address}
              onChange={(e) =>
                setForm((s) => (s ? { ...s, address: e.target.value } : s))
              }
              placeholder="Số nhà, đường, phường/xã, quận/huyện…"
              data-ocid="delivery_address.address_input"
            />
          </div>

          <MapPicker
            lat={form.lat}
            lng={form.lng}
            onChange={(lat, lng) =>
              setForm((s) => (s ? { ...s, lat, lng } : s))
            }
          />

          {error && (
            <p
              className="text-xs font-medium text-destructive"
              role="alert"
              data-ocid="delivery_address.form.error"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={saving}
            data-ocid="delivery_address.save_button"
          >
            {saving && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {form.id === null ? "Thêm địa chỉ" : "Lưu thay đổi"}
          </Button>
        </form>
      )}

      {addressesQuery.isLoading && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-ocid="delivery_address.loading_state"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải địa chỉ…
        </div>
      )}

      {!addressesQuery.isLoading && addresses.length === 0 && !form && (
        <p
          className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground"
          data-ocid="delivery_address.empty_state"
        >
          Chưa có địa chỉ nhận hàng nào. Thêm 1 địa chỉ để đặt món từ xa.
        </p>
      )}

      {addresses.length > 0 && (
        <ul className="flex flex-col gap-2" data-ocid="delivery_address.list">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
              data-ocid={`delivery_address.item.${a.id}`}
            >
              <div className="flex min-w-0 items-start gap-2">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  {a.label && (
                    <p className="text-sm font-semibold">{a.label}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{a.address}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEditForm(a)}
                  aria-label="Sửa"
                  data-ocid={`delivery_address.edit_button.${a.id}`}
                  className="rounded-md p-2 text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  disabled={deletingId === a.id}
                  aria-label="Xoá"
                  data-ocid={`delivery_address.delete_button.${a.id}`}
                  className="rounded-md p-2 text-muted-foreground transition-smooth hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  {deletingId === a.id ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

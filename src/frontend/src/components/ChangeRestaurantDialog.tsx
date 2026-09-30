// ChangeRestaurantDialog — khách tự đổi nhà hàng của đơn CHƯA THANH TOÁN
// (Giai đoạn 4a, trường hợp đặt tài xế đến nhầm nhà hàng). Hiện ở "Theo
// dõi đơn", KHÔNG cần đăng nhập — cùng mức tin cậy với các hành động tự
// phục vụ khác theo orderId (yêu cầu QR thanh toán).

import type { Restaurant } from "@/backend";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changeOrderRestaurant } from "@/lib/vps-client";
import { Loader2, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export interface ChangeRestaurantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  currentRestaurantId: string;
  restaurants: Restaurant[];
  onChanged: (newRestaurantId: string) => void;
}

export function ChangeRestaurantDialog({
  open,
  onOpenChange,
  orderId,
  currentRestaurantId,
  restaurants,
  onChanged,
}: ChangeRestaurantDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const otherRestaurants = restaurants.filter(
    (r) => r.restaurantId !== currentRestaurantId && r.visible,
  );

  async function handleConfirm() {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await changeOrderRestaurant(orderId, selectedId);
      toast.success("Đã chuyển sang nhà hàng khác.");
      onChanged(selectedId);
      onOpenChange(false);
      setSelectedId(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể chuyển nhà hàng.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) {
          onOpenChange(next);
          if (!next) setSelectedId(null);
        }
      }}
    >
      <DialogContent data-ocid="change_restaurant.dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" aria-hidden="true" />
            Chuyển sang nhà hàng khác
          </DialogTitle>
          <DialogDescription>
            Dùng khi bạn đặt tài xế đến nhầm nhà hàng. Đơn của bạn sẽ được
            chuyển sang nhà hàng bạn chọn bên dưới.
          </DialogDescription>
        </DialogHeader>

        {otherRestaurants.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Không có nhà hàng nào khác để chuyển sang.
          </p>
        ) : (
          <div
            className="flex max-h-64 flex-col gap-2 overflow-y-auto py-2"
            data-ocid="change_restaurant.list"
          >
            {otherRestaurants.map((r) => (
              <label
                key={r.restaurantId}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-smooth has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="change-restaurant-target"
                  value={r.restaurantId}
                  checked={selectedId === r.restaurantId}
                  onChange={() => setSelectedId(r.restaurantId)}
                  className="mt-1 h-4 w-4 accent-primary"
                  data-ocid={`change_restaurant.option.${r.restaurantId}`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.address}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            data-ocid="change_restaurant.cancel_button"
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedId || submitting}
            data-ocid="change_restaurant.confirm_button"
          >
            {submitting && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Xác nhận chuyển
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

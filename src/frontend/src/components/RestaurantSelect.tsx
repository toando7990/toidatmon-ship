// RestaurantSelect — dropdown chọn nhà hàng (từ getRestaurants), hiển thị tên + địa chỉ.
// Mobile-first, dùng shadcn Select. Tiếng Việt.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Restaurant } from "@/types";
import { MapPin } from "lucide-react";

interface RestaurantSelectProps {
  restaurants: Restaurant[] | undefined;
  isLoading: boolean;
  value: string;
  onChange: (restaurantId: string) => void;
  disabled?: boolean;
}

export function RestaurantSelect({
  restaurants,
  isLoading,
  value,
  onChange,
  disabled,
}: RestaurantSelectProps) {
  return (
    <div className="flex flex-col gap-1.5" data-ocid="restaurant_select.panel">
      {isLoading ? (
        <Skeleton
          className="h-11 w-full rounded-md"
          data-ocid="restaurant_select.loading_state"
        />
      ) : (
        <Select
          value={value}
          onValueChange={onChange}
          disabled={disabled || !restaurants?.length}
        >
          <SelectTrigger
            id="restaurant-select-trigger"
            className="min-h-[44px] w-full"
            data-ocid="restaurant_select.select"
            aria-label="Chọn nhà hàng"
          >
            <SelectValue
              placeholder={
                !restaurants?.length
                  ? "Chưa có nhà hàng"
                  : "Chọn nhà hàng đặt hàng"
              }
            />
          </SelectTrigger>
          <SelectContent data-ocid="restaurant_select.dropdown_menu">
            {restaurants?.map((r, idx) => (
              <SelectItem
                key={r.restaurantId}
                value={r.restaurantId}
                data-ocid={`restaurant_select.item.${idx}`}
              >
                <div className="flex flex-col gap-0.5 py-0.5">
                  <span className="font-medium">{r.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    <span className="line-clamp-1">{r.address || "—"}</span>
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// MenuItemForm — form thêm/sửa món. Fields: name, price (BigInt VND),
// unitName, vatRate (BigInt %), category, image (ProcessedImage via ImageUpload,
// ảnh khi sửa món lấy riêng qua useItemImage — xem bên dưới),
// visible (toggle, update only). Nút Lưu gọi useAddItem (create) hoặc
// useUpdateItem (edit). UI tiếng Việt.

import type { MenuItem } from "@/backend";
import { ImageUpload } from "@/components/ImageUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAddItem, useItemImage, useUpdateItem } from "@/hooks/useQueries";
import { imageBytesToDataUrl } from "@/lib/utils";
import type { ProcessedImage } from "@/types";
import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const VAT_OPTIONS = [
  { value: "0", label: "0%" },
  { value: "5", label: "5%" },
  { value: "8", label: "8%" },
  { value: "10", label: "10%" },
];

const CATEGORY_OPTIONS = [
  "Món chính",
  "Món phụ",
  "Đồ uống",
  "Tráng miệng",
  "Khác",
];

export interface MenuItemFormProps {
  /** Khi có item → chế độ sửa; khi undefined → chế độ thêm. */
  item?: MenuItem;
  /** Callback sau khi lưu thành công (đóng dialog, reset form…). */
  onSaved?: () => void;
  /** Callback khi hủy. */
  onCancel?: () => void;
}

function generateItemId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug || "item"}-${suffix}`;
}

function bigToInput(v: bigint | undefined): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

function parseBigInput(s: string): bigint {
  const trimmed = s.replace(/[.,\s]/g, "");
  if (!trimmed) return 0n;
  try {
    return BigInt(trimmed);
  } catch {
    return 0n;
  }
}

export function MenuItemForm({ item, onSaved, onCancel }: MenuItemFormProps) {
  const isEdit = !!item;
  const addItemMutation = useAddItem();
  const updateItemMutation = useUpdateItem();
  const isPending = addItemMutation.isPending || updateItemMutation.isPending;

  const [name, setName] = useState<string>(item?.name ?? "");
  const [price, setPrice] = useState<string>(bigToInput(item?.price));
  const [unitName, setUnitName] = useState<string>(item?.unitName ?? "phần");
  const [vatRate, setVatRate] = useState<string>(
    bigToInput(item?.vatRate) || "8",
  );
  const [category, setCategory] = useState<string>(
    item?.category ?? CATEGORY_OPTIONS[0],
  );
  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [visible, setVisible] = useState<boolean>(item?.visible ?? true);

  // Ảnh của món đang sửa lấy RIÊNG qua getItemImage(itemId) — item.image từ
  // danh sách menu luôn rỗng (tránh vượt giới hạn kích thước phản hồi IC
  // 3MB). Chỉ điền vào state MỘT LẦN khi tải xong — không ghi đè ảnh mới
  // admin vừa chọn nếu query load lại sau đó (ví dụ do cache invalidate).
  //
  // BUG THẬT đã sửa (cùng lỗi đã tìm thấy và sửa ở Profile.tsx): trước
  // đây dùng isFetched (true cả khi LỖI mạng, không chỉ khi thành công)
  // — nếu lần gọi ĐẦU TIÊN gặp lỗi mạng tạm thời, imageInitFromFetch bị
  // đánh dấu true ngay dù chưa điền được ảnh gì, và React Query tự động
  // thử lại thành công SAU ĐÓ cũng không còn kích hoạt lại useEffect này
  // — admin sẽ thấy ảnh món trống mãi dù ảnh thật vẫn còn nguyên trên
  // canister. Đổi sang isSuccess — CHỈ đánh dấu đã điền khi request thực
  // sự thành công.
  const { data: fetchedImageBytes, isSuccess: imageFetched } = useItemImage(
    item?.itemId,
  );
  const [imageInitFromFetch, setImageInitFromFetch] = useState(false);
  useEffect(() => {
    if (!isEdit || imageFetched === false || imageInitFromFetch) return;
    if (fetchedImageBytes && fetchedImageBytes.length > 0) {
      setImage({
        bytes: fetchedImageBytes,
        dataUrl: imageBytesToDataUrl(fetchedImageBytes) ?? "",
        sizeBytes: fetchedImageBytes.length,
      });
    }
    setImageInitFromFetch(true);
  }, [isEdit, imageFetched, imageInitFromFetch, fetchedImageBytes]);

  const canSubmit =
    name.trim().length > 0 &&
    price.trim().length > 0 &&
    unitName.trim().length > 0 &&
    vatRate.trim().length > 0 &&
    category.trim().length > 0 &&
    !isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Vui lòng điền đầy đủ các trường bắt buộc.");
      return;
    }

    const priceBig = parseBigInput(price);
    const vatBig = parseBigInput(vatRate);
    if (priceBig < 0n) {
      toast.error("Giá không được âm.");
      return;
    }
    if (vatBig < 0n || vatBig > 100n) {
      toast.error("Thuế VAT phải từ 0 đến 100%.");
      return;
    }

    try {
      if (isEdit && item) {
        await updateItemMutation.mutateAsync({
          itemId: item.itemId,
          name: name.trim(),
          price: priceBig,
          unitName: unitName.trim(),
          vatRate: vatBig,
          category: category.trim(),
          image: image?.bytes ?? new Uint8Array(),
          visible,
        });
        toast.success("Đã cập nhật món.");
      } else {
        const itemId = generateItemId(name);
        await addItemMutation.mutateAsync({
          itemId,
          name: name.trim(),
          price: priceBig,
          unitName: unitName.trim(),
          vatRate: vatBig,
          category: category.trim(),
          image: image?.bytes ?? new Uint8Array(),
        });
        toast.success("Đã thêm món mới.");
      }
      onSaved?.();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Không thể lưu món. Vui lòng thử lại.";
      toast.error(message);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      data-ocid="menu_item.form"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="menu-item-name" className="text-sm font-medium">
          Tên món <span className="text-destructive">*</span>
        </Label>
        <Input
          id="menu-item-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Bún bò Huế đặc biệt"
          required
          maxLength={120}
          data-ocid="menu_item.name_input"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="menu-item-price" className="text-sm font-medium">
            Giá (đồng) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="menu-item-price"
            type="text"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="45000"
            required
            data-ocid="menu_item.price_input"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="menu-item-unit" className="text-sm font-medium">
            Đơn vị <span className="text-destructive">*</span>
          </Label>
          <Input
            id="menu-item-unit"
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            placeholder="phần / tô / đĩa"
            required
            maxLength={40}
            data-ocid="menu_item.unit_input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="menu-item-vat" className="text-sm font-medium">
            Thuế VAT <span className="text-destructive">*</span>
          </Label>
          <Select value={vatRate} onValueChange={setVatRate}>
            <SelectTrigger
              id="menu-item-vat"
              className="w-full"
              data-ocid="menu_item.vat_select"
            >
              <SelectValue placeholder="Chọn mức VAT" />
            </SelectTrigger>
            <SelectContent>
              {VAT_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  data-ocid={`menu_item.vat_option.${opt.value}`}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="menu-item-category" className="text-sm font-medium">
            Danh mục <span className="text-destructive">*</span>
          </Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger
              id="menu-item-category"
              className="w-full"
              data-ocid="menu_item.category_select"
            >
              <SelectValue placeholder="Chọn danh mục" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt}
                  value={opt}
                  data-ocid={`menu_item.category_option.${opt}`}
                >
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ImageUpload
        value={image}
        onChange={setImage}
        disabled={isPending}
        label="Ảnh món"
      />

      {isEdit && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="flex flex-col">
            <Label htmlFor="menu-item-visible" className="text-sm font-medium">
              Hiển thị món
            </Label>
            <span className="text-xs text-muted-foreground">
              Khi tắt, khách sẽ không thấy món này trên menu.
            </span>
          </div>
          <Switch
            id="menu-item-visible"
            checked={visible}
            onCheckedChange={setVisible}
            data-ocid="menu_item.visible_toggle"
            aria-label="Bật/tắt hiển thị món"
          />
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            data-ocid="menu_item.cancel_button"
          >
            Hủy
          </Button>
        )}
        <Button
          type="submit"
          disabled={!canSubmit}
          data-ocid="menu_item.save_button"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {isEdit ? "Lưu thay đổi" : "Thêm món"}
        </Button>
      </div>
    </form>
  );
}

export {
  CATEGORY_OPTIONS as MENU_CATEGORY_OPTIONS,
  VAT_OPTIONS as MENU_VAT_OPTIONS,
};

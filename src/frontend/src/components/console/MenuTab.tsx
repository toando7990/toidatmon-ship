// Tab Món của trang quản lý đối tác (/quan-ly) — giai đoạn 2.
//   - Chủ đối tác: danh mục, thêm/sửa/xoá món (đơn vị, VAT, ẩn với khách),
//     kéo ⠿ để đổi thứ tự hiện cho khách, giá riêng + còn/hết theo nhà hàng.
//   - Nhân viên: chỉ gạt Còn / Hết tại nhà hàng của máy mình.
// Hết món chỉ có hiệu lực trong hôm nay (sáng mai tự "Còn" lại).

import type { MenuItem, Restaurant } from "@/backend";
import {
  BigButton,
  type Ctx,
  Switch,
  logSupport,
  useConsoleRestaurants,
} from "@/components/console/shared";
import { useItemImage } from "@/hooks/useQueries";
import { useCanister } from "@/lib/canister";
import {
  type ItemDraft,
  deleteMenuItem,
  formatVnd,
  saveMenuItemFull,
  setBranchPrice,
} from "@/lib/partner-console";
import {
  type SoldOutEntry,
  listSoldOutAt,
  saveMenuOrder,
  setSoldOutAt,
} from "@/lib/partner-self";
import { cn, imageBytesToDataUrl } from "@/lib/utils";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronDown,
  GripVertical,
  ImageIcon,
  Loader2,
  Plus,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

const PACKAGING = "Dụng cụ đựng đồ ăn";
const UNITS = [
  "Phần",
  "Tô",
  "Bát",
  "Đĩa",
  "Ly",
  "Cốc",
  "Chai",
  "Lon",
  "Hộp",
  "Suất",
  "Cái",
  "Xiên",
  "Kg",
];
const VATS = [0, 5, 8, 10];
const ALL = "__all__";

const onErr = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : "Không lưu được");

async function fileToJpeg(file: File): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("Ảnh lỗi"))),
      "image/jpeg",
      0.8,
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

function useObjectUrl(bytes: Uint8Array | null | undefined) {
  const url = useMemo(() => imageBytesToDataUrl(bytes), [bytes]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

function Thumb({ itemId, className }: { itemId: string; className?: string }) {
  const { data } = useItemImage(itemId);
  const url = useObjectUrl(data);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground",
        className ?? "h-14 w-14",
      )}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
      )}
    </span>
  );
}

/** Giá từng nhà hàng (getMenuForRestaurant đã áp giá riêng). */
function useBranchPrices(ctx: Ctx, rests: Restaurant[]) {
  const { actor, isFetching } = useCanister();
  const results = useQueries({
    queries: rests.map((r) => ({
      queryKey: ["console", "branchMenu", r.restaurantId],
      queryFn: () =>
        (actor as NonNullable<typeof actor>).getMenuForRestaurant(
          ctx.tenantId,
          r.restaurantId,
        ),
      enabled: !!actor && !isFetching,
    })),
  });
  const m = new Map<string, Map<string, bigint>>();
  rests.forEach((r, i) => {
    m.set(
      r.restaurantId,
      new Map((results[i]?.data ?? []).map((x) => [x.itemId, x.price])),
    );
  });
  return m;
}

function soldAt(
  sold: SoldOutEntry[],
  itemId: string,
  restaurantId: string,
): boolean {
  return sold.some(
    (e) =>
      e.itemId === itemId &&
      (e.restaurantId === "" || e.restaurantId === restaurantId),
  );
}

// ---------- Sửa / thêm món ----------

function ItemSheet({
  ctx,
  item,
  categories,
  rests,
  branchPrices,
  sold,
  onClose,
}: {
  ctx: Ctx;
  item: MenuItem | null;
  categories: string[];
  rests: Restaurant[];
  branchPrices: Map<string, Map<string, bigint>>;
  sold: SoldOutEntry[];
  onClose: () => void;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const [d, setD] = useState<ItemDraft>({
    name: item?.name ?? "",
    price: item ? Number(item.price) : 0,
    unitName: item?.unitName || "Phần",
    vatRate: item ? Number(item.vatRate) : 8,
    category: item?.category || categories[0] || "Món chính",
    visible: item?.visible ?? true,
    image: null,
  });
  const [priceText, setPriceText] = useState(item ? String(item.price) : "");
  const [newCat, setNewCat] = useState<string | null>(null);
  const [branch, setBranch] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (item) {
      for (const r of rests) {
        const p = branchPrices.get(r.restaurantId)?.get(item.itemId);
        if (p !== undefined && p !== item.price)
          init[r.restaurantId] = String(p);
      }
    }
    return init;
  });
  const [onAt, setOnAt] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      rests.map((r) => [
        r.restaurantId,
        !item || !soldAt(sold, item.itemId, r.restaurantId),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const existing = useItemImage(item?.itemId);
  const previewBytes = d.image ?? existing.data ?? null;
  const preview = useObjectUrl(previewBytes);
  const cats = useMemo(
    () => Array.from(new Set([...categories, d.category].filter(Boolean))),
    [categories, d.category],
  );
  const globalSold =
    !!item &&
    sold.some((e) => e.itemId === item.itemId && e.restaurantId === "");

  async function save() {
    if (!actor) return;
    const price = Number(priceText);
    if (!d.name.trim()) return setErr("Nhập tên món");
    if (!Number.isInteger(price) || price <= 0)
      return setErr("Giá phải là số tiền, vd 65000");
    setBusy(true);
    setErr("");
    try {
      const saved = await saveMenuItemFull(
        actor,
        ctx.tenantId,
        ctx.device.deviceId,
        item,
        { ...d, price },
      );
      // Giá riêng từng nhà hàng (trống hoặc bằng giá chung = dùng giá chung).
      for (const r of rests) {
        let want = Number(branch[r.restaurantId] || 0);
        if (want === price) want = 0;
        const cur = item
          ? branchPrices.get(r.restaurantId)?.get(item.itemId)
          : undefined;
        const curCustom =
          item && cur !== undefined && cur !== item.price ? Number(cur) : 0;
        if (want !== curCustom) {
          await setBranchPrice(
            actor,
            ctx.tenantId,
            ctx.device.deviceId,
            r.restaurantId,
            saved.itemId,
            BigInt(want),
          );
        }
      }
      // Còn / hết hôm nay theo nhà hàng.
      for (const r of rests) {
        const wasOn = !item || !soldAt(sold, saved.itemId, r.restaurantId);
        const on = onAt[r.restaurantId] ?? true;
        if (on !== wasOn && !(on && globalSold)) {
          await setSoldOutAt(
            actor,
            ctx.tenantId,
            ctx.device.deviceId,
            saved.itemId,
            r.restaurantId,
            !on,
          );
        }
      }
      if (globalSold && rests.every((r) => onAt[r.restaurantId] ?? true)) {
        await setSoldOutAt(
          actor,
          ctx.tenantId,
          ctx.device.deviceId,
          saved.itemId,
          "",
          false,
        );
      }
      await logSupport(ctx, "menu", `${item ? "Sửa" : "Thêm"} món ${d.name}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["console", "menu"] }),
        qc.invalidateQueries({ queryKey: ["console", "branchMenu"] }),
        qc.invalidateQueries({ queryKey: ["console", "soldOutAt"] }),
        qc.invalidateQueries({ queryKey: ["soldOutToday"] }),
        qc.invalidateQueries({ queryKey: ["itemImage"] }),
      ]);
      toast.success(item ? "Đã lưu món" : "Đã thêm món");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!actor || !item) return;
    setBusy(true);
    try {
      await deleteMenuItem(
        actor,
        ctx.tenantId,
        ctx.device.deviceId,
        item.itemId,
      );
      await logSupport(ctx, "menu", `Xoá món ${item.name}`);
      await qc.invalidateQueries({ queryKey: ["console", "menu"] });
      toast.success("Đã xoá món");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không xoá được");
    } finally {
      setBusy(false);
    }
  }

  const priceNum = Number(priceText) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45">
      <section
        aria-label={item ? "Sửa món" : "Thêm món"}
        className="flex max-h-[94vh] w-full max-w-md flex-col gap-3.5 overflow-y-auto rounded-t-3xl bg-background p-5"
        data-ocid="console.item_sheet"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">
            {item ? "Sửa món" : "Thêm món"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-[84px] w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground">
            {preview ? (
              <img
                src={preview}
                alt="Ảnh món"
                className="h-full w-full object-cover"
              />
            ) : (
              <UtensilsCrossed className="h-7 w-7" />
            )}
          </span>
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border bg-card px-3.5 text-[15px] font-bold">
            <ImageIcon className="h-5 w-5" />
            {preview ? "Đổi ảnh" : "Chụp / chọn ảnh"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const bytes = await fileToJpeg(f);
                  setD((x) => ({ ...x, image: bytes }));
                } catch {
                  setErr("Không đọc được ảnh");
                }
              }}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Tên món
          <input
            value={d.name}
            onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))}
            placeholder="VD: Bún bò đặc biệt"
            className="h-12 rounded-xl border bg-card px-3 text-base font-normal"
            data-ocid="console.item_name"
          />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Giá chung
            <input
              value={priceText}
              onChange={(e) => setPriceText(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="65000"
              className="h-12 rounded-xl border bg-card px-3 text-base font-normal"
              data-ocid="console.item_price"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Đơn vị
            <select
              value={d.unitName}
              onChange={(e) =>
                setD((x) => ({ ...x, unitName: e.target.value }))
              }
              className="h-12 rounded-xl border bg-card px-3 text-base font-normal"
            >
              {Array.from(new Set([...UNITS, d.unitName])).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-bold">Danh mục</p>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={d.category === c}
                onClick={() => setD((x) => ({ ...x, category: c }))}
                className={cn(
                  "min-h-[40px] rounded-full border px-3.5 text-sm font-bold",
                  d.category === c
                    ? "border-foreground bg-foreground text-background"
                    : "bg-card text-muted-foreground",
                )}
              >
                {c}
              </button>
            ))}
            {newCat === null ? (
              <button
                type="button"
                onClick={() => setNewCat("")}
                className="min-h-[40px] rounded-full border border-dashed bg-card px-3.5 text-sm font-bold text-muted-foreground"
              >
                + Mới
              </button>
            ) : (
              <span className="flex items-center gap-1.5">
                <input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  placeholder="Tên danh mục"
                  aria-label="Tên danh mục mới"
                  className="h-10 w-36 rounded-full border bg-card px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const c = newCat.trim();
                    if (c) setD((x) => ({ ...x, category: c }));
                    setNewCat(null);
                  }}
                  className="h-10 rounded-full bg-foreground px-3 text-sm font-bold text-background"
                >
                  Thêm
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-bold">Thuế VAT</p>
          <div className="grid grid-cols-4 gap-2">
            {VATS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={d.vatRate === v}
                onClick={() => setD((x) => ({ ...x, vatRate: v }))}
                className={cn(
                  "h-11 rounded-xl border text-[15px] font-extrabold",
                  d.vatRate === v
                    ? "border-2 border-primary bg-primary/10 text-primary"
                    : "bg-card",
                )}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <span>
            <span className="block text-[15px] font-extrabold">
              Hiện cho khách
            </span>
            <span className="text-[13px] text-muted-foreground">
              Tắt để ẩn món khỏi trang đặt món
            </span>
          </span>
          <Switch
            on={d.visible}
            onToggle={() => setD((x) => ({ ...x, visible: !x.visible }))}
            label="Hiện cho khách"
          />
        </div>

        {rests.length > 0 && (
          <div
            className="flex flex-col gap-1"
            data-ocid="console.item_branches"
          >
            <p className="text-[15px] font-extrabold">Theo nhà hàng</p>
            <p className="text-[13px] text-muted-foreground">
              Để trống giá = dùng giá chung. Công tắc = còn bán hôm nay tại nhà
              hàng đó.
            </p>
            {rests.map((r) => (
              <div
                key={r.restaurantId}
                className="flex items-center gap-2.5 border-b py-2 last:border-0"
              >
                <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-bold leading-snug">
                  {r.name}
                </span>
                <input
                  inputMode="numeric"
                  value={branch[r.restaurantId] ?? ""}
                  onChange={(e) =>
                    setBranch((x) => ({
                      ...x,
                      [r.restaurantId]: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder={
                    priceNum ? priceNum.toLocaleString("vi-VN") : "Giá"
                  }
                  aria-label={`Giá tại ${r.name}`}
                  className="h-11 w-28 rounded-xl border bg-card px-3 text-right text-[15px]"
                />
                <Switch
                  on={onAt[r.restaurantId] ?? true}
                  onToggle={() =>
                    setOnAt((x) => ({
                      ...x,
                      [r.restaurantId]: !(x[r.restaurantId] ?? true),
                    }))
                  }
                  label={`Còn bán tại ${r.name}`}
                />
              </div>
            ))}
          </div>
        )}

        {err && (
          <p className="text-sm text-destructive" role="alert">
            {err}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <BigButton variant="outline" onClick={onClose} disabled={busy}>
            Huỷ
          </BigButton>
          <BigButton onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            Lưu món
          </BigButton>
        </div>
        {item &&
          (confirmDel ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-bold text-red-800">
                Xoá hẳn “{item.name}”? Muốn tạm ngừng bán thì tắt “Hiện cho
                khách” thay vì xoá.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <BigButton
                  variant="outline"
                  onClick={() => setConfirmDel(false)}
                >
                  Không
                </BigButton>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove()}
                  className="h-12 rounded-2xl bg-red-700 text-base font-extrabold text-white"
                >
                  Xoá món
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="py-2 text-sm font-bold text-red-700"
            >
              Xoá món này
            </button>
          ))}
      </section>
    </div>
  );
}

// ---------- Danh sách món ----------

function BranchPicker({
  value,
  rests,
  fixed,
  onChange,
}: {
  value: string;
  rests: Restaurant[];
  fixed: boolean;
  onChange: (v: string) => void;
}) {
  const name =
    value === ALL
      ? "Mọi nhà hàng"
      : (rests.find((r) => r.restaurantId === value)?.name ?? "—");
  return (
    <div className="relative flex min-h-[52px] items-center gap-2.5 rounded-2xl border bg-card px-3.5">
      <Store className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
        Còn / hết món tại: {name}
      </span>
      {!fixed && <ChevronDown className="h-5 w-5 shrink-0" />}
      {!fixed && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Còn / hết món tại nhà hàng"
          className="absolute inset-0 cursor-pointer opacity-0"
          data-ocid="console.menu_branch"
        >
          {rests.map((r) => (
            <option key={r.restaurantId} value={r.restaurantId}>
              {r.name}
            </option>
          ))}
          <option value={ALL}>Mọi nhà hàng</option>
        </select>
      )}
    </div>
  );
}

export function MenuTab({ ctx }: { ctx: Ctx }) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const isOwner = ctx.role === "owner";
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [cat, setCat] = useState<string | null>(null);

  const menuQ = useQuery({
    queryKey: ["console", "menu", ctx.tenantId],
    queryFn: () => (actor as NonNullable<typeof actor>).listMenus(ctx.tenantId),
    enabled: ready,
  });
  const soldQ = useQuery({
    queryKey: ["console", "soldOutAt", ctx.tenantId],
    queryFn: () =>
      listSoldOutAt(actor as NonNullable<typeof actor>, ctx.tenantId),
    enabled: ready,
    refetchInterval: 30_000,
  });
  const restQ = useConsoleRestaurants(ctx);
  const rests = useMemo(
    () => (restQ.data ?? []).filter((r) => r.visible),
    [restQ.data],
  );
  const branchPrices = useBranchPrices(ctx, isOwner ? rests : []);
  const fixedBranch = ctx.device.restaurantId;
  const [branchPick, setBranchPick] = useState("");
  const branch =
    fixedBranch ||
    (branchPick &&
    (branchPick === ALL || rests.some((r) => r.restaurantId === branchPick))
      ? branchPick
      : (rests[0]?.restaurantId ?? ALL));
  const sold = soldQ.data ?? [];

  // Thứ tự hiện cho khách: lấy từ canister (listMenus đã xếp), kéo thả thì
  // đổi tạm trên máy rồi lưu.
  const [order, setOrder] = useState<string[] | null>(null);
  const all = useMemo(() => {
    const list = (menuQ.data ?? []).filter(
      (m) => m.name !== PACKAGING && (isOwner || m.visible),
    );
    if (!order) return list;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...list].sort(
      (a, b) => (rank.get(a.itemId) ?? 1e9) - (rank.get(b.itemId) ?? 1e9),
    );
  }, [menuQ.data, order, isOwner]);
  const categories = useMemo(
    () => Array.from(new Set(all.map((m) => m.category).filter(Boolean))),
    [all],
  );
  const shown = cat ? all.filter((m) => m.category === cat) : all;

  const toggle = useMutation({
    mutationFn: async (v: { itemId: string; soldOut: boolean }) => {
      await setSoldOutAt(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        v.itemId,
        branch === ALL ? "" : branch,
        v.soldOut,
      );
      await logSupport(ctx, "menu", v.soldOut ? "Báo hết món" : "Báo còn món");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["console", "soldOutAt"] });
      qc.invalidateQueries({ queryKey: ["soldOutToday"] });
    },
    onError: onErr,
  });
  const saveOrder = useMutation({
    mutationFn: async (ids: string[]) => {
      await saveMenuOrder(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        ids,
      );
      await logSupport(ctx, "menu", "Đổi thứ tự món");
    },
    onSuccess: () => {
      toast.success("Đã lưu thứ tự món");
      qc.invalidateQueries({ queryKey: ["console", "menu"] });
    },
    onError: (e) => {
      setOrder(null);
      onErr(e);
    },
  });

  // ---- Kéo thả (chuột + cảm ứng) ----
  const listRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  function startDrag(e: ReactPointerEvent, itemId: string) {
    if (!isOwner) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragId(itemId);
    setOrder(all.map((m) => m.itemId));
  }
  function moveDrag(e: ReactPointerEvent) {
    if (!dragId || !listRef.current) return;
    const rows = Array.from(
      listRef.current.querySelectorAll<HTMLElement>("[data-item-id]"),
    );
    const target = rows.find((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY >= b.top && e.clientY <= b.bottom;
    });
    const overId = target?.dataset.itemId;
    if (!overId || overId === dragId) return;
    setOrder((cur) => {
      const ids = [...(cur ?? all.map((m) => m.itemId))];
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(overId);
      if (from < 0 || to < 0) return cur;
      ids.splice(from, 1);
      ids.splice(to, 0, dragId);
      return ids;
    });
  }
  function endDrag() {
    if (!dragId) return;
    setDragId(null);
    const before = (menuQ.data ?? []).map((m) => m.itemId).join("|");
    const ids = order ?? [];
    const full = [
      ...ids,
      ...(menuQ.data ?? [])
        .map((m) => m.itemId)
        .filter((id) => !ids.includes(id)),
    ];
    if (full.join("|") !== before) saveOrder.mutate(full);
  }
  // Có dữ liệu mới từ canister → bỏ thứ tự tạm.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy khi menu đổi
  useEffect(() => {
    if (!saveOrder.isPending) setOrder(null);
  }, [menuQ.data]);

  const restName = (id: string) =>
    rests.find((r) => r.restaurantId === id)?.name ?? "1 nhà hàng";

  return (
    <div className="flex flex-col gap-3" data-ocid="console.menu_tab">
      {categories.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className={cn(
                "min-h-[44px] shrink-0 rounded-full border px-4 text-[15px] font-bold",
                cat === c
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card text-muted-foreground",
              )}
            >
              {c ?? "Tất cả"} ·{" "}
              {c ? all.filter((m) => m.category === c).length : all.length}
            </button>
          ))}
        </div>
      )}

      {rests.length > 0 && (
        <BranchPicker
          value={branch}
          rests={rests}
          fixed={!!fixedBranch || rests.length === 1}
          onChange={setBranchPick}
        />
      )}

      {menuQ.isLoading && (
        <p className="py-6 text-center text-muted-foreground">Đang tải món…</p>
      )}
      {menuQ.isSuccess && all.length === 0 && (
        <p className="rounded-2xl border border-dashed py-8 text-center text-muted-foreground">
          Chưa có món nào.{isOwner ? " Bấm “Thêm món” để bắt đầu." : ""}
        </p>
      )}

      {shown.length > 0 && (
        <div
          ref={listRef}
          className="flex flex-col rounded-2xl border bg-card px-3"
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          data-ocid="console.menu_list"
        >
          {shown.map((m) => {
            const on =
              branch === ALL
                ? !sold.some(
                    (e) => e.itemId === m.itemId && e.restaurantId === "",
                  )
                : !soldAt(sold, m.itemId, branch);
            const soldHere = sold.filter((e) => e.itemId === m.itemId);
            const custom = isOwner
              ? rests.filter((r) => {
                  const p = branchPrices.get(r.restaurantId)?.get(m.itemId);
                  return p !== undefined && p !== m.price;
                }).length
              : 0;
            return (
              <div
                key={m.itemId}
                data-item-id={m.itemId}
                className={cn(
                  "flex items-center gap-2.5 border-b py-2.5 last:border-0",
                  dragId === m.itemId && "rounded-xl bg-primary/5",
                )}
              >
                {isOwner && !cat && (
                  <button
                    type="button"
                    aria-label={`Kéo để đổi thứ tự ${m.name}`}
                    onPointerDown={(e) => startDrag(e, m.itemId)}
                    className="flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground"
                  >
                    <GripVertical className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={!isOwner}
                  onClick={() => setEditing(m)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  data-ocid="console.menu_item"
                >
                  <Thumb itemId={m.itemId} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        "truncate text-base font-extrabold",
                        !on && "text-muted-foreground line-through",
                      )}
                    >
                      {m.name}
                    </span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {m.category}
                      {m.unitName ? ` · ${m.unitName}` : ""}
                      {m.vatRate > 0n ? ` · VAT ${m.vatRate}%` : ""}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {custom > 0 && (
                        <span className="text-[13px] font-bold text-primary">
                          Giá riêng {custom} nhà hàng
                        </span>
                      )}
                      {!m.visible && (
                        <span className="rounded-md bg-stone-200 px-1.5 text-[12px] font-bold text-stone-700">
                          Đang ẩn với khách
                        </span>
                      )}
                      {soldHere.map((e) => (
                        <span
                          key={e.restaurantId || "all"}
                          className="rounded-md bg-red-100 px-1.5 text-[12px] font-bold text-red-800"
                        >
                          {e.restaurantId
                            ? `Hết tại ${restName(e.restaurantId)}`
                            : "Hết ở mọi nhà hàng"}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[15px] font-extrabold">
                    {formatVnd(m.price)}
                  </span>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`${m.name}: ${on ? "Còn" : "Hết"}`}
                    disabled={toggle.isPending || !m.visible}
                    onClick={() =>
                      toggle.mutate({ itemId: m.itemId, soldOut: on })
                    }
                    className={cn(
                      "flex h-9 min-w-[76px] items-center gap-1.5 rounded-full pl-1 pr-2.5 text-[13px] font-extrabold disabled:opacity-50",
                      on
                        ? "bg-green-100 text-green-800"
                        : "bg-stone-200 text-stone-600",
                    )}
                    data-ocid="console.soldout_toggle"
                  >
                    <span
                      className={cn(
                        "h-7 w-7 rounded-full",
                        on ? "bg-green-700" : "bg-stone-400",
                      )}
                    />
                    {on ? "Còn" : "Hết"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-[13px] text-muted-foreground">
        {isOwner
          ? cat
            ? "Chọn “Tất cả” để kéo ⠿ đổi thứ tự món. Hết món tự “Còn” lại sáng mai."
            : "Giữ ⠿ và kéo để đổi thứ tự hiện cho khách. Hết món tự “Còn” lại sáng mai."
          : "Hết món thì gạt sang Hết — sáng mai tự bật lại. Thêm món, sửa giá: nhờ Chủ đối tác."}
      </p>
      {saveOrder.isPending && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang lưu thứ tự…
        </p>
      )}

      {isOwner && (
        <BigButton onClick={() => setEditing("new")}>
          <Plus className="h-5 w-5" /> Thêm món
        </BigButton>
      )}

      {editing && (
        <ItemSheet
          ctx={ctx}
          item={editing === "new" ? null : editing}
          categories={categories}
          rests={rests}
          branchPrices={branchPrices}
          sold={sold}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

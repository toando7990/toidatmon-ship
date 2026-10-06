// CounterSell — màn "Bán quầy" trong trang quản lý của đối tác (/quan-ly).
// Thiết kế đã duyệt: điện thoại = lưới món 3 cột + thanh "Thanh toán" + giỏ
// trượt lên; máy tính bảng / máy quầy = lưới món bên trái, giỏ cố định bên phải.
//
// Luồng: chạm món → chọn Ăn tại quán / Mang về (+ ghi chú bếp) → Chuyển khoản
// QR (tiền về tự xác nhận) hoặc Tiền mặt (máy tính tiền thối, nhân viên bấm
// "Đã thu tiền") → in phiếu bếp → Đơn mới. "Khách trả sau" để đơn ở tab Đơn,
// thu tiền mặt sau (ăn tại quán trả khi về).
//
// Giá món: giá riêng của chi nhánh (useMenuForRestaurant — giá tại quầy khác
// giá online được). Không tính phí theo đơn tại quầy. VPS kiểm máy + gói quầy.

import { type MenuItem, type Order, PaymentStatus } from "@/backend";
import { usePromotionCountdown } from "@/hooks/usePromotionCountdown";
import {
  useCurrentPromotion,
  useCurrentSalesPromo,
  useMenuForRestaurant,
  useSoldOutToday,
} from "@/hooks/useQueries";
import { getOrder, useCanister } from "@/lib/canister";
import {
  COUNTER_CUS_NAME,
  COUNTER_CUS_PHONE,
  type Cart,
  addToCart,
  cartCount,
  cartLines,
  cartSubtotal,
  cashSuggestions,
  categoriesOf,
  estimateGoldenHour,
  filterMenu,
} from "@/lib/counter-cart";
import { credentialFor } from "@/lib/device-credential";
import {
  type ConsoleDevice,
  formatVnd,
  setKitchenNote,
  shortCode,
} from "@/lib/partner-console";
import {
  getCounterPaymentAccount,
  hasPaymentAccountApi,
} from "@/lib/platform-params";
import {
  isPrinterConnected,
  printKitchenTicket,
  reconnectPrinter,
} from "@/lib/printer";
import { cn } from "@/lib/utils";
import {
  confirmCashPaymentCounter,
  requestQr,
  create as vpsCreate,
} from "@/lib/vps-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Flame, Loader2, Minus, Plus, Search, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Step = "pick" | "cart" | "qr" | "cash" | "done";

interface Placed {
  orderId: string;
  amount: number;
}

interface Props {
  tenantId: string;
  tenantName: string;
  device: ConsoleDevice;
  restaurantId: string;
}

/** Đường dẫn gốc của quán ("/ten-quan" khi chạy dạng toidatmon.vn/ten-quan). */
function basePath(): string {
  const p = window.location.pathname;
  const i = p.indexOf("/quan-ly");
  return i > 0 ? p.slice(0, i) : "";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- Ô món ----------

function Tile({
  item,
  qty,
  onAdd,
}: {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`Thêm ${item.name}`}
      data-ocid="counter_sell.tile"
      className={cn(
        "relative flex min-h-[84px] flex-col justify-between gap-1 rounded-2xl border bg-card p-2.5 text-left active:scale-[0.98]",
        qty > 0 && "border-primary ring-2 ring-primary/30",
      )}
    >
      {qty > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-extrabold text-primary-foreground">
          {qty}
        </span>
      )}
      <span className="line-clamp-2 text-[14px] font-bold leading-tight">
        {item.name}
      </span>
      <span className="text-[13px] font-semibold text-muted-foreground">
        {formatVnd(item.price)}
      </span>
    </button>
  );
}

// ---------- Giỏ (dùng chung điện thoại + máy tính bảng) ----------

function CartPanel({
  lines,
  subtotal,
  discount,
  dineIn,
  note,
  busy,
  qrEnabled,
  onQty,
  onClear,
  onDineIn,
  onNote,
  onPay,
  onClose,
}: {
  lines: ReturnType<typeof cartLines>;
  subtotal: number;
  discount: number;
  dineIn: boolean;
  note: string;
  busy: boolean;
  qrEnabled: boolean;
  onQty: (itemId: string, delta: number) => void;
  onClear: () => void;
  onDineIn: (v: boolean) => void;
  onNote: (v: string) => void;
  onPay: (method: "qr" | "cash") => void;
  onClose?: () => void;
}) {
  const total = subtotal - discount;
  return (
    <div className="flex h-full flex-col gap-3" data-ocid="counter_sell.cart">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">Đơn tại quầy</h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl px-3 text-sm font-bold text-primary"
          >
            Chọn thêm món
          </button>
        ) : (
          lines.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="min-h-[44px] rounded-xl px-3 text-sm font-bold text-muted-foreground"
            >
              Xoá hết
            </button>
          )
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {lines.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            Chạm vào món để thêm
          </p>
        )}
        {lines.map((l) => (
          <div
            key={l.item.itemId}
            className="flex items-center gap-2 border-b pb-2 last:border-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">
                {l.item.name}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {formatVnd(l.amount)}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Bớt ${l.item.name}`}
              onClick={() => onQty(l.item.itemId, -1)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center font-extrabold">{l.qty}</span>
            <button
              type="button"
              aria-label={`Thêm ${l.item.name}`}
              onClick={() => onQty(l.item.itemId, 1)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { v: true, label: "Ăn tại quán" },
          { v: false, label: "Mang về" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={dineIn === o.v}
            onClick={() => onDineIn(o.v)}
            className={cn(
              "h-11 rounded-xl border text-sm font-extrabold",
              dineIn === o.v
                ? "border-foreground bg-foreground text-background"
                : "bg-card",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <input
        value={note}
        maxLength={200}
        onChange={(e) => onNote(e.target.value)}
        placeholder="Ghi chú cho bếp (không bắt buộc)"
        aria-label="Ghi chú cho bếp"
        className="h-11 rounded-xl border bg-background px-3 text-[15px]"
      />

      <dl className="flex flex-col gap-1 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Tiền món</dt>
          <dd>{formatVnd(subtotal)}</dd>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-primary">
            <dt>Giờ vàng</dt>
            <dd>−{formatVnd(discount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-xl font-extrabold">
          <dt>Khách trả</dt>
          <dd>{formatVnd(total)}</dd>
        </div>
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || lines.length === 0 || !qrEnabled}
          title={qrEnabled ? undefined : "Quán chưa cài tài khoản nhận tiền"}
          onClick={() => onPay("qr")}
          data-ocid="counter_sell.pay_qr"
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-extrabold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Chuyển khoản QR
        </button>
        <button
          type="button"
          disabled={busy || lines.length === 0}
          onClick={() => onPay("cash")}
          data-ocid="counter_sell.pay_cash"
          className="flex h-14 items-center justify-center rounded-2xl bg-foreground text-base font-extrabold text-background disabled:opacity-50"
        >
          Tiền mặt
        </button>
      </div>
      {!qrEnabled && (
        <p className="text-center text-xs text-muted-foreground">
          Quán chưa cài tài khoản nhận chuyển khoản — chỉ thu tiền mặt.
        </p>
      )}
    </div>
  );
}

// ---------- Màn chính ----------

export function CounterSell({
  tenantId,
  tenantName,
  device,
  restaurantId,
}: Props) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const { data: menuAll, isLoading } = useMenuForRestaurant(restaurantId);
  const { data: soldOut } = useSoldOutToday();
  const { data: promotion } = useCurrentPromotion();
  const { data: salesPromo } = useCurrentSalesPromo();
  const countdown = usePromotionCountdown(
    promotion?.enabledCounter ? promotion : null,
  );

  // Tài khoản nhận tiền QR tại quầy (tiền về thẳng quán). Chưa cài → chỉ
  // thu tiền mặt.
  const accQ = useQuery({
    queryKey: ["counter-payment", tenantId],
    queryFn: () =>
      getCounterPaymentAccount(actor as NonNullable<typeof actor>, tenantId),
    enabled: !!actor && hasPaymentAccountApi(actor),
    staleTime: 5 * 60_000,
  });
  const qrEnabled = !!accQ.data?.enabled;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [dineIn, setDineIn] = useState(true);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState("");
  const [given, setGiven] = useState<number | null>(null);
  const [customGiven, setCustomGiven] = useState("");
  const [paidBy, setPaidBy] = useState<"qr" | "cash" | null>(null);

  useEffect(() => {
    void reconnectPrinter();
  }, []);

  const menu = useMemo(() => {
    const sold = new Set(soldOut ?? []);
    return (menuAll ?? []).filter((m) => !sold.has(m.itemId));
  }, [menuAll, soldOut]);
  const cats = useMemo(() => categoriesOf(menu), [menu]);
  const tiles = useMemo(
    () => filterMenu(menu, query, category),
    [menu, query, category],
  );
  const lines = useMemo(() => cartLines(menu, cart), [menu, cart]);
  const subtotal = cartSubtotal(lines);
  const discount = estimateGoldenHour(
    promotion,
    countdown.kind === "active",
    subtotal,
  );
  const count = cartCount(lines);
  const total = placed?.amount ?? subtotal - discount;

  function qty(itemId: string, delta: number) {
    setCart((c) => addToCart(c, itemId, delta));
  }

  function resetAll() {
    setCart({});
    setDineIn(true);
    setNote("");
    setPlaced(null);
    setQr(null);
    setQrError("");
    setGiven(null);
    setCustomGiven("");
    setPaidBy(null);
    setQuery("");
    setStep("pick");
    qc.invalidateQueries({ queryKey: ["console", "orders"] });
  }

  async function placeOrder(): Promise<Placed> {
    if (placed) return placed;
    if (!actor) throw new Error("Chưa kết nối");
    const res = await vpsCreate(
      {
        restaurantId,
        pickupAddress: "",
        cusName: COUNTER_CUS_NAME,
        cusPhone: COUNTER_CUS_PHONE,
        cusAddress: "",
        cusTaxCode: "",
        receiverEmail: "",
        items: lines.map((l) => ({
          itemId: l.item.itemId,
          name: l.item.name,
          quantity: l.qty,
          price: Number(l.item.price),
          vatRate: Number(l.item.vatRate),
          unitName: l.item.unitName,
        })),
        shippingFee: 0,
        ahamoveOrderId: "",
        isCounterOrder: true,
        deviceCredential: credentialFor(device.deviceId),
      },
      tenantId,
    );
    if (!res.ok) throw new Error(res.error ?? "Không tạo được đơn");
    // Số tiền thật (đã trừ Giờ Vàng nếu còn lượt) lấy từ canister.
    let amount = subtotal - discount;
    for (let i = 0; i < 3; i++) {
      try {
        const o: Order = await getOrder(
          actor,
          res.orderId,
          device.deviceId,
          tenantId,
        );
        amount = Number(o.amount);
        break;
      } catch {
        await sleep(800);
      }
    }
    setKitchenNote(
      actor,
      tenantId,
      device.deviceId,
      res.orderId,
      dineIn,
      note,
    ).catch(() => toast.warning("Chưa lưu được ghi chú bếp"));
    const p = { orderId: res.orderId, amount };
    setPlaced(p);
    return p;
  }

  async function pay(method: "qr" | "cash") {
    setBusy(true);
    try {
      const p = await placeOrder();
      if (method === "cash") {
        setGiven(null);
        setStep("cash");
        return;
      }
      setStep("qr");
      setQr(null);
      setQrError("");
      const r = await requestQr(p.orderId);
      if (r.ok) setQr(r.qrCode);
      else setQrError(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được đơn");
    } finally {
      setBusy(false);
    }
  }

  // Chờ tiền chuyển khoản về (webhook Tingee → canister).
  useEffect(() => {
    if (step !== "qr" || !placed || !actor) return;
    let stop = false;
    const tick = async () => {
      try {
        const o = await getOrder(
          actor,
          placed.orderId,
          device.deviceId,
          tenantId,
        );
        if (!stop && o.paymentStatus === PaymentStatus.paid) {
          setPaidBy("qr");
          setStep("done");
        }
      } catch {
        /* thử lại vòng sau */
      }
    };
    const id = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [step, placed, actor, device.deviceId, tenantId]);

  async function confirmCash() {
    if (!placed) return;
    setBusy(true);
    try {
      const r = await confirmCashPaymentCounter(
        placed.orderId,
        device.deviceId,
      );
      if (!r.ok) throw new Error(r.message);
      setPaidBy("cash");
      setStep("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xác nhận được");
    } finally {
      setBusy(false);
    }
  }

  // In phiếu bếp tự động khi xong (nếu máy in đã nối).
  useEffect(() => {
    if (step === "done" && isPrinterConnected()) void printTicket();
  }, [step]);

  async function printTicket() {
    if (!placed) return;
    try {
      await printKitchenTicket({
        shopName: tenantName,
        code: shortCode(placed.orderId),
        dineIn,
        note,
        lines: lines.map((l) => ({ name: l.item.name, qty: l.qty })),
        paidLabel:
          paidBy === "cash"
            ? `Đã thu tiền mặt ${formatVnd(placed.amount)}`
            : `Đã chuyển khoản ${formatVnd(placed.amount)}`,
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? `Không in được: ${e.message}` : "Không in được",
      );
    }
  }

  const givenValue =
    given ?? (customGiven ? Number(customGiven.replace(/[^\d]/g, "")) : 0);
  const change = givenValue - total;
  const code = placed ? shortCode(placed.orderId) : "";

  // ---------- Bước thanh toán / xong (toàn màn hình) ----------

  if (step === "qr" || step === "cash" || step === "done") {
    return (
      <section
        className="mx-auto flex max-w-md flex-col items-center gap-4 px-1 py-4 text-center"
        data-ocid={`counter_sell.step_${step}`}
      >
        {step === "qr" && (
          <>
            <p className="text-sm text-muted-foreground">
              Đơn #{code} · cho khách quét để chuyển khoản
            </p>
            <p className="text-4xl font-extrabold">{formatVnd(total)}</p>
            <div className="flex h-[260px] w-[260px] items-center justify-center rounded-2xl border bg-white p-3">
              {qr ? (
                <QRCodeCanvas value={qr} size={232} level="M" />
              ) : qrError ? (
                <p className="text-sm text-destructive">{qrError}</p>
              ) : (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="flex items-center gap-2 text-[15px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang chờ tiền về, tự
              xác nhận…
            </p>
            <button
              type="button"
              onClick={() => setStep("cash")}
              className="h-12 w-full rounded-2xl border text-base font-extrabold"
            >
              Đổi sang tiền mặt
            </button>
          </>
        )}

        {step === "cash" && (
          <>
            <p className="text-sm text-muted-foreground">
              Đơn #{code} · thu tiền mặt
            </p>
            <p className="text-4xl font-extrabold">{formatVnd(total)}</p>
            <p className="self-start text-sm font-bold">Khách đưa</p>
            <div className="grid w-full grid-cols-2 gap-2">
              {cashSuggestions(total).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setGiven(v);
                    setCustomGiven("");
                  }}
                  className={cn(
                    "h-12 rounded-xl border text-base font-extrabold",
                    given === v &&
                      "border-foreground bg-foreground text-background",
                  )}
                >
                  {v === total ? "Vừa đủ" : formatVnd(v)}
                </button>
              ))}
            </div>
            <input
              inputMode="numeric"
              value={customGiven}
              onChange={(e) => {
                setGiven(null);
                setCustomGiven(e.target.value);
              }}
              placeholder="Số khác…"
              aria-label="Số tiền khách đưa"
              className="h-12 w-full rounded-xl border bg-background px-3 text-center text-lg"
            />
            <div className="flex w-full items-baseline justify-between rounded-2xl bg-muted px-4 py-3">
              <span className="font-bold">Trả lại khách</span>
              <span
                className={cn(
                  "text-2xl font-extrabold",
                  change < 0 && "text-destructive",
                )}
              >
                {givenValue > 0
                  ? change >= 0
                    ? formatVnd(change)
                    : `Thiếu ${formatVnd(-change)}`
                  : "—"}
              </span>
            </div>
            <button
              type="button"
              disabled={busy || (givenValue > 0 && change < 0)}
              onClick={confirmCash}
              data-ocid="counter_sell.cash_done"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              Đã thu tiền
            </button>
            <button
              type="button"
              onClick={() => setStep(qr ? "qr" : "cart")}
              className="h-11 w-full text-sm font-bold text-muted-foreground"
            >
              Quay lại
            </button>
          </>
        )}

        {step === "done" && (
          <>
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700">
              <Check className="h-9 w-9" strokeWidth={3} />
            </span>
            <p className="text-3xl font-extrabold">Đã thu {formatVnd(total)}</p>
            <p className="text-[15px] text-muted-foreground">
              Đơn #{code} · {dineIn ? "Ăn tại quán" : "Mang về"}
              {paidBy === "cash" && givenValue > total
                ? ` · trả lại ${formatVnd(change)}`
                : ""}
            </p>
            {salesPromo?.active && salesPromo.enabledCounter && placed && (
              <div className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left">
                <QRCodeCanvas
                  value={`${window.location.origin}${basePath()}/claim/${placed.orderId}`}
                  size={88}
                  level="M"
                />
                <span className="text-sm">
                  Khách quét bằng điện thoại để <b>tích điểm khách quen</b> và
                  nhận phiếu giảm giá lần sau.
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={printTicket}
              className="h-12 w-full rounded-2xl border text-base font-extrabold"
            >
              In phiếu bếp
            </button>
            <button
              type="button"
              onClick={resetAll}
              data-ocid="counter_sell.new_order"
              className="h-14 w-full rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground"
            >
              Đơn mới
            </button>
          </>
        )}

        {(step === "qr" || step === "cash") && (
          <button
            type="button"
            onClick={() => {
              toast.success(`Đơn #${code} chờ thu tiền ở tab Đơn`);
              resetAll();
            }}
            className="text-sm font-bold text-muted-foreground underline"
          >
            Khách trả sau (thu ở tab Đơn)
          </button>
        )}
      </section>
    );
  }

  // ---------- Chọn món ----------

  const promoLine =
    countdown.kind === "active" && promotion
      ? `Giờ vàng còn ${countdown.formatted} · ${[...promotion.tiers]
          .sort((a, b) => Number(a.minOrderValue) - Number(b.minOrderValue))
          .map(
            (t) =>
              `từ ${formatVnd(t.minOrderValue)} giảm ${formatVnd(t.discountAmount)}`,
          )
          .join(" · ")} · tự áp dụng`
      : null;

  const cartPanel = (onClose?: () => void) => (
    <CartPanel
      lines={lines}
      subtotal={subtotal}
      discount={discount}
      dineIn={dineIn}
      note={note}
      busy={busy}
      qrEnabled={qrEnabled}
      onQty={qty}
      onClear={() => setCart({})}
      onDineIn={setDineIn}
      onNote={setNote}
      onPay={pay}
      onClose={onClose}
    />
  );

  return (
    <div className="flex gap-4" data-ocid="counter_sell.page">
      <section className="min-w-0 flex-1 pb-24 md:pb-4">
        <div className="sticky top-[57px] z-10 -mx-4 flex flex-col gap-2 bg-background px-4 pb-2 pt-1">
          <label className="flex h-11 items-center gap-2 rounded-xl border bg-card px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm món, vd: bbh"
              aria-label="Tìm món"
              className="h-full flex-1 bg-transparent text-[15px] outline-none"
            />
            {query && (
              <button
                type="button"
                aria-label="Xoá tìm kiếm"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          {cats.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {[null, ...cats].map((c) => (
                <button
                  key={c ?? "*"}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "h-9 shrink-0 rounded-full border px-3.5 text-sm font-bold",
                    category === c
                      ? "border-foreground bg-foreground text-background"
                      : "bg-card",
                  )}
                >
                  {c ?? "Tất cả"}
                </button>
              ))}
            </div>
          )}
          {promoLine && (
            <p className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-[13px] font-semibold text-primary">
              <Flame className="h-4 w-4 shrink-0" />
              <span className="truncate">{promoLine}</span>
            </p>
          )}
        </div>

        {isLoading && (
          <p className="py-8 text-center text-muted-foreground">
            Đang tải món…
          </p>
        )}
        {!isLoading && tiles.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            {query ? "Không thấy món phù hợp." : "Chưa có món nào đang bán."}
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4 xl:grid-cols-5">
          {tiles.map((m) => (
            <Tile
              key={m.itemId}
              item={m}
              qty={cart[m.itemId] ?? 0}
              onAdd={() => qty(m.itemId, 1)}
            />
          ))}
        </div>
      </section>

      {/* Máy tính bảng / máy quầy: giỏ cố định bên phải */}
      <aside className="sticky top-[72px] hidden h-[calc(100vh-170px)] w-[340px] shrink-0 rounded-2xl border bg-card p-4 md:block">
        {cartPanel()}
      </aside>

      {/* Điện thoại: thanh thanh toán + giỏ trượt lên */}
      {count > 0 && step === "pick" && (
        <div className="fixed inset-x-0 bottom-[68px] z-30 px-3 md:hidden">
          <button
            type="button"
            onClick={() => setStep("cart")}
            data-ocid="counter_sell.open_cart"
            className="flex h-14 w-full items-center justify-between rounded-2xl bg-primary px-4 text-primary-foreground shadow-lg"
          >
            <span className="font-bold">
              {count} món · {formatVnd(subtotal - discount)}
            </span>
            <span className="text-lg font-extrabold">Thanh toán</span>
          </button>
        </div>
      )}
      {step === "cart" && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/40 md:hidden">
          <section
            aria-label="Giỏ hàng tại quầy"
            className="mt-auto flex max-h-[92vh] flex-col rounded-t-3xl bg-background p-4 pb-6"
          >
            {cartPanel(() => setStep("pick"))}
          </section>
        </div>
      )}
    </div>
  );
}

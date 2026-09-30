// Lọc đơn theo hình thức thanh toán — dùng chung cho cấp nhà hàng (Lịch sử
// đơn /driver) và cấp doanh nghiệp (Kế toán). "all" = không lọc; "cash" /
// "transfer" = CHỈ đơn ĐÃ THANH TOÁN bằng hình thức đó.
export type PaymentMethodFilter = "all" | "cash" | "transfer";

export const PAYMENT_METHOD_FILTERS: Array<{
  value: PaymentMethodFilter;
  label: string;
}> = [
  { value: "all", label: "Tất cả" },
  { value: "cash", label: "Tiền mặt" },
  { value: "transfer", label: "Chuyển khoản" },
];

export function matchesPaymentMethod(
  order: { paymentStatus: string; paymentMethod?: string },
  filter: PaymentMethodFilter,
): boolean {
  if (filter === "all") return true;
  return order.paymentStatus === "paid" && order.paymentMethod === filter;
}

export function paymentMethodLabel(method: string | undefined): string {
  if (method === "cash") return "Tiền mặt";
  if (method === "transfer") return "Chuyển khoản";
  return "";
}

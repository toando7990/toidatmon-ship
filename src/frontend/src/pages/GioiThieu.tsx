// GioiThieu — trang "Giới thiệu": thông tin doanh nghiệp, chuỗi cửa hàng,
// điều khoản khuyến mại. Dùng làm nội dung để dán vào ô "Link Điều khoản"
// ở các trang quản lý khuyến mại (Hệ 1/Đăng ký/Doanh số).
//
// Chuỗi cửa hàng lấy THẬT từ danh sách nhà hàng trong hệ thống (useRestaurants)
// — KHÔNG hardcode số lượng chi nhánh. Trước đây từng có câu "Bún bò Huế 65
// có 10 cơ sở tại Hà Nội" bị xoá (xem OrderingPartners.tsx) vì không xác
// thực được — tránh lặp lại bằng cách hiện đúng dữ liệu thật, tự cập nhật
// khi có thêm/bớt chi nhánh, không cần sửa code mỗi lần đổi.

import { useRestaurants } from "@/hooks/useQueries";
import { useTenant } from "@/hooks/useTenant";
import { getCompanyInfo } from "@/lib/company-info";
import { PARTNER_ROOT_DOMAIN } from "@/lib/tenant";
import {
  Building2,
  Globe,
  Info,
  Loader2,
  MapPin,
  Phone,
  ScrollText,
  Store,
} from "lucide-react";

const TERMS: string[] = [
  "Các chương trình khuyến mại chỉ áp dụng cho khách hàng đã xác thực email qua mã OTP.",
  "Mỗi đơn hàng chỉ áp dụng tối đa 1 phiếu giảm giá. Khuyến mại theo khung giờ và phiếu giảm giá có thể cộng dồn với nhau.",
  "Mỗi chương trình có giới hạn số lượt/ngày (tổng và theo từng khách hàng). Khi đạt giới hạn, khuyến mại tự động ngừng áp dụng cho các đơn tiếp theo trong ngày.",
  "Phiếu giảm giá không quy đổi thành tiền mặt, không áp dụng cho đơn đã đặt trước khi phiếu được phát hành.",
  "Quán có quyền điều chỉnh hoặc chấm dứt chương trình khuyến mại bất kỳ lúc nào mà không cần báo trước, đối với các chương trình chưa có khách hàng sử dụng.",
  "Quyết định của quán về các tranh chấp liên quan đến khuyến mại là quyết định cuối cùng.",
];

export default function GioiThieu() {
  const { data: restaurants, isLoading: restaurantsLoading } = useRestaurants();
  const { tenant } = useTenant();
  const co = getCompanyInfo(tenant);
  const site = tenant ? `${tenant.slug}.${PARTNER_ROOT_DOMAIN}` : "";
  const infoRows = [
    { icon: Building2, label: "Đơn vị", value: co.name },
    { icon: ScrollText, label: "Mã số thuế", value: co.taxCode },
    { icon: MapPin, label: "Trụ sở", value: co.address },
    {
      icon: Phone,
      label: "Điện thoại",
      value: co.phone,
      href: co.phone ? `tel:${co.phone.replace(/[^\d+]/g, "")}` : undefined,
    },
    {
      icon: Globe,
      label: "Đặt món online",
      value: site,
      href: site ? `https://${site}` : undefined,
    },
  ].filter((r) => r.value);
  const visibleRestaurants = (restaurants ?? []).filter((r) => r.visible);

  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6"
      data-ocid="gioi_thieu.page"
    >
      <header className="mb-6 flex items-center gap-2">
        <Info className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Giới thiệu
        </h1>
      </header>

      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-primary">
          Về chúng tôi
        </p>
        <h2 className="mb-2 font-display text-lg font-bold leading-snug text-foreground">
          {tenant?.name ?? "Quán của chúng tôi"}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Đặt món online qua Tôi Đặt Món: chọn món, tự gọi tài xế hoặc ghé quán
          nhận món, thanh toán chuyển khoản QR.
        </p>
      </div>

      {/* Thông tin doanh nghiệp — của đúng quán (khai ở trang Đối tác) */}
      <div className="mt-6" data-ocid="gioi_thieu.business_info">
        <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold text-foreground">
          <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
          Thông tin doanh nghiệp
        </h3>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {infoRows.map((r) => (
            <div
              key={r.label}
              className="flex items-start gap-3 px-4 py-3 text-sm"
            >
              <r.icon
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="w-24 shrink-0 text-muted-foreground">
                {r.label}
              </span>
              {r.href ? (
                <a
                  href={r.href}
                  className="break-all font-medium text-primary underline-offset-2 hover:underline"
                >
                  {r.value}
                </a>
              ) : (
                <span className="font-medium text-foreground">{r.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chuỗi cửa hàng — lấy thật từ hệ thống, không hardcode. Dạng
          BẢNG (theo bản xem trước đã duyệt) — 3 cột: Chi nhánh/Địa chỉ/SĐT,
          cuộn ngang nếu tràn màn hình nhỏ. */}
      <div className="mt-6" data-ocid="gioi_thieu.restaurant_chain">
        <h3 className="mb-1 flex items-center gap-1.5 font-display text-base font-bold text-foreground">
          <Store className="h-4 w-4 text-primary" aria-hidden="true" />
          Chuỗi cửa hàng
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Bảng động — tự cập nhật khi thêm/bớt chi nhánh trong hệ thống, không
          cần sửa giao diện.
        </p>
        {restaurantsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải…
          </div>
        ) : visibleRestaurants.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-7 text-center text-sm text-muted-foreground">
            Chưa có thông tin chi nhánh.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-primary/5">
                  <th className="whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-primary">
                    Chi nhánh
                  </th>
                  <th className="whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-primary">
                    Địa chỉ
                  </th>
                  <th className="whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-primary">
                    SĐT
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRestaurants.map((r) => (
                  <tr
                    key={r.restaurantId}
                    className="last:[&>td]:border-b-0"
                    data-ocid={`gioi_thieu.restaurant.${r.restaurantId}`}
                  >
                    <td className="border-b border-border px-3 py-3 align-top">
                      <p className="font-bold text-foreground">{r.name}</p>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-accent">
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-accent"
                          aria-hidden="true"
                        />
                        Đang hoạt động
                      </span>
                    </td>
                    <td className="border-b border-border px-3 py-3 align-top text-muted-foreground">
                      {r.address || "—"}
                    </td>
                    <td className="border-b border-border px-3 py-3 align-top text-muted-foreground">
                      {r.phone || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Điều khoản khuyến mại */}
      <div className="mt-6" data-ocid="gioi_thieu.promotion_terms">
        <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold text-foreground">
          <ScrollText className="h-4 w-4 text-primary" aria-hidden="true" />
          Điều khoản khuyến mại
        </h3>
        <div className="rounded-xl border border-border bg-card p-4">
          <ol className="flex flex-col gap-3">
            {TERMS.map((term, i) => (
              <li key={term} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-foreground">{term}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

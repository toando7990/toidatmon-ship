// Thông tin doanh nghiệp in trên phiếu (phiếu thanh toán, phiếu hoá đơn) —
// của ĐÚNG quán đang xem. TenantProvider gọi setCurrentCompanyTenant() khi đã
// biết quán; các hàm in đọc currentCompanyInfo(). Trường nào quán chưa khai
// báo thì để trống (không in dòng đó) — không bao giờ in thông tin quán khác.

import type { Tenant } from "@/types";

export interface CompanyInfo {
  name: string;
  taxCode: string;
  address: string;
  phone: string;
}

let current: Tenant | null = null;

export function setCurrentCompanyTenant(tenant: Tenant | null) {
  current = tenant;
}

export function getCompanyInfo(tenant: Tenant | null | undefined): CompanyInfo {
  if (!tenant) {
    return { name: "Tôi Đặt Món", taxCode: "", address: "", phone: "" };
  }
  return {
    name: tenant.companyName?.trim() || tenant.name?.trim() || "Tôi Đặt Món",
    taxCode: tenant.taxCode?.trim() ?? "",
    address: tenant.address?.trim() ?? "",
    phone: tenant.phone?.trim() ?? "",
  };
}

/** Thông tin của quán đang hoạt động trên trang này. */
export function currentCompanyInfo(): CompanyInfo {
  return getCompanyInfo(current);
}

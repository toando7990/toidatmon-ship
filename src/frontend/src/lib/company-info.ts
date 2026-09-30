// Thông tin doanh nghiệp dùng cho phiếu in tại quầy (PrintReceipt).
//
// Đa đối tác: mỗi đối tác có tên công ty, mã số thuế, địa chỉ và điện thoại
// riêng. getCompanyInfo(tenant) trả về thông tin của đối tác đang hoạt động,
// và TỰ ĐỘNG rơi về giá trị gốc của Bún Bò Huế 65 khi đối tác chưa khai báo
// (hoặc khi chạy trên miền nháp không có đối tác) — nhờ vậy phiếu in không
// bao giờ trống.

import type { Tenant } from "@/types";

export interface CompanyInfo {
  name: string;
  taxCode: string;
  address: string;
  phone: string;
}

// Giá trị gốc — giữ đồng bộ với trang "Giới thiệu" (GioiThieu.tsx) đã hiển
// thị công khai, là mặc định khi đối tác không có thông tin riêng.
export const COMPANY_INFO: CompanyInfo = {
  name: "Công ty TNHH Thực phẩm Gia Khánh (Gia Khánh Foods)",
  taxCode: "0111063397",
  address: "69 đường Láng, P. Đống Đa, Tp. Hà Nội",
  phone: "0838 656 865",
};

// Trả về thông tin công ty của đối tác, từng trường rơi về giá trị gốc khi
// đối tác không khai báo. tenant = null (miền nháp / chưa tải xong) → giá
// trị gốc.
export function getCompanyInfo(tenant: Tenant | null | undefined): CompanyInfo {
  if (!tenant) return COMPANY_INFO;
  return {
    name: tenant.companyName?.trim() || COMPANY_INFO.name,
    taxCode: tenant.taxCode?.trim() || COMPANY_INFO.taxCode,
    address: tenant.address?.trim() || COMPANY_INFO.address,
    phone: tenant.phone?.trim() || COMPANY_INFO.phone,
  };
}

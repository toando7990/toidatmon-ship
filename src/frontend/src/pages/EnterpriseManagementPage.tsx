// EnterpriseManagementPage — Mô-đun doanh nghiệp gộp "Quản lý thiết bị doanh
// nghiệp": gộp 2 vai trò trước đây tách riêng (Kế toán / Báo cáo bán hàng &
// KM) vào cùng 1 trang, chuyển tab bên trong (cùng cách đã làm ở /driver).
//
// PHÂN QUYỀN (không mở rộng ngoài ý muốn so với trước khi gộp): thiết bị
// KHÔNG PHẢI admin CHỈ thấy đúng 1 tab tương ứng với role đã gắn (accounting
// → chỉ tab Kế toán; salesPromoReporting → chỉ tab Báo cáo) — KHÔNG được
// chuyển sang tab kia dù cùng vào 1 route. Admin (Internet Identity) thấy cả
// 2 tab, tự do chuyển đổi.
//
// Component AccountingPage/SalesPromoReportingPage giữ NGUYÊN VẸN, không sửa
// nội dung bên trong — chỉ thay đổi tầng điều hướng/hiển thị bên ngoài, giảm
// rủi ro khi gộp 2 trang lớn đã có sẵn.

import type { EnterpriseRole } from "@/backend";
import { useDeviceHeader } from "@/contexts/DeviceHeaderContext";
import { useTenantId } from "@/hooks/useQueries";
import { loadEnterpriseActivation } from "@/lib/enterprise-activation";
import { AccountingPage } from "@/pages/AccountingPage";
import { SalesPromoReportingPage } from "@/pages/SalesPromoReportingPage";
import { Banknote, ChartLine } from "lucide-react";
import { useEffect, useState } from "react";

type ManagementTab = "accounting" | "salesReporting";

export function EnterpriseManagementPage({
  role,
  isAdmin,
}: {
  role: EnterpriseRole;
  isAdmin: boolean;
}) {
  const defaultTab: ManagementTab =
    role === "salesPromoReporting" ? "salesReporting" : "accounting";
  const [tab, setTab] = useState<ManagementTab>(defaultTab);

  // Đầu trang GIỐNG /counter: tên + mã thiết bị bên trái, tiêu đề trang bên
  // phải, bỏ logo/menu khách. Admin hiện "Quản trị viên" và GIỮ menu điều
  // hướng (cần sang các trang quản trị khác). Dọn lại khi rời trang.
  const { setDeviceHeader } = useDeviceHeader();
  const tenantId = useTenantId();
  useEffect(() => {
    const act = loadEnterpriseActivation(tenantId);
    setDeviceHeader({
      name: isAdmin ? "Quản trị viên" : act?.name || "Thiết bị doanh nghiệp",
      id: act?.deviceId ?? "",
      pageTitle: tab === "accounting" ? "Kế toán" : "Báo cáo bán hàng & KM",
      keepNav: isAdmin,
    });
    return () => setDeviceHeader(null);
  }, [isAdmin, tab, setDeviceHeader, tenantId]);

  return (
    <div className="flex flex-col gap-6" data-ocid="enterprise_management.page">
      {/* Chỉ admin mới thấy tab switcher (tự do chuyển đổi cả 2 mô-đun) —
          thiết bị doanh nghiệp thường (non-admin) chỉ có ĐÚNG 1 role, luôn
          thấy đúng 1 mô-đun tương ứng, không cần/không được chuyển tab. */}
      {isAdmin && (
        <div
          className="flex gap-1 rounded-lg border border-border bg-card p-1"
          data-ocid="enterprise_management.tabs"
        >
          <button
            type="button"
            onClick={() => setTab("accounting")}
            data-ocid="enterprise_management.tab.accounting"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-smooth ${
              tab === "accounting"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Banknote className="h-4 w-4" aria-hidden="true" />
            Kế toán
          </button>
          <button
            type="button"
            onClick={() => setTab("salesReporting")}
            data-ocid="enterprise_management.tab.sales_reporting"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-smooth ${
              tab === "salesReporting"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ChartLine className="h-4 w-4" aria-hidden="true" />
            Báo cáo bán hàng & KM
          </button>
        </div>
      )}

      {tab === "accounting" ? <AccountingPage /> : <SalesPromoReportingPage />}
    </div>
  );
}

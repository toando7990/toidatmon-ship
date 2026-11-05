// Partner-unavailable notice — rendered when a partner slug is unknown or
// hidden. Never a blank screen: the customer sees a clear Vietnamese notice
// with the attempted host and a way back to the home page.

import { StateScreen } from "@/components/AppStates";
import { useTenant } from "@/hooks/useTenant";
import { PARTNER_ROOT_DOMAIN, partnerPath } from "@/lib/tenant";
import { Home } from "lucide-react";

export function PartnerUnavailable() {
  const { slug } = useTenant();
  const host =
    typeof window !== "undefined"
      ? window.location.hostname
      : PARTNER_ROOT_DOMAIN;

  return (
    <div className="bg-background" data-ocid="partner.notice">
      <StateScreen
        variant="warning"
        className="min-h-[70vh]"
        title={
          <span data-ocid="partner.notice.title">Không tìm thấy đối tác</span>
        }
        description="Đối tác bạn đang truy cập không tồn tại hoặc đã tạm ngừng hoạt động. Vui lòng kiểm tra lại đường dẫn, hoặc quay về trang chủ để tiếp tục."
        primaryAction={{
          label: "Về trang chủ",
          icon: Home,
          to: "/",
          ocid: "partner.notice.home_button",
        }}
      >
        <p className="partner-notice-slug" data-ocid="partner.notice.slug">
          {slug ? partnerPath(slug) : host}
        </p>
      </StateScreen>
    </div>
  );
}

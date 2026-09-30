// Partner-unavailable notice — rendered when a partner slug is unknown or
// hidden. Never a blank screen: the customer sees a clear Vietnamese notice
// with the attempted host and a way back to the home page.

import { useTenant } from "@/hooks/useTenant";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Home } from "lucide-react";

export function PartnerUnavailable() {
  const { slug } = useTenant();
  const host =
    typeof window !== "undefined" ? window.location.hostname : "toidatmon.com";

  return (
    <section className="partner-notice" data-ocid="partner.notice">
      <div className="partner-notice-card">
        <div className="partner-notice-mark" aria-hidden="true">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="partner-notice-title" data-ocid="partner.notice.title">
          Không tìm thấy đối tác
        </h1>
        <p className="partner-notice-body">
          Đối tác bạn đang truy cập không tồn tại hoặc đã tạm ngừng hoạt động.
          Vui lòng kiểm tra lại đường dẫn, hoặc quay về trang chủ để tiếp tục.
        </p>
        <p className="partner-notice-slug" data-ocid="partner.notice.slug">
          {slug ? `${slug}.toidatmon.com` : host}
        </p>
        <div className="partner-notice-actions">
          <Link
            to="/"
            data-ocid="partner.notice.home_button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Về trang chủ
          </Link>
        </div>
      </div>
    </section>
  );
}

// Tiêu đề tab trình duyệt.
//   Trang chính:      "Theo dõi đơn · Tôi Đặt Món" / "Tôi Đặt Món – Món ngon mọi quán…"
//   Trang của quán:   "<Tên quán> – Đặt món online | Tôi Đặt Món"

import { useEffect } from "react";

export const TDM_DEFAULT_TITLE =
  "Tôi Đặt Món – Món ngon mọi quán, giao tận nơi";

export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}

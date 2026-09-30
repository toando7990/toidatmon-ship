// DeviceHeaderContext — cho phép các trang thiết bị (/counter, /driver)
// "đẩy" thông tin thiết bị (tên + mã) lên Layout.tsx (header dùng chung
// toàn app) hiển thị NGAY TRONG HEADER, thay cho logo/tiêu đề "Bún Bò Huế
// 65"/nút "Menu" — theo yêu cầu: các trang này chỉ dành cho nhân viên thao
// tác tại 1 thiết bị cố định, không cần điều hướng sang các trang khách
// hàng khác.
//
// Layout.tsx đọc context này để quyết định: có deviceHeader -> ẩn logo/
// tiêu đề/nút Menu, hiện device info thay vào đó; không có (null, mặc
// định) -> header bình thường như mọi trang khác.

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export interface DeviceHeaderInfo {
  name: string;
  id: string;
  /** Tiêu đề trang (VD "Đặt món tại quầy") — hiện căn phải trong header,
   * đối diện với tên/mã thiết bị bên trái. Tuỳ chọn — trang nào không
   * cần thì bỏ trống. */
  pageTitle?: string;
  /** Giữ menu điều hướng khi đang dùng header thiết bị — cho Admin (VD
   * trang Kế toán): Admin cần đi tiếp sang các trang quản trị khác, còn
   * thiết bị thường chỉ dùng đúng 1 trang nên ẩn menu. */
  keepNav?: boolean;
}

interface DeviceHeaderContextValue {
  deviceHeader: DeviceHeaderInfo | null;
  setDeviceHeader: (info: DeviceHeaderInfo | null) => void;
}

const DeviceHeaderContext = createContext<DeviceHeaderContextValue | null>(
  null,
);

export function DeviceHeaderProvider({ children }: { children: ReactNode }) {
  const [deviceHeader, setDeviceHeader] = useState<DeviceHeaderInfo | null>(
    null,
  );
  return (
    <DeviceHeaderContext.Provider value={{ deviceHeader, setDeviceHeader }}>
      {children}
    </DeviceHeaderContext.Provider>
  );
}

export function useDeviceHeader(): DeviceHeaderContextValue {
  const ctx = useContext(DeviceHeaderContext);
  if (!ctx) {
    throw new Error(
      "useDeviceHeader phải được dùng bên trong DeviceHeaderProvider (Layout.tsx)",
    );
  }
  return ctx;
}

// Giai đoạn 1 trang đối tác: quét QR tài xế dạng đường link, che SĐT, quyền
// gọi VPS (máy đối tác / admin hỗ trợ), nhà hàng đã ghim vị trí.
import { parsePickupQr } from "@/components/QrScannerDialog";
import { maskPhone } from "@/lib/partner-api";
import { hasPin, newRestaurantId } from "@/lib/partner-console";
import { partnerAuthHeaders } from "@/lib/vps-client";
import { describe, expect, it } from "vitest";

describe("trang đối tác — giai đoạn 1", () => {
  it("QR nhận hàng: đọc được cả đường link /<thương hiệu>/driver và JSON cũ", () => {
    expect(
      parsePickupQr(
        "https://toidatmon.vn/bunbohue65/driver?scan_order=ORD-1&scan_code=AB23CD",
      ),
    ).toEqual({ orderId: "ORD-1", pickupCode: "AB23CD" });
    expect(parsePickupQr('{"orderId":"ORD-2","pickupCode":"X1"}')).toEqual({
      orderId: "ORD-2",
      pickupCode: "X1",
    });
    expect(parsePickupQr("https://toidatmon.vn/bunbohue65")).toBeNull();
    expect(parsePickupQr("hello")).toBeNull();
  });

  it("che bớt số điện thoại khách", () => {
    expect(maskPhone("0905123128")).toBe("09•• ••• 128");
    expect(maskPhone("123")).toBe("123");
  });

  it("quyền VPS: máy đối tác → X-Device, còn lại là vé admin", () => {
    expect(partnerAuthHeaders("partner:dev1~k")).toEqual({
      "X-Device": "dev1~k",
    });
    expect(partnerAuthHeaders("ticket")).toEqual({
      "X-Admin-Ticket": "ticket",
    });
    expect(partnerAuthHeaders("")).toEqual({});
  });

  it("nhà hàng chưa ghim vị trí (0,0) và mã nhà hàng mới theo đối tác", () => {
    expect(hasPin({ lat: 0, lng: 0 })).toBe(false);
    expect(hasPin({ lat: 16.46, lng: 107.59 })).toBe(true);
    expect(newRestaurantId("bunbohue65")).toMatch(/^bunbohue65-[a-z0-9]{1,6}$/);
  });
});

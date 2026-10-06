import {
  PLATFORM_ROLES,
  ROLE_INFO,
  forgetPlatformDevice,
  formatCode,
  isStale,
  lastSeenLabel,
  platformCredential,
  roleOf,
} from "@/lib/platform-devices";
import { vpsAuthHeaders } from "@/lib/vps-client";
import { afterEach, describe, expect, it } from "vitest";

const NS = (ms: number) => BigInt(ms) * 1_000_000n;

describe("thiết bị cấp sàn", () => {
  afterEach(() => localStorage.clear());

  it("6 vai trò đều có tên + mô tả + quyền", () => {
    expect(PLATFORM_ROLES).toHaveLength(6);
    for (const r of PLATFORM_ROLES) {
      expect(ROLE_INFO[r].name).toBeTruthy();
      expect(ROLE_INFO[r].can.length).toBeGreaterThan(0);
    }
    expect(roleOf({ support: null })).toBe("support");
    expect(roleOf("ops")).toBe("ops");
  });

  it("mã kích hoạt hiển thị XXXX-XXXX", () => {
    expect(formatCode("K7Q492AB")).toBe("K7Q4-92AB");
  });

  it("dùng gần nhất + lâu không dùng", () => {
    const now = new Date(2026, 9, 6, 18, 0).getTime();
    expect(lastSeenLabel(NS(new Date(2026, 9, 6, 17, 58).getTime()), now)).toBe(
      "Hôm nay 17:58",
    );
    expect(lastSeenLabel(NS(new Date(2026, 9, 5, 15, 12).getTime()), now)).toBe(
      "Hôm qua 15:12",
    );
    expect(lastSeenLabel(NS(now - 12 * 86_400_000), now)).toBe("12 ngày trước");
    expect(isStale(NS(now - 8 * 86_400_000), now)).toBe(true);
    expect(isStale(NS(now - 86_400_000), now)).toBe(false);
  });

  it("thẻ máy lưu trên trình duyệt; gỡ máy xoá thẻ", () => {
    expect(platformCredential()).toBeNull();
    localStorage.setItem(
      "tdm_san_device",
      JSON.stringify({ deviceId: "san-1", token: "abc" }),
    );
    expect(platformCredential()).toBe("san-1~abc");
    forgetPlatformDevice();
    expect(platformCredential()).toBeNull();
  });

  it("VPS: vé admin → X-Admin-Ticket, máy sàn → X-Platform-Device", () => {
    expect(vpsAuthHeaders("abc")).toEqual({ "X-Admin-Ticket": "abc" });
    expect(vpsAuthHeaders("device:san-1~k")).toEqual({
      "X-Platform-Device": "san-1~k",
    });
  });
});

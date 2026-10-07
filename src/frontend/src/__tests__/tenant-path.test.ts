// Không còn tên miền con cho đối tác: trang thương hiệu ở toidatmon.vn/<slug>,
// link cũ trên tên miền con được chuyển hướng.
import {
  legacySubdomainRedirect,
  partnerPath,
  resolveTenant,
} from "@/lib/tenant";
import { describe, expect, it } from "vitest";

describe("đường dẫn đối tác", () => {
  it("chỉ phân giải theo tiền tố đường dẫn", () => {
    expect(resolveTenant("toidatmon.vn", "/bunbohue65/track")).toMatchObject({
      slug: "bunbohue65",
      source: "path",
    });
    // Tên miền con không còn được dùng để phân giải.
    expect(resolveTenant("phoba.toidatmon.vn", "/").status).toBe("default");
    expect(resolveTenant("toidatmon.vn", "/admin").status).toBe("default");
  });
  it("chuyển link tên miền con cũ về đường dẫn", () => {
    expect(
      legacySubdomainRedirect("phoba.toidatmon.vn", "/track", "?id=1"),
    ).toBe("https://toidatmon.vn/phoba/track?id=1");
    expect(legacySubdomainRedirect("bunbohue65.toidatmon.com", "/")).toBe(
      "https://toidatmon.com/bunbohue65",
    );
    expect(legacySubdomainRedirect("toidatmon.vn", "/phoba")).toBeNull();
    expect(legacySubdomainRedirect("www.toidatmon.vn", "/")).toBeNull();
  });
  it("hiển thị địa chỉ trang thương hiệu", () => {
    expect(partnerPath("bunbohue65")).toBe("toidatmon.vn/bunbohue65");
    expect(partnerPath("phoba", "/quan-ly")).toBe("toidatmon.vn/phoba/quan-ly");
  });
});

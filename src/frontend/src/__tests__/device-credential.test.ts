import {
  credentialFor,
  forgetDeviceToken,
  hashDeviceToken,
  newDeviceToken,
  saveDeviceToken,
} from "@/lib/device-credential";
import { beforeEach, describe, expect, it } from "vitest";

describe("device credential", () => {
  beforeEach(() => localStorage.clear());

  it("trả deviceId trần khi chưa có khoá, rỗng khi rỗng", () => {
    expect(credentialFor("dev-1")).toBe("dev-1");
    expect(credentialFor("")).toBe("");
    expect(credentialFor(null)).toBe("");
  });

  it("ghép khoá đã lưu và quên khoá khi đăng xuất", () => {
    saveDeviceToken("dev-1", "abc");
    expect(credentialFor("dev-1")).toBe("dev-1~abc");
    expect(credentialFor("dev-1~abc")).toBe("dev-1~abc");
    forgetDeviceToken("dev-1");
    expect(credentialFor("dev-1")).toBe("dev-1");
  });

  it("sinh khoá 32 byte và băm SHA-256 đúng chuẩn", async () => {
    expect(newDeviceToken()).toMatch(/^[0-9a-f]{64}$/);
    const h = await hashDeviceToken("abc");
    const hex = Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

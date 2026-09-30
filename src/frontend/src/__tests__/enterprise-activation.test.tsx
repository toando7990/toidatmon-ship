// Coverage cho lib/enterprise-activation.ts — BUG THẬT đã sửa: thiết bị
// doanh nghiệp (Kế toán/Báo cáo bán hàng & KM) luôn có restaurantId="" —
// loadEnterpriseActivation() TRƯỚC ĐÂY dùng `parsed?.restaurantId && ...`
// (chuỗi rỗng là falsy trong JS) khiến hàm LUÔN trả về null cho thiết bị
// doanh nghiệp dù đã lưu đúng dữ liệu — EnterpriseGate không bao giờ
// nhận ra đã kích hoạt, hiện lại form kích hoạt ngay sau khi kích hoạt
// THÀNH CÔNG (không bao giờ vào được trang quản lý/Kế toán).

import {
  clearEnterpriseActivation,
  loadEnterpriseActivation,
  saveEnterpriseActivation,
} from "@/lib/enterprise-activation";
import { afterEach, describe, expect, it } from "vitest";

describe("loadEnterpriseActivation / saveEnterpriseActivation", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("BUG THẬT: loads correctly when restaurantId is an EMPTY STRING (enterprise devices — Kế toán/Báo cáo)", () => {
    saveEnterpriseActivation({
      restaurantId: "",
      deviceId: "dev-acc-1",
      name: "Nguyễn Thị Kế Toán",
      tenantId: "t1",
    });

    const loaded = loadEnterpriseActivation();
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual({
      restaurantId: "",
      deviceId: "dev-acc-1",
      name: "Nguyễn Thị Kế Toán",
      tenantId: "t1",
    });
  });

  it("still loads correctly when restaurantId is a real non-empty value", () => {
    saveEnterpriseActivation({
      restaurantId: "R1",
      deviceId: "dev-2",
      name: "Tài xế B",
      tenantId: "t1",
    });

    expect(loadEnterpriseActivation()).toEqual({
      restaurantId: "R1",
      deviceId: "dev-2",
      name: "Tài xế B",
      tenantId: "t1",
    });
  });

  it("returns null when nothing has been saved", () => {
    expect(loadEnterpriseActivation()).toBeNull();
  });

  it("returns null when deviceId is missing (still a real invalid case)", () => {
    localStorage.setItem(
      "bbh_enterprise_activation",
      JSON.stringify({ restaurantId: "", name: "X" }),
    );
    expect(loadEnterpriseActivation()).toBeNull();
  });

  it("clearEnterpriseActivation removes the stored activation", () => {
    saveEnterpriseActivation({
      restaurantId: "",
      deviceId: "dev-acc-1",
      name: "A",
      tenantId: "t1",
    });
    clearEnterpriseActivation();
    expect(loadEnterpriseActivation()).toBeNull();
  });
});

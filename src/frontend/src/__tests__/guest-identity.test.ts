// Coverage cho guest-identity.ts — nền tảng của luồng đặt món từ xa
// KHÔNG cần xác thực email: mỗi trình duyệt phải luôn nhận được 1 email
// ngầm định DUY NHẤT (không đổi giữa các lần gọi/tải trang), và CRUD địa
// chỉ cục bộ phải hoạt động độc lập với API máy chủ.

import {
  addGuestAddress,
  clearGuestIdentity,
  getOrCreateGuestEmail,
  listGuestAddresses,
  removeGuestAddress,
  updateGuestAddress,
} from "@/lib/guest-identity";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  localStorage.clear();
});

describe("getOrCreateGuestEmail", () => {
  it("creates a stable email that persists across calls (same browser/session)", () => {
    const first = getOrCreateGuestEmail();
    const second = getOrCreateGuestEmail();
    expect(first).toBe(second);
    expect(first).toMatch(/^khach-.+@/);
  });

  it("creates DIFFERENT emails after clearGuestIdentity — never a shared default (data-collision bug avoided)", () => {
    const first = getOrCreateGuestEmail();
    clearGuestIdentity();
    const second = getOrCreateGuestEmail();
    expect(second).not.toBe(first);
  });
});

describe("guest address CRUD (local, no server call)", () => {
  it("starts empty", () => {
    expect(listGuestAddresses()).toEqual([]);
  });

  it("adds, updates and removes an address", () => {
    const email = getOrCreateGuestEmail();
    const created = addGuestAddress(email, {
      label: "Nhà",
      address: "123 Le Loi",
      lat: 21.03,
      lng: 105.85,
    });
    expect(listGuestAddresses()).toHaveLength(1);
    expect(created.email).toBe(email);

    const updated = updateGuestAddress(created.id, {
      label: "Công ty",
      address: "456 Tran Phu",
      lat: 10.77,
      lng: 106.7,
    });
    expect(updated?.address).toBe("456 Tran Phu");
    expect(listGuestAddresses()[0].label).toBe("Công ty");

    removeGuestAddress(created.id);
    expect(listGuestAddresses()).toEqual([]);
  });

  it("assigns increasing unique ids across multiple addresses", () => {
    const email = getOrCreateGuestEmail();
    const a = addGuestAddress(email, {
      label: "",
      address: "A",
      lat: 1,
      lng: 1,
    });
    const b = addGuestAddress(email, {
      label: "",
      address: "B",
      lat: 2,
      lng: 2,
    });
    expect(b.id).not.toBe(a.id);
    expect(listGuestAddresses()).toHaveLength(2);
  });

  it("clearGuestIdentity wipes both the guest email and local addresses", () => {
    const email = getOrCreateGuestEmail();
    addGuestAddress(email, { label: "", address: "A", lat: 1, lng: 1 });
    clearGuestIdentity();
    expect(listGuestAddresses()).toEqual([]);
  });
});

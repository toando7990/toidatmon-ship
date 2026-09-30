// PocketIC backend lane for the enterprise device roles.
//
// Covers the accepted enterprise-role behavior against the REAL canister:
//   - an admin can generate an activation code bound to a restaurant + one of
//     the 3 enterprise roles (paymentQueue / accounting / salesPromoReporting)
//     and activate a device with that role;
//   - callerHasEnterpriseRole returns true only for the role the device is
//     bound to (and always true for admin), so each enterprise device is
//     scoped to its own module;
//   - listPendingPaymentOrders is a public read (no device gating): a non-admin
//     caller receives the records with PII + pickupCode blanked, while admin
//     sees the full record WITH pickupCode;
//   - cleanupOrderByDevice and issueInvoiceByDevice are gated to #accounting
//     (or admin);
//   - menu/restaurant edit rights stay with admin (menu-api is admin-only).
//
// NOTE (intentional API change): confirmPaymentByDevice and the #paymentQueue
// device gating on listPendingPaymentOrders were removed from the canister
// (the manual "mark any order paid" path was a real financial hole). The
// #paymentQueue role still exists as a DeviceRole/EnterpriseRole variant and
// is still assignable, so role-binding coverage below keeps exercising it.
//
// Orders are created through the real createOrder endpoint with an HMAC signed
// by a VPS secret the test sets as admin, so the enterprise mutations run
// against real order records.

import { createHmac } from "node:crypto";
import { createIdentity, PocketIc } from "@dfinity/pic";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

const ADMIN = createIdentity("admin-seed").getPrincipal();
const OTHER = createIdentity("other-seed").getPrincipal();
const PUBLIC = createIdentity("public-seed").getPrincipal();

const VPS_SECRET = "test-vps-secret";

let pic: PocketIc | undefined;
let actor: _SERVICE;

// The createOrder HMAC payload is `orderId|restaurantId|amount|goodsAmount`
// (see lib/hmac.mo + core-api.mo). Sign it with the secret the test set.
function orderHmac(orderId: string, restaurantId: string, amount: bigint, goodsAmount: bigint): string {
  const payload = `${orderId}|${restaurantId}|${amount}|${goodsAmount}`;
  return createHmac("sha256", VPS_SECRET).update(payload).digest("hex");
}

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  ({ actor } = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM }));

  // Register ADMIN as the canister's admin and OTHER + PUBLIC as plain users.
  // The enterprise methods call AccessControl.isAdmin, which traps for an
  // unregistered caller, so every non-admin principal used below must be
  // registered as a plain user first.
  actor.setPrincipal(ADMIN);
  await actor._initialize_access_control();
  await actor.assignCallerUserRole(OTHER, { user: null });
  await actor.assignCallerUserRole(PUBLIC, { user: null });

  // Set the VPS secret so createOrder's HMAC can be reproduced in the test.
  const setRes = await actor.setVpsSecret(VPS_SECRET);
  if (!("ok" in setRes)) {
    throw new Error(`setVpsSecret failed: ${JSON.stringify(setRes)}`);
  }
});

afterAll(async () => {
  await pic?.tearDown();
});

// Activate a device with the given role (admin/driver/cashier or one of the
// enterprise roles) and return its id.
async function activateDevice(deviceId: string, restaurantId: string, role: { admin: null } | { cashier: null } | { driver: null } | { paymentQueue: null } | { accounting: null } | { salesPromoReporting: null }) {
  actor.setPrincipal(ADMIN);
  const codeRes = await actor.generateActivationCode(restaurantId, role);
  if (!("ok" in codeRes)) {
    throw new Error(`generateActivationCode failed: ${JSON.stringify(codeRes)}`);
  }
  const code = codeRes.ok.code;

  actor.setPrincipal(PUBLIC);
  const actRes = await actor.activateDevice(code, deviceId, "NV Doanh nghiep", "0901234567");
  if (!("ok" in actRes)) {
    throw new Error(`activateDevice failed: ${JSON.stringify(actRes)}`);
  }
  return actRes.ok;
}

// Create a real order through createOrder (HMAC-signed) as the VPS would.
async function createOrder(orderId: string, restaurantId: string) {
  actor.setPrincipal(PUBLIC);
  const res = await actor.createOrder(
    orderId,
    restaurantId,
    "Nguyen Van A",
    "0901234567",
    "123 Le Loi",
    "",
    "a@example.com",
    [],
    100000n,
    90000n,
    10000n,
    0n,
    "AH-1",
    "tingee-1",
    "https://track",
    "TINGEE-QR",
    "AB23CD",
    0n,
    0n,
    orderHmac(orderId, restaurantId, 100000n, 90000n),
  );
  if (!("ok" in res)) {
    throw new Error(`createOrder failed: ${JSON.stringify(res)}`);
  }
  return res.ok;
}

describe("enterprise device roles", () => {
  it("answers an empty-state read instead of trapping", async () => {
    actor.setPrincipal(PUBLIC);
    await expect(actor.callerHasEnterpriseRole("no-such-device", { paymentQueue: null })).resolves.toBe(false);
    await expect(actor.listPendingPaymentOrders("R1")).resolves.toEqual([]);
  });

  it("binds a device to each enterprise role at activation and reports it via callerHasEnterpriseRole", async () => {
    await activateDevice("dev-pq", "R1", { paymentQueue: null });
    await activateDevice("dev-acc", "R1", { accounting: null });
    await activateDevice("dev-sales", "R1", { salesPromoReporting: null });

    actor.setPrincipal(PUBLIC);
    // Each device reports true only for its own role.
    await expect(actor.callerHasEnterpriseRole("dev-pq", { paymentQueue: null })).resolves.toBe(true);
    await expect(actor.callerHasEnterpriseRole("dev-pq", { accounting: null })).resolves.toBe(false);
    await expect(actor.callerHasEnterpriseRole("dev-acc", { accounting: null })).resolves.toBe(true);
    await expect(actor.callerHasEnterpriseRole("dev-acc", { paymentQueue: null })).resolves.toBe(false);
    await expect(actor.callerHasEnterpriseRole("dev-sales", { salesPromoReporting: null })).resolves.toBe(true);
    await expect(actor.callerHasEnterpriseRole("dev-sales", { paymentQueue: null })).resolves.toBe(false);

    // Admin always passes regardless of device binding.
    actor.setPrincipal(ADMIN);
    await expect(actor.callerHasEnterpriseRole("", { paymentQueue: null })).resolves.toBe(true);
  });

  it("serves listPendingPaymentOrders to any caller, blanking PII + pickupCode for non-admin", async () => {
    await createOrder("ORD-PQ-1", "R1");

    // A non-admin caller sees the pending order, but with PII + pickupCode
    // blanked (the pickup code must be learned in person, not read off screen).
    actor.setPrincipal(PUBLIC);
    const publicOrders = await actor.listPendingPaymentOrders("R1");
    expect(publicOrders.map((o) => o.orderId)).toContain("ORD-PQ-1");
    const publicOrder = publicOrders.find((o) => o.orderId === "ORD-PQ-1");
    expect(publicOrder?.pickupCode).toBe("");
    expect(publicOrder?.cusAddress).toBe("");
    expect(publicOrder?.cusTaxCode).toBe("");
    expect(publicOrder?.receiverEmail).toBe("");

    // Admin sees the full record WITH pickupCode.
    actor.setPrincipal(ADMIN);
    const adminOrders = await actor.listPendingPaymentOrders("R1");
    expect(adminOrders.find((o) => o.orderId === "ORD-PQ-1")?.pickupCode).toBe("AB23CD");
  });

  it("lets an accounting device clean up an order and rejects a non-accounting caller", async () => {
    await createOrder("ORD-ACC-1", "R1");

    // A non-accounting caller is rejected.
    actor.setPrincipal(PUBLIC);
    const denied = await actor.cleanupOrderByDevice("dev-pq", "ORD-ACC-1");
    expect("err" in denied && denied.err).toBe("Accounting role required");

    // An accounting device cleans up (cancels) the order.
    const ok = await actor.cleanupOrderByDevice("dev-acc", "ORD-ACC-1");
    expect("ok" in ok && ok.ok.bookingStatus).toEqual({ cancelled: null });
  });

  it("lets an accounting device issue an invoice and rejects a non-accounting caller", async () => {
    await createOrder("ORD-ACC-2", "R1");

    // A non-accounting caller is rejected.
    actor.setPrincipal(PUBLIC);
    const denied = await actor.issueInvoiceByDevice("dev-pq", "ORD-ACC-2", "INV-1", "https://pdf");
    expect("err" in denied && denied.err).toBe("Accounting role required");

    // An accounting device issues the invoice.
    const ok = await actor.issueInvoiceByDevice("dev-acc", "ORD-ACC-2", "INV-1", "https://pdf");
    expect("ok" in ok && ok.ok.invoiceStatus).toEqual({ invoiced: null });
    expect(ok.ok.invoiceId).toBe("INV-1");
    expect(ok.ok.pdfUrl).toBe("https://pdf");
  });

  it("keeps menu/restaurant edit rights with admin (enterprise devices are rejected)", async () => {
    // An enterprise device cannot toggle a menu item's visibility (admin-only).
    actor.setPrincipal(PUBLIC);
    const menuRes = await actor.setItemVisible("item-1", false);
    expect("err" in menuRes && menuRes.err).toBe("Admin only");

    // An enterprise device cannot update a restaurant (admin-only).
    const restRes = await actor.updateRestaurant("R1", "Nhà hàng A", "123 Le Loi", "0901234567", true, 0, 0);
    expect("err" in restRes && restRes.err).toBe("Admin only");
  });
});

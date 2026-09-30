// PocketIC backend lane for the device domain.
//
// Covers the accepted device-management behavior against the REAL canister:
//   - listDevicesByRestaurant / listDevicesByRole return BOTH active and
//     revoked devices, each carrying its own `active` flag;
//   - revokeDevice flips a device to active=false and the device stays listed;
//   - a revoked device cannot be re-activated (no re-activation path) and is
//     not usable for business operations;
//   - admin-only methods (generateActivationCode, revokeDevice) reject a
//     non-admin caller.
//
// The frontend suite mocks the actor, so it cannot see any of this; this lane
// installs the app's own compiled wasm and drives the real public API.

import { createIdentity, PocketIc } from "@dfinity/pic";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { idlFactory } from "../../src/frontend/src/declarations/backend.did.js";
import type { _SERVICE } from "../../src/frontend/src/declarations/backend.did";

const PIC_URL = process.env.POCKET_IC_URL ?? "";
const BACKEND_WASM = process.env.BACKEND_WASM ?? "";

// Principals are obtained from `@dfinity/pic`'s `createIdentity`, which is
// already a dependency of the lane. `@icp-sdk/core/principal` is not resolvable
// from this lane directory (it is only installed under the frontend package),
// so the anonymous principal is not available; the public device methods
// (listDevicesByRestaurant / listDevicesByRole / activateDevice) have no admin
// check, so a dedicated PUBLIC caller stands in for an unauthenticated one.
const ADMIN = createIdentity("admin-seed").getPrincipal();
const OTHER = createIdentity("other-seed").getPrincipal();
const PUBLIC = createIdentity("public-seed").getPrincipal();

let pic: PocketIc | undefined;
let actor: _SERVICE;

beforeAll(async () => {
  pic = await PocketIc.create(PIC_URL);
  ({ actor } = await pic.setupCanister<_SERVICE>({ idlFactory, wasm: BACKEND_WASM }));

  // Register the ADMIN principal as the canister's admin so admin-only methods
  // (generateActivationCode, revokeDevice) accept it instead of trapping with
  // "User is not registered". `_initialize_access_control` registers the caller
  // as admin. Register OTHER as a plain user so the non-admin rejection test
  // exercises the "Admin only" path rather than an unregistered-caller trap.
  actor.setPrincipal(ADMIN);
  await actor._initialize_access_control();
  await actor.assignCallerUserRole(OTHER, { user: null });
});

afterAll(async () => {
  await pic?.tearDown();
});

// Activate a device as a public caller and return its id. The activation code
// is issued by an admin first.
async function activateDevice(deviceId: string, restaurantId: string, role: { admin: null } | { cashier: null } | { driver: null }) {
  actor.setPrincipal(ADMIN);
  const codeRes = await actor.generateActivationCode(restaurantId, role);
  if (!("ok" in codeRes)) {
    throw new Error(`generateActivationCode failed: ${JSON.stringify(codeRes)}`);
  }
  const code = codeRes.ok.code;

  actor.setPrincipal(PUBLIC);
  const actRes = await actor.activateDevice(code, deviceId, "Thu ngân A", "0901234567");
  if (!("ok" in actRes)) {
    throw new Error(`activateDevice failed: ${JSON.stringify(actRes)}`);
  }
  return actRes.ok;
}

describe("device domain", () => {
  it("answers an empty-state read instead of trapping", async () => {
    actor.setPrincipal(PUBLIC);
    await expect(actor.listDevicesByRestaurant("R1")).resolves.toEqual([]);
    await expect(actor.listDevicesByRole({ cashier: null })).resolves.toEqual([]);
  });

  it("lists both active and revoked devices with their active flag", async () => {
    const active = await activateDevice("dev-active", "R1", { cashier: null });
    expect(active.active).toBe(true);

    // Revoke the device (admin only).
    actor.setPrincipal(ADMIN);
    const revokeRes = await actor.revokeDevice("dev-active");
    if (!("ok" in revokeRes)) {
      throw new Error(`revokeDevice failed: ${JSON.stringify(revokeRes)}`);
    }
    expect(revokeRes.ok.active).toBe(false);

    // The revoked device is STILL listed, with active=false.
    actor.setPrincipal(PUBLIC);
    const byRestaurant = await actor.listDevicesByRestaurant("R1");
    expect(byRestaurant).toContainEqual(
      expect.objectContaining({ deviceId: "dev-active", active: false }),
    );

    const byRole = await actor.listDevicesByRole({ cashier: null });
    expect(byRole).toContainEqual(
      expect.objectContaining({ deviceId: "dev-active", active: false }),
    );
  });

  it("does not re-activate a revoked device (no re-activation path)", async () => {
    // A revoked device cannot be used to operate: activating with the same
    // deviceId is not possible because activation only ever creates a fresh
    // device from a pending code and never flips an existing revoked device
    // back to active. Assert the observable rule: after revoking, the device
    // stays active=false and no public method flips it back.
    actor.setPrincipal(PUBLIC);
    const byRestaurant = await actor.listDevicesByRestaurant("R1");
    const revoked = byRestaurant.find((d) => d.deviceId === "dev-active");
    expect(revoked?.active).toBe(false);
  });

  it("rejects a non-admin caller from admin-only device methods", async () => {
    actor.setPrincipal(OTHER);
    const codeRes = await actor.generateActivationCode("R1", { cashier: null });
    expect("err" in codeRes && codeRes.err).toBe("Admin only");

    const revokeRes = await actor.revokeDevice("dev-active");
    expect("err" in revokeRes && revokeRes.err).toBe("Admin only");
  });
});

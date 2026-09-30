// Behavioral API documentation for the backend. Static Markdown returned by
// getApiDoc — no runtime state is read, so the mixin takes no parameters.
mixin () {
  public query func getApiDoc() : async Text {
    "# Multi-Partner Backend API

## Purpose

This Motoko canister powers a multi-partner restaurant ordering platform. Each
**partner (tenant)** owns its own restaurant chain, its own menu, and its own
subdomain of `toidatmon.com` (for example `bunbohue65.toidatmon.com`). Core data
— orders, menus, restaurants, devices, promotions, vouchers, payment mode, and
store hours — lives on the canister and is **fully isolated between partners**.
Customers, addresses, logs, invoices, and analytics live on the VPS.

Every tenant-owned entity carries a `tenantId` (a `Text` slug). Tenant-scoped
read/write endpoints take an explicit `tenantId` parameter, and a caller may
only read or write data for the tenant it belongs to. The central admin may act
across tenants.

## Tenant (partner) domain

A tenant is created by the **central admin** — there is no partner
self-registration. Each tenant carries a `slug` (the subdomain label), a display
`name`, branding (`logoUrl`, `brandColor`), contact/company info (`companyName`,
`taxCode`, `address`, `phone`), an `active` flag, and `createdAt`/`updatedAt`
timestamps.

The frontend resolves the current partner from the request hostname subdomain,
falling back to a path prefix `/<slug>`. An unknown or inactive slug must never
render a blank screen — the frontend shows a friendly message instead.

The platform ships with one pre-existing partner, the **default tenant**
`bunbohue65` (slug `bunbohue65`), which owns all data that existed before the
multi-partner upgrade. It is active and behaves like any other partner.

### Public methods

- `createTenant(slug, name, logoUrl, companyName, taxCode, address, phone, brandColor) : async Result<Tenant, Text>` — Creates a partner. **Central admin only.** Returns `#err` when the slug already exists or is invalid.
- `updateTenant(tenantId, name, logoUrl, companyName, taxCode, address, phone, brandColor) : async Result<Tenant, Text>` — Updates a partner's profile (tenantId, slug, and createdAt are immutable). **Central admin only.**
- `setTenantActive(tenantId, active) : async Result<Tenant, Text>` — Activates or deactivates a partner. Deactivation hides the partner from the frontend but does **not** delete its data. **Central admin only.**
- `listTenants(activeOnly : Bool) : async [Tenant]` — **Query**, public. With `activeOnly = true` only active partners are returned; non-admin callers always see only active partners.
- `getTenant(tenantId) : async ?Tenant` — **Query**, public. Returns `null` for an inactive partner unless the caller is the central admin.
- `getTenantBySlug(slug) : async ?Tenant` — **Query**, public. Resolves a partner from a hostname subdomain or a `/<slug>` path prefix. Returns `null` for an inactive partner unless the caller is the central admin.

### Tenant-scoped data

Every tenant-owned entity carries a `tenantId`: orders, menu items,
restaurants, devices, pending activations, promotions, vouchers, registration
promos, and sales promos. Per-tenant configuration (payment mode, store hours)
is keyed by `tenantId`. The usage/anti-duplicate counters (`kmUsage`,
`kmDailyCount`, `promotionUsed`, `registrationBonusIssued`, `salesBonusIssued`)
are also tenant-scoped by prefixing their composite keys with the `tenantId`.

Tenant-scoped read/write variants of the restaurant, menu, device, promotion,
voucher, payment-mode, and store-hours endpoints take an explicit `tenantId`
parameter. A caller may only read or write data for the tenant it belongs to;
the central admin may act across tenants.

### Proving tenant membership

A device is bound to a `tenantId` at activation time. The device activation and
role check (`callerHasEnterpriseRole`) verifies the device's tenant, and a
**tenant-admin** role (`#tenantAdmin`) is distinct from the central admin: a
tenant admin manages only its own partner's data, while the central admin
manages partners themselves.

## Device domain

Devices (POS / driver / cashier / enterprise tablets) are registered to a
restaurant through a one-time activation code. Each device carries a role, a
`tenantId`, and an `active` flag that controls whether it may operate. The role
set is `#admin`, `#driver`, `#cashier`, `#tenantAdmin`, plus three enterprise
roles: `#paymentQueue` (hàng đợi thanh toán), `#accounting` (kế toán), and
`#salesPromoReporting` (báo cáo bán hàng và KM). Enterprise roles are bound to a
device at activation time via a restaurant+role activation code, consistent with
the admin/driver/cashier flow. Menu/restaurant edit rights stay with `#admin`
and `#tenantAdmin` only.

### Public methods

- `generateActivationCode(tenantId : Text, restaurantId : Text, role : DeviceRole, deviceId : Text) : async Result<{ code : Text; tenantId : Text; restaurantId : Text; role : DeviceRole; createdAt : Int; expiresAt : Int; used : Bool }, Text>` — Issues a 6-character uppercase-alphanumeric activation code bound to a tenant, restaurant, and role. **Admin or tenant-admin only.** The code expires after 15 minutes.
- `activateDevice(code : Text, deviceId : Text, name : Text, phone : Text) : async Result<Device, Text>` — Consumes a valid, unexpired pending activation and registers a device with `active = true`. The device inherits the `tenantId` from the activation. **Public** (no admin required). `name`/`phone` are the employee's own name and contact phone entered at activation time. Returns `#err(\"Invalid code\")` for an unknown code, or `#err(\"Expired or used\")` for an expired or already-consumed code.
- `revokeDevice(tenantId : Text, deviceId : Text, adminDeviceId : Text) : async Result<Device, Text>` — Deactivates a device by setting its `active` field to `false`. **Admin or tenant-admin only.** Returns `#err(\"Not found\")` for an unknown device. A revoked device remains in storage but can no longer operate.
- `cleanupExpiredActivations() : async Nat` — Removes expired or used pending activations and returns the count removed. **Admin only.** Returns `0` for a non-admin caller.
- `listDevicesByRestaurant(tenantId : Text, restaurantId : Text) : async [Device]` — Returns **all** devices for a restaurant within the tenant, both active and revoked. **Query** (no auth gate).
- `listDevicesByRole(tenantId : Text, role : DeviceRole) : async [Device]` — Returns **all** devices with the given role within the tenant, both active and revoked. **Query** (no auth gate). The admin device-management page uses this to display and filter devices by enterprise role.
- `callerHasEnterpriseRole(deviceId : Text, tenantId : Text, role : EnterpriseRole) : async Bool` — **Query**. Returns `true` when the caller is an admin, or when the device identified by `deviceId` is active, belongs to `tenantId`, and is bound to the given enterprise role (`#paymentQueue`, `#accounting`, or `#salesPromoReporting`). Because the device model keys devices by a per-browser hardware `deviceId` with no principal binding, the caller must supply the `deviceId` it is acting as — the backend cannot infer it from the caller principal alone.

### Enterprise device roles

Enterprise roles are bound to a device at activation time via a
restaurant+role activation code (same flow as admin/driver/cashier). They gate
business APIs by device role rather than by HMAC:

- **`#paymentQueue`** (hàng đợi thanh toán): may list pending-payment orders
  (`listPendingPaymentOrders`) and manually confirm an order's payment
  (`confirmPaymentByDevice`).
- **`#accounting`** (kế toán): may look up orders with full PII and the payment
  verification image (`listOrders`, `getOrder`, `getOrdersByEmail`), manually
  clean up an order (`cleanupOrderByDevice`), and manually issue an e-invoice
  (`issueInvoiceByDevice`).
- **`#salesPromoReporting`** (báo cáo bán hàng và KM): may manage and track
  promotions, sales promos, and registration promos (the promotion/sales/registration
  CRUD endpoints), while admin retains full access.

Admin always passes every enterprise gate. Menu/restaurant edit rights remain
with `#admin` and `#tenantAdmin` only — enterprise roles cannot edit menus or
restaurants.

### Enterprise device-gated mutations

The existing order mutation endpoints (`updatePaymentStatus`,
`updateInvoiceStatus`, `cancelOrder`, `pruneOldOrdersNow`) are HMAC-verified VPS
endpoints that a device cannot call (a device cannot produce a valid HMAC).
These new endpoints let enterprise device roles perform their manual operations,
gated by device role instead of HMAC. The HMAC endpoints are unchanged for the
VPS.

- `confirmPaymentByDevice(tenantId : Text, deviceId : Text, orderId : Text) : async Result<Order, Text>` — Marks an order's payment as `#paid` manually. Gated to a `#paymentQueue` device or admin; other callers receive `#err(\"Payment queue role required\")`. Delegates to the same apply logic as the VPS endpoint, so a manual confirmation transitions a `#confirmed` order to `#pickedUp` exactly like an automated `#paid` update. Returns `#err(\"Order not found\")` for an unknown order.
- `cleanupOrderByDevice(tenantId : Text, deviceId : Text, orderId : Text) : async Result<Order, Text>` — Manually cleans up (cancels) an order. Gated to a `#accounting` device or admin; other callers receive `#err(\"Accounting role required\")`. Returns `#err(\"Order not found\")` for an unknown order.
- `issueInvoiceByDevice(tenantId : Text, deviceId : Text, orderId : Text, invoiceId : Text, pdfUrl : Text) : async Result<Order, Text>` — Manually issues an e-invoice for an order, writing `invoiceStatus = #invoiced` plus the supplied `invoiceId` and `pdfUrl`. Gated to a `#accounting` device or admin; other callers receive `#err(\"Accounting role required\")`. Returns `#err(\"Order not found\")` for an unknown order.

### Device listing behavior

`listDevicesByRestaurant` and `listDevicesByRole` return **every** matching
device within the tenant regardless of its `active` state. Revoked devices
(`active = false`) are included so the admin UI can display them as revoked
rather than hiding them. Each returned `Device` carries its own `active` field
so the caller can distinguish usable devices from revoked ones.

Revoking a device does **not** remove it from storage and does **not** change
the two list functions' behavior beyond the `active` flag. A revoked device is
still returned by both list functions, but with `active = false`.

### Revoked devices cannot operate

The `active` flag is the single source of truth for whether a device may
operate. A revoked device (`active = false`) must not be used for business
operations. Activation is one-way: `activateDevice` only ever creates a device
with `active = true` from a pending activation; it never re-activates an
existing revoked device. `revokeDevice` only ever flips `active` to `false`.
There is no endpoint that re-activates a revoked device.

## Authentication and authorization

The app's frontend pins an Internet Identity derivation origin, published at
`/.well-known/ii-derivation-origin` when available. An agent already holding
the user's Internet Identity authorization derives the correct per-app
principal against that origin (for example
`icp identity link web <name> --app <host>`). Such a delegation acts with the
user's full authority in this app until it expires.

Authorization is enforced on the backend via role-based access control. The
following device methods require a signed-in caller who is an **admin**:
`generateActivationCode`, `revokeDevice`, and `cleanupExpiredActivations`.
Non-admin callers receive `#err(\"Admin only\")` from `generateActivationCode`
and `revokeDevice`, and `0` from `cleanupExpiredActivations`.

The tenant write methods (`createTenant`, `updateTenant`, `setTenantActive`)
require the **central admin**. The tenant read methods (`listTenants`,
`getTenant`, `getTenantBySlug`) are public queries so the frontend can resolve a
partner before the user signs in.

`activateDevice` is **public** — any caller may consume a valid activation
code. `listDevicesByRestaurant` and `listDevicesByRole` are public **query**
methods with no auth gate.

Enterprise device roles gate business APIs by device role. Because the device
model keys devices by a per-browser hardware `deviceId` with no principal
binding, the gated endpoints receive the caller's `deviceId` as a parameter and
the backend checks it against the device store (`deviceHasRole`). Admin always
passes every enterprise gate. The enterprise-gated mutation endpoints
(`confirmPaymentByDevice`, `cleanupOrderByDevice`, `issueInvoiceByDevice`)
return `#err(\"Payment queue role required\")` / `#err(\"Accounting role required\")`
when the caller is neither an admin nor a device bound to the required role.

### Registration prerequisite

Access control is initialized lazily. A caller that has never signed in through
the app's own frontend is **unregistered**, even when it belongs to the app's
owner, and a signed-in caller derived against a different origin is a different
principal than the one the frontend registered. Before any role-guarded call —
including guarded queries — a direct API caller must register by calling
`_initialize_access_control` once as a signed-in caller. The **first** caller to
initialize receives the `#admin` role; every subsequent caller receives `#user`.
An unregistered caller receives `#err(\"Admin only\")` from admin-guarded
endpoints, `0` from `cleanupExpiredActivations`, and `false` from
`callerHasEnterpriseRole`; an anonymous caller is treated the same as any other
unregistered principal.

## Units and encodings

- **Timestamps**: `createdAt`, `expiresAt`, and `activatedAt` are `Int`
  nanoseconds since the Unix epoch (matching `Time.now()`). `expiresAt` is
  `createdAt + 15 minutes` (900,000,000,000 ns).
- **Identifiers**: `deviceId`, `restaurantId`, and `tenantId` are `Text`.
- **Tenant slug**: a lowercase label matching `[a-z0-9-]`, used as the
  `toidatmon.com` subdomain and as the fallback `/<slug>` path prefix.
- **Activation codes**: 6-character uppercase alphanumeric strings
  (`A-Z0-9`). They are single-use and expire 15 minutes after creation.
- **DeviceRole**: a variant — `#admin`, `#driver`, `#cashier`, `#tenantAdmin`, `#paymentQueue`, `#accounting`, or `#salesPromoReporting`.
- **Device.active**: a `Bool` — `true` means the device is currently usable,
  `false` means it has been revoked.

## Lifecycle and polling rules

A device lifecycle is: pending activation (code issued) → activated
(`active = true`) → revoked (`active = false`). There is no re-activation path.

`cleanupExpiredActivations` is a maintenance operation that removes stale
pending activations. It is safe to call periodically; it is idempotent in the
sense that already-removed codes are simply absent.

## Mutation retry safety

- `activateDevice` is **not** idempotent: consuming a code marks it `used`, so
  retrying the same call returns `#err(\"Expired or used\")`. Do not retry an
  activation that already succeeded.
- `revokeDevice` is idempotent: revoking an already-revoked device succeeds and
  returns the device with `active = false`.
- `generateActivationCode` creates a fresh code on every call; each call is
  independent.

## Errors, traps, limits, and gotchas

- `activateDevice` returns `#err(\"Invalid code\")` for an unknown code and
  `#err(\"Expired or used\")` for an expired or already-consumed code.
- `revokeDevice` returns `#err(\"Not found\")` for an unknown device.
- Activation codes expire 15 minutes after creation; an expired code cannot be
  used.
- A revoked device is still listed by `listDevicesByRestaurant` and
  `listDevicesByRole` (with `active = false`) — it is not hidden, but it must
  not be used for operations.
- Tenant-scoped endpoints return empty results or `#err(\"Not found\")` when the
  supplied `tenantId` does not match the entity's owner; they never leak data
  across partners.
"
  };
};

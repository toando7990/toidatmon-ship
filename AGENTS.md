# Project Guidance

## User Preferences

- Multi-partner platform: a partner (đối tác) is a legal entity (e.g. Công ty Gia Khánh Foods) that owns exactly ONE brand (e.g. Bún Bò Huế 65) with one or more restaurants; the platform deals with the partner's legal info, not restaurant info
- No per-partner subdomain: the brand page lives at toidatmon.vn/<slug>; old partner subdomains redirect to that path (lib/tenant.ts legacySubdomainRedirect)
- One bank account per partner (PartnerBank) for both payouts and counter bank-transfer QR at every restaurant of that partner
- Never render a blank screen for an unknown or hidden partner slug
- Core data (orders, menus, restaurants, devices, promotions) lives on the canister; customers, addresses, logs, invoices, and analytics live on the VPS
- Full data isolation between partners
- Central admin creates partners
- Vietnamese language UI

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- The VPS worker (vps-worker/) has no test runner and is not exercised by any test lane; its cron selection window, bkav.js parseProxyResponse, bkav-proxy normalizeSoapFault, bkav_logs raw write, and invoiceId/pdfUrl recording are unverified by the suite.
- pnpm fix (biome) reformats src/frontend/src/__tests__/AccountingPage.failed-invoice.test.tsx on every run; revert it with git checkout so the tester-owned test file stays untouched.
- The BKAV invoice fix spans vps-worker/ (cron window, parseProxyResponse, normalizeSoapFault, bkav_logs raw write) and the frontend AccountingPage; vps-worker has no test runner and is not exercised by any lane, so its behavior is verified only by source reading.
- The BKAV fault path spans two files: bkav-proxy/server.js normalizeSoapFault emits '<R><E>FAULT:code | reason</E></R>' and bkav.js parseProxyResponse splits on the first ' | ' — read both together to confirm no 'UNKNOWN' placeholder.
- The same-day invoice cron window (created_at >= startOfTodayUtc7 plus invoice_status='none') is what guarantees old stuck/failed orders are never rescanned.
- The manual reissue path in enterprise-actions.js accepts orders back to the previous working day, but the cron only scans same-day orders, so a yesterday-created order queued for reissue stays 'none' — this is the explicitly out-of-scope old-order path.
- src/frontend/env.json holds literal 'undefined' placeholders by design; Caffeine injects real values at deploy time, so a local build failing the env-json-precheck is expected and must not be 'fixed' in source.
- The BKAV decrypt failure ('wrong final block length') is fixed in vps-worker/bkav-proxy/server.js: decryptBkavResponse now returns { xml, label } and tryDecryptVariants attempts valid AES-256-CBC variants (padding none, hex key/iv, double-base64) before giving up.
- On decrypt failure the proxy emits '<R><E>DECRYPT_ERROR:<reason></E></R>' (empty payload arrives as 'DECRYPT_ERROR:EMPTY_PAYLOAD | ...') instead of returning raw ciphertext; parseProxyResponse in vps-worker/src/lib/bkav.js must keep matching DECRYPT_ERROR/EMPTY_PAYLOAD or the real reason degrades to PARSE_FAILED.
- parseProxyResponse marker branch order must stay FAULT: -> PROXY_ERROR -> DECRYPT_ERROR: -> EMPTY_PAYLOAD -> empty -> ExecCommandResult -> direct JSON -> PARSE_FAILED so specific markers are never shadowed.
- The proxy is not importable into any test lane (standalone CommonJS systemd service, no exports, import-time HTTP listener); only the worker's parseProxyResponse contract is pinned by src/frontend/src/__tests__/bkav-proxy-response-contract.test.ts.
- The local preflight build cannot run because src/frontend/env.json holds literal 'undefined' placeholders by design; Caffeine injects real values at deploy time, so the env-json-precheck failure is expected and must not be 'fixed' in source.
- Tenant model: tenantId = normalized slug is the primary key; Tenant = { tenantId, slug, name, logoUrl, companyName, taxCode, address, phone, brandColor, active, createdAt, updatedAt }; default tenant is bunbohue65; reserved slugs include www/admin/api/app/static/assets/cdn/mail/smtp/ftp/ns/ns1/ns2/localhost/toidatmon/dashboard/portal/support/help/status.
- Backend tenant API: createTenant/updateTenant/setTenantActive are central-admin gated; listTenants(activeOnly)/getTenant/getTenantBySlug are public so the storefront can resolve a partner from a hostname or path slug.
- In this backend markPickedUp, cleanupExpiredActivations and getItemImage are NOT tenant-scoped; getOrderStatus, listPendingPaymentOrders and verifyEmailCode take tenantId first. Always confirm each method against backend.d.ts rather than assuming.
- Frontend partner resolution: lib/tenant.ts resolves the slug from the /<slug> path prefix only (hostname subdomains are redirected in main.tsx); App.tsx derives the TanStack Router basepath from the path-prefix slug and declares a Vietnamese notFoundComponent; hooks/useTenant.tsx provides the tenant context and useTenantId() returns '' while unresolved, which keeps tenant-scoped queries disabled and prevents cross-partner cache leakage.
- loadEnterpriseActivation(tenantId) returns null when the stored activation belongs to a different partner — that is the mechanism preventing a device activated under one partner from appearing activated on another partner's subdomain.
- Migration chain subset form: OldActor only needs the fields whose shape CHANGED; unchanged fields carry through automatically. OldActor must match the deployed .most signature (.old/src/backend/dist/backend.most).
- When adding a variant constructor (e.g. #tenantAdmin) to a type used in a stable Map, the migration must declare the NEW type (with the new constructor) in NewActor and cast old values to it, or M0170 'expected case missing' fires.
- Entity.sample for Entity.manual must be a sample of the ELEMENT TYPE of the iterator (e.g. the tuple (Text, PaymentMode)), not a record, or M0096 fires.
- Time.now() returns Int while Common.Timestamp is Nat — use Int.toNat(Time.now()) when assigning to a Timestamp field.
- Mutation hooks that inject tenantId themselves must type their input as Omit<Parameters<typeof fn>[1],'tenantId'> AND merge tenantId back into the payload object, because the facade requires it on the payload, not just as a trailing argument.
- Components that newly call useTenantId() break every test file whose vi.mock('@/hooks/useQueries') factory omits it; add useTenantId to the mock factory rather than partially mocking the module.
- The app calls useActor(createActor) without mockModules, so VITE_USE_MOCK=true has no effect and the dev server talks to the real draft canister; the mock file is inert until app source passes import.meta.glob('./mocks/backend.*').
- The draft canister has no menu/restaurant rows for the default partner bunbohue65, so the ordering page shows its empty state on the draft — a data condition, not a rendering bug.
- Partner console phase 2: sold-out is per restaurant (soldOutItems key "tenantId|itemId|restaurantId", "" = all; listSoldOutTodayAt / setItemSoldOutAt), menu order is stored per tenant (menuOrder, applied in listMenus/getMenu/getMenuForRestaurant), owner recovery code stores only SHA-256 of the normalized 12-char code (recoverOwnerDevice), and partner change requests (bank/legal/brand/counterPlan) are applied by the admin page via existing admin APIs before decideChangeRequest marks them approved.

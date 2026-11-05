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
- Một hệ màu thương hiệu duy nhất: đỏ gạch #9A3426 và xanh lime #BACF50
- Kiểu chữ Plus Jakarta Sans và Space Grotesk, không dùng chữ có chân
- Giữ nguyên mọi tính năng, dữ liệu, đường dẫn và nội dung tiếng Việt

## Accepted Requirements

- Một hệ màu thương hiệu duy nhất cho mọi khu vực: đỏ gạch #9A3426 và xanh lime #BACF50
- Thống nhất kiểu chữ Plus Jakarta Sans và Space Grotesk, không còn chữ có chân; bo góc, đổ bóng, khoảng cách dùng chung
- Nút, thẻ, công tắc, ô nhập, thanh điều hướng dưới cùng hình dạng ở trang khách, trang chủ nền tảng, /quan-ly, /san và admin
- Thay 'Đang tải…' bằng khung chờ (skeleton); màn hình đăng nhập, không có quyền, trống, lỗi dùng chung một mẫu
- Tối ưu điện thoại: nút menu dạng biểu tượng, vùng an toàn cho thanh dưới, trang đặt món không bị phần cố định chồng nhau, trang Kế toán và Hàng đợi thanh toán canh lề đúng

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

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
- Partner console phase 3: per-restaurant hours/pause live in restaurantOps (mixins/restaurant-ops-api.mo; hasHours=false falls back to tenant StoreHours; pausedUntil 0 = until reopened); isStoreOpen moved there and means "tenant not paused and any visible restaurant open"; VPS create.js checks isRestaurantOpen for online orders. DeviceRole gained #restaurantManager (migration 20261016) and every role logs into /quan-ly (ROLE_TABS in PartnerConsole.tsx); /driver, /counter, /enterprise/management show MovedToConsole. Frontend maps keyed by DeviceRole must be Record<string,…> so new binding variants still compile.
- Unified design system: index.css :root holds the single brick red + lime brand; legacy theme classes (.bbh-order-theme, .bbh-enterprise-theme, .tdm-theme) now inherit root tokens; --brand-* tokens wrap oklch(var(--x)) and tenantBrandStyle returns {} so partner brandColor no longer overrides the palette.
- Shared UI: components/Skeletons.tsx (Skeleton, SkeletonLines, SkeletonCard, SkeletonList, SkeletonGrid, SkeletonTable, PageSkeleton) and components/AppStates.tsx StateScreen (variant signin|forbidden|empty|error|notFound|warning) replace inline loading text and gate screens; ErrorBoundary sits outside RouterProvider so its actions must be onClick.
- --bbh-gold was remapped to lime; never use text-[oklch(var(--bbh-gold))] for text on white. foreground/card/background/border tokens have no <alpha-value>, so bg-card/95 or bg-foreground/90 break.
- Fixed bars: shared .bottom-nav is z-40 with safe-area; .fixed-bar sets bottom-0, lift it above the mobile nav with max-md:!bottom-[calc(var(--bottom-nav-h)+var(--safe-bottom))]; mobile sheets inside main need z-50. index.html viewport has viewport-fit=cover.
- Run frontend tests with npx vitest run --environment jsdom inside src/frontend; plain vitest fails with document/localStorage undefined.
- ActivationCodeForm.tsx (~line 121) still shows a visible 'Dang tai' placeholder on its restaurant select.

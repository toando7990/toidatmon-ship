// Mock backend for frontend-only iteration (VITE_USE_MOCK=true).
// Satisfies the full backendInterface. The email-verification gate accepts any
// 6-digit OTP so the flow can be exercised end-to-end without a live canister.

import type { backendInterface, MenuItem, Restaurant, Tenant } from "../backend";
import { UserRole } from "../backend";

// ---- Visual-QA fixtures -----------------------------------------------------
// Realistic partner/menu/restaurant data so the storefront, the ordering flow
// and the central-admin partner page render with content instead of empty
// states. Only the default partner (bunbohue65) is seeded; any other slug
// resolves to null so the partner-unavailable notice can be exercised.

const DEFAULT_TENANT: Tenant = {
  tenantId: "tenant-bunbohue65",
  slug: "bunbohue65",
  name: "Bún Bò Huế 65",
  logoUrl: "",
  companyName: "Công ty TNHH Bún Bò Huế 65",
  taxCode: "0312345678",
  address: "123 Lê Lợi, Quận 1, TP.HCM",
  phone: "0901234567",
  brandColor: "#c2410c",
  active: true,
  createdAt: BigInt(1_700_000_000_000_000_000),
  updatedAt: BigInt(1_700_000_000_000_000_000),
};

const SECOND_TENANT: Tenant = {
  tenantId: "tenant-phoba",
  slug: "phoba",
  name: "Phở Bà Hạnh",
  logoUrl: "",
  companyName: "Hộ kinh doanh Phở Bà Hạnh",
  taxCode: "0319876543",
  address: "45 Nguyễn Huệ, Quận 1, TP.HCM",
  phone: "0912345678",
  brandColor: "#0f766e",
  active: true,
  createdAt: BigInt(1_710_000_000_000_000_000),
  updatedAt: BigInt(1_710_000_000_000_000_000),
};

const THIRD_TENANT: Tenant = {
  tenantId: "tenant-comtam",
  slug: "comtam",
  name: "Cơm Tấm Sài Gòn",
  logoUrl: "",
  companyName: "Công ty TNHH Cơm Tấm Sài Gòn",
  taxCode: "0315556667",
  address: "88 Cách Mạng Tháng 8, Quận 3, TP.HCM",
  phone: "0987654321",
  brandColor: "#7c3aed",
  active: false,
  createdAt: BigInt(1_715_000_000_000_000_000),
  updatedAt: BigInt(1_715_000_000_000_000_000),
};

const TENANTS: Tenant[] = [DEFAULT_TENANT, SECOND_TENANT, THIRD_TENANT];

const RESTAURANTS: Restaurant[] = [
  {
    restaurantId: "rest-q1",
    tenantId: DEFAULT_TENANT.tenantId,
    name: "Bún Bò Huế 65 — Lê Lợi",
    address: "123 Lê Lợi, Quận 1, TP.HCM",
    phone: "0901234567",
    lat: 10.7731,
    lng: 106.7009,
    visible: true,
  },
  {
    restaurantId: "rest-q3",
    tenantId: DEFAULT_TENANT.tenantId,
    name: "Bún Bò Huế 65 — Võ Văn Tần",
    address: "210 Võ Văn Tần, Quận 3, TP.HCM",
    phone: "0901234568",
    lat: 10.7769,
    lng: 106.6917,
    visible: true,
  },
];

const MENU: MenuItem[] = [
  {
    itemId: "item-bbh-dac-biet",
    tenantId: DEFAULT_TENANT.tenantId,
    name: "Bún bò đặc biệt",
    category: "Món chính",
    price: BigInt(75000),
    vatRate: BigInt(8),
    unitName: "Tô",
    visible: true,
    image: new Uint8Array(),
  },
  {
    itemId: "item-bbh-tai",
    tenantId: DEFAULT_TENANT.tenantId,
    name: "Bún bò tái",
    category: "Món chính",
    price: BigInt(65000),
    vatRate: BigInt(8),
    unitName: "Tô",
    visible: true,
    image: new Uint8Array(),
  },
  {
    itemId: "item-bbh-gio",
    tenantId: DEFAULT_TENANT.tenantId,
    name: "Bún bò giò heo",
    category: "Món chính",
    price: BigInt(70000),
    vatRate: BigInt(8),
    unitName: "Tô",
    visible: true,
    image: new Uint8Array(),
  },
  {
    itemId: "item-cha",
    tenantId: DEFAULT_TENANT.tenantId,
    name: "Chả lụa thêm",
    category: "Món phụ",
    price: BigInt(15000),
    vatRate: BigInt(8),
    unitName: "Phần",
    visible: true,
    image: new Uint8Array(),
  },
  {
    itemId: "item-nem",
    tenantId: DEFAULT_TENANT.tenantId,
    name: "Nem chua",
    category: "Món phụ",
    price: BigInt(20000),
    vatRate: BigInt(8),
    unitName: "Phần",
    visible: true,
    image: new Uint8Array(),
  },
  {
    itemId: "item-tra-da",
    tenantId: DEFAULT_TENANT.tenantId,
    name: "Trà đá",
    category: "Đồ uống",
    price: BigInt(5000),
    vatRate: BigInt(8),
    unitName: "Ly",
    visible: true,
    image: new Uint8Array(),
  },
  {
    itemId: "item-dung-cu",
    tenantId: DEFAULT_TENANT.tenantId,
    name: "Dụng cụ đựng đồ ăn",
    category: "Khác",
    price: BigInt(2000),
    vatRate: BigInt(8),
    unitName: "Bộ",
    visible: true,
    image: new Uint8Array(),
  },
];

// Đơn đăng ký đối tác (mixins/partner-application-api.mo). Khai báo riêng rồi
// trải vào mock: bindings (backend.ts) do Caffeine sinh lại khi build, nên mock
// phải khớp cả bản bindings đã có các hàm này lẫn bản chưa có.
const partnerApplicationMock = {
  submitPartnerApplication: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  getPartnerApplicationStatus: async () => null,
  listPartnerApplications: async () => ({ __kind__: "ok" as const, ok: [] }),
  reviewPartnerApplication: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
};

// Trang quản lý đối tác (mixins/partner-console-api.mo) — cùng lý do như trên.
const partnerConsoleSettings = {
  paused: false,
  counterPlan: true,
  joinPlatformPromo: true,
  updatedAt: BigInt(0),
};
const partnerConsoleMock = {
  getPartnerDevice: async () => null,
  getPartnerSettings: async () => partnerConsoleSettings,
  setPartnerPaused: async () => ({
    __kind__: "ok" as const,
    ok: partnerConsoleSettings,
  }),
  setJoinPlatformPromo: async () => ({
    __kind__: "ok" as const,
    ok: partnerConsoleSettings,
  }),
  setCounterPlan: async () => ({
    __kind__: "ok" as const,
    ok: partnerConsoleSettings,
  }),
  setStoreHoursByDevice: async () => ({ __kind__: "ok" as const, ok: null }),
  setItemSoldOutToday: async () => ({ __kind__: "ok" as const, ok: null }),
  listSoldOutToday: async () => [],
  markOrderPrep: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  listOrderPrep: async () => [],
  setOrderKitchenNote: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  listKitchenNotes: async () => [],
};
// Tham số nền tảng + hạn gói bán quầy (mixins/platform-params-api.mo).
const platformDevicesMock = {
  createPlatformActivation: async () => ({
    __kind__: "err" as const,
    err: "mock",
  }),
  listPlatformActivations: async () => ({ __kind__: "ok" as const, ok: [] }),
  cancelPlatformActivation: async () => ({ __kind__: "ok" as const, ok: null }),
  listPlatformDevices: async () => ({ __kind__: "ok" as const, ok: [] }),
  revokePlatformDevice: async () => ({ __kind__: "ok" as const, ok: null }),
  activatePlatformDevice: async () => ({
    __kind__: "err" as const,
    err: "mock",
  }),
  getPlatformDevice: async () => null,
  touchPlatformDevice: async () => null,
  listHomeHidden: async () => [],
  setHomeHidden: async () => ({ __kind__: "ok" as const, ok: null }),
  listPartnerApplicationsAs: async () => ({ __kind__: "ok" as const, ok: [] }),
  requestApplicationInfo: async () => ({ __kind__: "err" as const, err: "mock" }),
  listTenantDevicesAs: async () => ({ __kind__: "ok" as const, ok: [] }),
  releaseVoucher: async () => ({ __kind__: "err" as const, err: "mock" }),
};

const dishGroupsMock = {
  listDishGroups: async () => [],
  listDishGroupAssignments: async () => [] as Array<[string, string]>,
  saveDishGroup: async () => ({ __kind__: "err" as const, err: "mock" }),
  deleteDishGroup: async () => ({ __kind__: "ok" as const, ok: null }),
  setDishGroupAssignment: async () => ({
    __kind__: "ok" as const,
    ok: null,
  }),
};

const platformParamsMock = {
  listPlatformParams: async () => ({ __kind__: "ok" as const, ok: [] }),
  setPlatformParam: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  cancelPlatformParamChange: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  getPartnerParams: async () => [],
  getCounterPlan: async () => ({
    enabled: false,
    until: BigInt(0),
    active: false,
  }),
  getCounterPaymentAccount: async () => null,
  issueVpsAdminTicket: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  getFeeParamsForVps: async () => ({ __kind__: "ok" as const, ok: [] }),
  setCounterPaymentAccount: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  setCounterPlanUntil: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
};
// Bảo mật thiết bị (lib/device-auth.mo).
const deviceAuthMock = {
  activateDeviceSecure: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ kích hoạt thiết bị",
  }),
};

// Tài khoản nhận tiền của đối tác + KM chung (mixins/partner-finance-api.mo).
const partnerFinanceMock = {
  setPartnerBank: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  listPartnerBanks: async () => ({ __kind__: "ok" as const, ok: [] }),
  getPartnerBank: async () => null,
  setPromoPlatformFunded: async () => ({ __kind__: "ok" as const, ok: null }),
  listPlatformFundedPromos: async () => [],
  getVoucherProgram: async () => "",
  // Hồ sơ đối tác (mixins/partner-profile-api.mo).
  setPartnerProfile: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  listPartnerProfiles: async () => ({ __kind__: "ok" as const, ok: [] }),
  countRestaurantsByTenant: async () => [],
};

// Giai đoạn 2 trang đối tác (mixins/partner-self-api.mo + hết món theo nhà hàng).
const partnerSelfMock = {
  setMenuOrder: async () => ({ __kind__: "ok" as const, ok: null }),
  setItemSoldOutAt: async () => ({ __kind__: "ok" as const, ok: null }),
  listSoldOutTodayAt: async () => [],
  setOwnerRecoveryHash: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  getOwnerRecoveryInfo: async () => ({ createdAt: 0n, createdBy: "" }),
  recoverOwnerDevice: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  submitChangeRequest: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  listMyChangeRequests: async () => [],
  listChangeRequests: async () => ({ __kind__: "ok" as const, ok: [] }),
  decideChangeRequest: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
};

// Giai đoạn 3: giờ nhận đơn + tạm nghỉ từng nhà hàng (mixins/restaurant-ops-api.mo).
const restaurantOpsMock = {
  listRestaurantOps: async () => [],
  getRestaurantStatuses: async () => [],
  isRestaurantOpen: async () => true,
  setRestaurantHours: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
  setRestaurantsPaused: async () => ({
    __kind__: "err" as const,
    err: "Mock: không hỗ trợ",
  }),
};

export const mockBackend: backendInterface = {
  ...restaurantOpsMock,
  ...partnerSelfMock,
  ...partnerFinanceMock,
  ...partnerApplicationMock,
  ...partnerConsoleMock,
  ...deviceAuthMock,
  ...platformParamsMock,
  ...dishGroupsMock,
  ...platformDevicesMock,
  _initialize_access_control: async () => {},
  _internet_identity_sign_in_finish: async () => ({ __kind__: "ok", ok: null }),
  _internet_identity_sign_in_start: async () => new Uint8Array(),
  activateDevice: async () => ({
    __kind__: "err",
    err: "Mock: không hỗ trợ kích hoạt thiết bị",
  }),
  addItem: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  addRestaurant: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  assignCallerUserRole: async () => {},
  cancelOrder: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  claimOrderEmail: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  changeOrderRestaurant: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  cleanupExpiredActivations: async () => BigInt(0),
  cleanupOrderByDevice: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  createOrder: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  createTenant: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  deleteItem: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  deleteRestaurant: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  execute: async () => ({ hasMore: false, rows: [] }),
  generateActivationCode: async () => ({
    __kind__: "err",
    err: "Mock: không hỗ trợ",
  }),
  getApiDoc: async () => "Mock: tài liệu API",
  getCallerUserRole: async () => UserRole.user,
  getCanisterIdText: async () => "mock-canister",
  getMenu: async () => MENU,
  getMenuForRestaurant: async () => MENU,
  getItemImage: async () => null,
  getKmUsageCount: async () => BigInt(0),
  getKmDailyCount: async () => BigInt(0),
  countVouchersByProgram: async () => BigInt(0),
  createPromotion: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  updatePromotion: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  deletePromotion: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  stopPromotion: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  isPromotionUsed: async () => ({ __kind__: "ok", ok: false }),
  listPromotions: async () => ({ __kind__: "ok", ok: [] }),
  getCurrentPromotion: async () => null,
  getPromotionByCode: async () => null,
  getCurrentRegistrationPromo: async () => null,
  applyPromotion: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  applyPromotionCounter: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  applyVoucher: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  listMyVouchers: async () => [],
  createRegistrationPromo: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  updateRegistrationPromo: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  deleteRegistrationPromo: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  stopRegistrationPromo: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  isRegistrationPromoUsed: async () => ({ __kind__: "ok", ok: false }),
  listRegistrationPromos: async () => ({ __kind__: "ok", ok: [] }),
  createSalesPromo: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  updateSalesPromo: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  deleteSalesPromo: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  stopSalesPromo: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  isSalesPromoUsed: async () => ({ __kind__: "ok", ok: false }),
  listSalesPromos: async () => ({ __kind__: "ok", ok: [] }),
  getCurrentSalesPromo: async () => null,
  issueSalesBonus: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  deactivateExpiredPromotions: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  getOrder: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  getOrdersByEmail: async () => [],
  getOrderStatus: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  getPaymentMode: async () => "driver",
  getRestaurants: async () => RESTAURANTS,
  getStoreHours: async () => ({
    openHour: BigInt(8),
    openMinute: BigInt(0),
    closeHour: BigInt(22),
    closeMinute: BigInt(0),
  }),
  getTenant: async (tenantId) =>
    TENANTS.find((t) => t.tenantId === tenantId) ?? null,
  getTenantBySlug: async (slug) =>
    TENANTS.find((t) => t.slug === slug) ?? null,
  getUpgradeState: async () => ({
    menus: [],
    orders: [],
    restaurants: [],
    restaurantMenuOverrides: [],
    devices: [],
    pendingActivations: [],
  }),
  isCallerAdmin: async () => false,
  callerHasEnterpriseRole: async () => false,
  isEmailVerified: async () => false,
  isStoreOpen: async () => true,
  issueInvoiceByDevice: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  listDevicesByRestaurant: async () => [],
  listDevicesByRole: async () => [],
  listMenus: async () => MENU,
  listOrders: async () => [],
  listPendingPaymentOrders: async () => [],
  listPaidOrdersForPickup: async () => [],
  listRestaurants: async () => RESTAURANTS,
  listTenants: async (activeOnly) =>
    activeOnly ? TENANTS.filter((t) => t.active) : TENANTS,
  markPickedUp: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  markPaymentExpired: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  pruneOldOrdersNow: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  restoreUpgradeState: async () => false,
  revokeDevice: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  schema: async () => "{}",
  seedMenuItems: async () => false,
  sendKmNotifyEmails: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  sendVerificationCode: async () => ({ __kind__: "ok", ok: null }),
  setPaymentMode: async () => ({ __kind__: "ok", ok: null }),
  setRestaurantPriceOverride: async () => ({
    __kind__: "err",
    err: "Mock: không hỗ trợ",
  }),
  setStoreHours: async () => ({ __kind__: "ok", ok: null }),
  setTenantActive: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  setVpsSecret: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  snapshotUpgradeState: async () => new Uint8Array(),
  updateInvoiceStatus: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  updateItem: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  setItemVisible: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  updateOrderQr: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  updatePaymentStatus: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  updateRestaurant: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  updateTenant: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  updateStatus: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  tryConsumeKmSlot: async () => ({ __kind__: "err", err: "Mock: không hỗ trợ" }),
  verifyEmailCode: async (_email, code) =>
    /^\d{6}$/.test(code)
      ? { __kind__: "ok", ok: null }
      : { __kind__: "err", err: "Mã xác nhận không đúng hoặc đã hết hạn." },
};

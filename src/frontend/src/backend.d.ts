import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Application {
    status: ApplicationStatus;
    applicationId: ApplicationId;
    createdAt: Timestamp;
    tenantId: string;
    adminNote: string;
    updatedAt: Timestamp;
    input: ApplicationInput;
}
export type ApplicationId = string;
export interface ApplicationInput {
    bankAccountNumber: string;
    agreedDataProcessing: boolean;
    usesEInvoice: boolean;
    contactName: string;
    desiredSlug: string;
    bankAccountHolder: string;
    storeAddress: string;
    businessType: BusinessType;
    representativeName: string;
    registrationNumber: string;
    bankName: string;
    legalName: string;
    confirmedAccurate: boolean;
    cuisine: string;
    contactEmail: string;
    agreedTerms: boolean;
    brandName: string;
    headOfficeAddress: string;
    agreedTaxWithholding: boolean;
    taxCode: string;
    contactPhone: string;
    branchCount: bigint;
}
export interface ApplicationStatusView {
    status: ApplicationStatus;
    desiredSlug: string;
    applicationId: ApplicationId;
    createdAt: Timestamp;
    adminNote: string;
    updatedAt: Timestamp;
    brandName: string;
}
export interface Cell {
    value: Value;
    name: string;
}
export interface ChangeRequest {
    status: ChangeStatus;
    requestId: string;
    kind: string;
    note: string;
    createdAt: bigint;
    createdBy: string;
    tenantId: TenantId;
    adminNote: string;
    decidedAt: bigint;
    payload: string;
}
export interface CounterPaymentAccount {
    bankBin: string;
    merchantId: string;
    bankName: string;
    vaAccountNumber: string;
    enabled: boolean;
    updatedAt: Timestamp;
    accountName: string;
}
export interface DayHours {
    openMin: bigint;
    open: boolean;
    closeMin: bigint;
}
export interface Device {
    active: boolean;
    activatedAt: bigint;
    name: string;
    role: DeviceRole;
    tenantId: TenantId;
    restaurantId: string;
    deviceId: string;
    phone: string;
}
export interface DeviceEntry {
    device: Device;
    deviceId: string;
}
export type DeviceId = string;
export interface DiscountTier {
    discountAmount: bigint;
    minOrderValue: bigint;
}
export interface DishGroup {
    active: boolean;
    sortOrder: bigint;
    name: string;
    keywords: Array<string>;
    updatedAt: bigint;
    groupId: string;
}
export interface EffectiveParam {
    key: string;
    upcoming?: ParamVersion;
    current?: ParamVersion;
    overridden: boolean;
}
export type Email = string;
export type Error_ = {
    __kind__: "FrontendOriginsNotConfigured";
    FrontendOriginsNotConfigured: null;
} | {
    __kind__: "MixedSsoSources";
    MixedSsoSources: {
        otherKeys: Array<string>;
        ssoKeys: Array<string>;
    };
} | {
    __kind__: "Stale";
    Stale: {
        ageNs: bigint;
    };
} | {
    __kind__: "MalformedCandid";
    MalformedCandid: null;
} | {
    __kind__: "AmbiguousAttribute";
    AmbiguousAttribute: {
        field: string;
        sources: Array<string>;
    };
} | {
    __kind__: "NoAttributes";
    NoAttributes: null;
} | {
    __kind__: "UnknownNonce";
    UnknownNonce: null;
} | {
    __kind__: "UntrustedSsoSource";
    UntrustedSsoSource: {
        domain: string;
    };
} | {
    __kind__: "MissingField";
    MissingField: string;
} | {
    __kind__: "FrontendOriginMismatch";
    FrontendOriginMismatch: {
        got: string;
        expected: Array<string>;
    };
};
export interface HiddenItem {
    at: bigint;
    by: string;
    reason: string;
}
export type Hmac = string;
export interface KitchenNote {
    at: Timestamp;
    note: string;
    orderId: string;
    dineIn: boolean;
}
export interface MenuEntry {
    itemId: string;
    menu: MenuItem;
}
export interface MenuItem {
    itemId: string;
    name: string;
    tenantId: TenantId;
    visible: boolean;
    category: string;
    image: Uint8Array;
    price: bigint;
    vatRate: bigint;
    unitName: string;
}
export interface Order {
    paymentStatus: PaymentStatus;
    cusTaxCode: string;
    cusName: string;
    createdAt: bigint;
    taxTotal: bigint;
    ahamoveOrderId: string;
    tingeeQrCode: string;
    shippingFee: bigint;
    invoiceId: string;
    sharedLink: string;
    cusPhone: string;
    tenantId: TenantId;
    orderId: string;
    restaurantId: string;
    updatedAt: bigint;
    bookingStatus: BookingStatus;
    receiverEmail: string;
    pickupCode: string;
    expireAt?: bigint;
    kmDiscountAmount: bigint;
    pdfUrl: string;
    tingeeQrId: string;
    goodsAmount: bigint;
    items: Array<OrderItem>;
    voucherDiscountAmount: bigint;
    amount: bigint;
    paymentVerificationImage: string;
    cusAddress: string;
    invoiceStatus: InvoiceStatus;
    billId?: string;
    qrCode?: string;
}
export interface OrderEntry {
    order: Order;
    orderId: OrderId;
}
export type OrderId = string;
export interface OrderItem {
    itemId: string;
    name: string;
    quantity: bigint;
    price: bigint;
    vatRate: bigint;
    unitName: string;
}
export interface OrderPrep {
    readyAt: Timestamp;
    orderId: string;
    handedAt: Timestamp;
}
export interface OrderStatus {
    paymentStatus: PaymentStatus;
    tingeeQrCode: string;
    invoiceId: string;
    sharedLink: string;
    bookingStatus: BookingStatus;
    pdfUrl: string;
    tingeeQrId: string;
    invoiceStatus: InvoiceStatus;
}
export interface ParamEntry {
    key: string;
    scope: string;
    versions: Array<ParamVersion>;
}
export interface ParamVersion {
    value: string;
    note: string;
    setAt: Timestamp;
    effectiveFrom: Timestamp;
}
export interface PartnerBank {
    branch: string;
    bankName: string;
    updatedAt: bigint;
    updatedBy: string;
    accountNumber: string;
    accountHolder: string;
}
export interface PartnerProfile {
    contactName: string;
    businessType: BusinessType;
    representativeName: string;
    registrationNumber: string;
    updatedAt: bigint;
    updatedBy: string;
    contactEmail: string;
}
export interface PartnerSettings {
    joinPlatformPromo: boolean;
    counterPlan: boolean;
    updatedAt: Timestamp;
    paused: boolean;
}
export interface PendingActivation {
    expiresAt: bigint;
    code: string;
    createdAt: bigint;
    role: DeviceRole;
    used: boolean;
    tenantId: TenantId;
    restaurantId: string;
}
export interface PendingActivationEntry {
    code: string;
    activation: PendingActivation;
}
export interface PlatformActivation {
    expiresAt: bigint;
    code: string;
    note: string;
    createdAt: bigint;
    role: PlatformRole;
}
export interface PlatformDeviceView {
    active: boolean;
    lastSeenAt: bigint;
    activatedAt: bigint;
    name: string;
    note: string;
    role: PlatformRole;
    deviceId: string;
    phone: string;
}
export interface Promotion {
    tiers: Array<DiscountTier>;
    active: boolean;
    endDate: string;
    timeSlots: Array<TimeSlot>;
    enabledOnline: boolean;
    code: string;
    name: string;
    daysOfWeek: Array<boolean>;
    tenantId: TenantId;
    enabledCounter: boolean;
    dailyOrderLimit: bigint;
    perCustomerDailyLimit: bigint;
    termsUrl: string;
    startDate: string;
}
export interface RegistrationPromo {
    active: boolean;
    endDate: string;
    code: string;
    name: string;
    voucherValidDays: bigint;
    tenantId: TenantId;
    voucherValue: bigint;
    termsUrl: string;
    startDate: string;
}
export interface Restaurant {
    lat: number;
    lng: number;
    name: string;
    tenantId: TenantId;
    restaurantId: string;
    address: string;
    visible: boolean;
    phone: string;
}
export interface RestaurantEntry {
    restaurantId: string;
    restaurant: Restaurant;
}
export type RestaurantId = string;
export interface RestaurantMenuOverrideEntry {
    restaurantId: string;
    overrides: Array<[string, bigint]>;
}
export interface RestaurantOps {
    week: Array<DayHours>;
    tenantId: TenantId;
    updatedAt: bigint;
    hasHours: boolean;
    paused: boolean;
    pausedUntil: bigint;
}
export interface RestaurantStatus {
    opensAt: bigint;
    restaurantId: string;
    state: string;
    closesAt: bigint;
    pausedUntil: bigint;
}
export type Result = {
    __kind__: "ok";
    ok: Order;
} | {
    __kind__: "err";
    err: string;
};
export type Result_1 = {
    __kind__: "ok";
    ok: SalesPromo;
} | {
    __kind__: "err";
    err: string;
};
export type Result_10 = {
    __kind__: "ok";
    ok: ParamVersion;
} | {
    __kind__: "err";
    err: string;
};
export type Result_11 = {
    __kind__: "ok";
    ok: PartnerProfile;
} | {
    __kind__: "err";
    err: string;
};
export type Result_12 = {
    __kind__: "ok";
    ok: PartnerSettings;
} | {
    __kind__: "err";
    err: string;
};
export type Result_13 = {
    __kind__: "ok";
    ok: PartnerBank;
} | {
    __kind__: "err";
    err: string;
};
export type Result_14 = {
    __kind__: "ok";
    ok: bigint;
} | {
    __kind__: "err";
    err: string;
};
export type Result_15 = {
    __kind__: "ok";
    ok: KitchenNote;
} | {
    __kind__: "err";
    err: string;
};
export type Result_16 = {
    __kind__: "ok";
    ok: CounterPaymentAccount;
} | {
    __kind__: "err";
    err: string;
};
export type Result_17 = {
    __kind__: "ok";
    ok: DishGroup;
} | {
    __kind__: "err";
    err: string;
};
export type Result_18 = {
    __kind__: "ok";
    ok: Device;
} | {
    __kind__: "err";
    err: string;
};
export type Result_19 = {
    __kind__: "ok";
    ok: Application;
} | {
    __kind__: "err";
    err: string;
};
export type Result_2 = {
    __kind__: "ok";
    ok: Restaurant;
} | {
    __kind__: "err";
    err: string;
};
export type Result_20 = {
    __kind__: "ok";
    ok: string;
} | {
    __kind__: "err";
    err: string;
};
export type Result_22 = {
    __kind__: "ok";
    ok: OrderPrep;
} | {
    __kind__: "err";
    err: string;
};
export type Result_23 = {
    __kind__: "ok";
    ok: Array<Device>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_24 = {
    __kind__: "ok";
    ok: Array<SalesPromo>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_25 = {
    __kind__: "ok";
    ok: Array<RegistrationPromo>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_26 = {
    __kind__: "ok";
    ok: Array<Promotion>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_27 = {
    __kind__: "ok";
    ok: Array<ParamEntry>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_28 = {
    __kind__: "ok";
    ok: Array<PlatformDeviceView>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_29 = {
    __kind__: "ok";
    ok: Array<PlatformActivation>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_3 = {
    __kind__: "ok";
    ok: RegistrationPromo;
} | {
    __kind__: "err";
    err: string;
};
export type Result_30 = {
    __kind__: "ok";
    ok: Array<[string, PartnerProfile]>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_31 = {
    __kind__: "ok";
    ok: Array<[string, PartnerBank]>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_32 = {
    __kind__: "ok";
    ok: Array<Application>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_33 = {
    __kind__: "ok";
    ok: Array<ChangeRequest>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_34 = {
    __kind__: "ok";
    ok: {
        sig: string;
        principal: string;
        expiresAt: bigint;
    };
} | {
    __kind__: "err";
    err: string;
};
export type Result_35 = {
    __kind__: "ok";
    ok: Voucher | null;
} | {
    __kind__: "err";
    err: string;
};
export type Result_36 = {
    __kind__: "ok";
    ok: boolean;
} | {
    __kind__: "err";
    err: string;
};
export type Result_37 = {
    __kind__: "ok";
    ok: OrderStatus;
} | {
    __kind__: "err";
    err: string;
};
export type Result_38 = {
    __kind__: "ok";
    ok: PendingActivation;
} | {
    __kind__: "err";
    err: string;
};
export type Result_39 = {
    __kind__: "ok";
    ok: PlatformActivation;
} | {
    __kind__: "err";
    err: string;
};
export type Result_4 = {
    __kind__: "ok";
    ok: Promotion;
} | {
    __kind__: "err";
    err: string;
};
export type Result_40 = {
    __kind__: "ok";
    ok: {
        discountAmount: bigint;
        promotionCode: string;
    };
} | {
    __kind__: "err";
    err: string;
};
export type Result_42 = {
    __kind__: "ok";
    ok: PlatformDeviceView;
} | {
    __kind__: "err";
    err: string;
};
export type Result_43 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export type Result_5 = {
    __kind__: "ok";
    ok: MenuItem;
} | {
    __kind__: "err";
    err: string;
};
export type Result_6 = {
    __kind__: "ok";
    ok: bigint;
} | {
    __kind__: "err";
    err: string;
};
export type Result_7 = {
    __kind__: "ok";
    ok: ChangeRequest;
} | {
    __kind__: "err";
    err: string;
};
export type Result_8 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export type Result_9 = {
    __kind__: "ok";
    ok: RestaurantOps;
} | {
    __kind__: "err";
    err: string;
};
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface SalesPromo {
    active: boolean;
    endDate: string;
    code: string;
    name: string;
    voucherValidDays: bigint;
    tenantId: TenantId;
    weeklyTiers: Array<SalesTier>;
    enabledCounter: boolean;
    monthlyTiers: Array<SalesTier>;
    termsUrl: string;
    startDate: string;
}
export interface SalesTier {
    minSales: bigint;
    voucherValue: bigint;
}
export type SendCodeResult = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export interface SoldOutEntry {
    itemId: string;
    restaurantId: string;
}
export interface StoreHours {
    closeMinute: bigint;
    closeHour: bigint;
    openMinute: bigint;
    openHour: bigint;
}
export interface Tenant {
    active: boolean;
    name: string;
    createdAt: Timestamp;
    slug: string;
    tenantId: TenantId;
    updatedAt: Timestamp;
    logoUrl: string;
    address: string;
    companyName: string;
    phone: string;
    taxCode: string;
    brandColor: string;
}
export type TenantId = string;
export interface TimeSlot {
    durationMinutes: bigint;
    startMinute: bigint;
    startHour: bigint;
}
export type Timestamp = bigint;
export interface UpgradeState {
    menus: Array<MenuEntry>;
    orders: Array<OrderEntry>;
    restaurants: Array<RestaurantEntry>;
    restaurantMenuOverrides: Array<RestaurantMenuOverrideEntry>;
    devices: Array<DeviceEntry>;
    pendingActivations: Array<PendingActivationEntry>;
}
export type Value = {
    __kind__: "int";
    int: bigint;
} | {
    __kind__: "nat";
    nat: bigint;
} | {
    __kind__: "float";
    float: number;
} | {
    __kind__: "bool";
    bool: boolean;
} | {
    __kind__: "null";
    null: null;
} | {
    __kind__: "text";
    text: string;
};
export type VerifyResult = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export interface Voucher {
    endDate: string;
    value: bigint;
    code: string;
    used: boolean;
    email: string;
    tenantId: TenantId;
    programCode: string;
    issuedAt: bigint;
    startDate: string;
}
export enum ApplicationStatus {
    pending = "pending",
    approved = "approved",
    rejected = "rejected",
    needsInfo = "needsInfo"
}
export enum BookingStatus {
    cancelled = "cancelled",
    pending = "pending",
    completed = "completed",
    shipping = "shipping",
    pickedUp = "pickedUp",
    confirmed = "confirmed"
}
export enum BusinessType {
    householdBusiness = "householdBusiness",
    company = "company",
    individual = "individual"
}
export enum ChangeStatus {
    pending = "pending",
    approved = "approved",
    rejected = "rejected"
}
export enum Decision {
    reject = "reject",
    approve = "approve",
    requestInfo = "requestInfo"
}
export enum DeviceRole {
    accounting = "accounting",
    paymentQueue = "paymentQueue",
    admin = "admin",
    restaurantManager = "restaurantManager",
    salesPromoReporting = "salesPromoReporting",
    cashier = "cashier",
    tenantAdmin = "tenantAdmin",
    driver = "driver"
}
export enum EnterpriseRole {
    accounting = "accounting",
    paymentQueue = "paymentQueue",
    salesPromoReporting = "salesPromoReporting"
}
export enum InvoiceStatus {
    none = "none",
    invoiced = "invoiced",
    failed = "failed"
}
export enum PaymentStatus {
    expired = "expired",
    paid = "paid",
    refunded = "refunded",
    unpaid = "unpaid"
}
export enum PlatformRole {
    ops = "ops",
    accounting = "accounting",
    moderator = "moderator",
    support = "support",
    partnerDev = "partnerDev",
    viewer = "viewer"
}
export enum PrepStage {
    handed = "handed",
    ready = "ready"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    activateDevice(code: string, deviceId: DeviceId, name: string, phone: string): Promise<Result_18>;
    activateDeviceSecure(code: string, deviceId: DeviceId, name: string, phone: string, tokenHash: Uint8Array): Promise<Result_18>;
    /**
     * / Kích hoạt máy bằng mã (dùng 1 lần, hạn 24 giờ). tokenHash = SHA-256 của
     * / khoá ngẫu nhiên sinh trên máy.
     */
    activatePlatformDevice(code: string, deviceId: string, name: string, phone: string, tokenHash: Uint8Array): Promise<Result_42>;
    addItem(tenantId: TenantId, deviceId: DeviceId, itemId: string, name: string, price: bigint, unitName: string, vatRate: bigint, category: string, image: Uint8Array): Promise<Result_5>;
    addRestaurant(tenantId: TenantId, deviceId: DeviceId, restaurantId: string, name: string, address: string, phone: string, lat: number, lng: number): Promise<Result_2>;
    applyPromotion(tenantId: TenantId, email: string, orderAmount: bigint, hmac: Hmac): Promise<Result_40>;
    applyPromotionCounter(tenantId: TenantId, orderAmount: bigint, hmac: Hmac): Promise<Result_40>;
    applyVoucher(tenantId: TenantId, email: string, code: string, orderAmount: bigint, hmac: Hmac): Promise<Result_6>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    callerHasEnterpriseRole(deviceId: DeviceId, tenantId: TenantId, role: EnterpriseRole): Promise<boolean>;
    cancelOrder(orderId: string, hmac: string): Promise<Result>;
    cancelPlatformActivation(code: string): Promise<Result_8>;
    /**
     * / Admin: huỷ một thay đổi chưa tới ngày hiệu lực.
     */
    cancelPlatformParamChange(scope: string, key: string, effectiveFrom: Timestamp): Promise<Result_8>;
    changeOrderRestaurant(orderId: string, newRestaurantId: string, hmac: string): Promise<Result>;
    claimOrderEmail(tenantId: string, orderId: string, email: string): Promise<Result>;
    cleanupExpiredActivations(): Promise<bigint>;
    cleanupOrderByDevice(tenantId: string, deviceId: string, orderId: string): Promise<Result>;
    /**
     * / Số nhà hàng / chi nhánh của từng đối tác (đang hiển thị + đang ẩn).
     */
    countRestaurantsByTenant(): Promise<Array<[string, bigint]>>;
    countVouchersByProgram(tenantId: string, programCode: string): Promise<bigint>;
    createOrder(tenantId: string, orderId: string, restaurantId: string, cusName: string, cusPhone: string, cusAddress: string, cusTaxCode: string, receiverEmail: string, items: Array<OrderItem>, amount: bigint, goodsAmount: bigint, shippingFee: bigint, taxTotal: bigint, ahamoveOrderId: string, tingeeQrId: string, sharedLink: string, tingeeQrCode: string, pickupCode: string, kmDiscountAmount: bigint, voucherDiscountAmount: bigint, hmac: string): Promise<Result>;
    createPlatformActivation(role: PlatformRole, note: string): Promise<Result_39>;
    createPromotion(tenantId: TenantId, deviceId: string, name: string, startDate: string, endDate: string, daysOfWeek: Array<boolean>, timeSlots: Array<TimeSlot>, dailyOrderLimit: bigint, perCustomerDailyLimit: bigint, tiers: Array<DiscountTier>, termsUrl: string): Promise<Result_4>;
    createRegistrationPromo(tenantId: TenantId, deviceId: string, name: string, startDate: string, endDate: string, voucherValue: bigint, voucherValidDays: bigint, termsUrl: string): Promise<Result_3>;
    createSalesPromo(tenantId: TenantId, deviceId: string, name: string, startDate: string, endDate: string, weeklyTiers: Array<SalesTier>, monthlyTiers: Array<SalesTier>, voucherValidDays: bigint, termsUrl: string): Promise<Result_1>;
    /**
     * / Tạo đối tác mới. Admin trung tâm only.
     */
    createTenant(slug: string, name: string, logoUrl: string, companyName: string, taxCode: string, address: string, phone: string, brandColor: string): Promise<{
        __kind__: "ok";
        ok: Tenant;
    } | {
        __kind__: "err";
        err: string;
    }>;
    deactivateExpiredPromotions(hmac: Hmac): Promise<Result_6>;
    /**
     * / Admin: duyệt (sau khi đã áp dụng bằng các API admin) hoặc từ chối (bắt
     * / buộc ghi lý do — đối tác xem được).
     */
    decideChangeRequest(requestId: string, approve: boolean, adminNote: string): Promise<Result_7>;
    /**
     * / Admin: xoá nhóm (bỏ luôn các món đã gán tay vào nhóm đó).
     */
    deleteDishGroup(groupId: string, credential: string): Promise<Result_8>;
    deleteItem(tenantId: TenantId, deviceId: DeviceId, itemId: string): Promise<Result_8>;
    deletePromotion(tenantId: TenantId, deviceId: string, code: string): Promise<Result_8>;
    deleteRegistrationPromo(tenantId: TenantId, deviceId: string, code: string): Promise<Result_8>;
    deleteRestaurant(tenantId: TenantId, deviceId: DeviceId, restaurantId: string): Promise<Result_8>;
    deleteSalesPromo(tenantId: TenantId, deviceId: string, code: string): Promise<Result_8>;
    execute(qJson: string): Promise<Result__1>;
    generateActivationCode(tenantId: TenantId, restaurantId: RestaurantId, role: DeviceRole, deviceId: DeviceId): Promise<Result_38>;
    getApiDoc(): Promise<string>;
    getCallerUserRole(): Promise<UserRole>;
    /**
     * / Returns the canister's own id as text, so the VPS knows which canister
     * / it is talking to. `Principal.fromActor(Main)` resolves the actor's own
     * / canister principal at runtime (mo:core/IC.getCanisterId does not exist in
     * / core 2.6.1).
     */
    getCanisterIdText(): Promise<string>;
    /**
     * / Tài khoản nhận tiền QR tại quầy của quán (VPS đọc khi tạo QR; null = chưa có).
     */
    getCounterPaymentAccount(tenantId: TenantId): Promise<CounterPaymentAccount | null>;
    /**
     * / Gói bán quầy: đã bật chưa, hạn tới đâu (0 = không hạn), còn hiệu lực không.
     */
    getCounterPlan(tenantId: TenantId): Promise<{
        active: boolean;
        enabled: boolean;
        until: Timestamp;
    }>;
    getCurrentPromotion(tenantId: TenantId): Promise<Promotion | null>;
    getCurrentRegistrationPromo(tenantId: TenantId): Promise<RegistrationPromo | null>;
    getCurrentSalesPromo(tenantId: TenantId): Promise<SalesPromo | null>;
    /**
     * / Phí đơn online của quán: phiên bản chung + riêng quán của các khoá phí.
     */
    getFeeParamsForVps(tenantId: TenantId, hmac: string): Promise<Result_27>;
    getItemImage(itemId: string): Promise<Uint8Array | null>;
    getKmDailyCount(tenantId: TenantId, programCode: string): Promise<bigint>;
    getKmUsageCount(tenantId: TenantId, email: string, programCode: string): Promise<bigint>;
    getMenu(tenantId: TenantId): Promise<Array<MenuItem>>;
    getMenuForRestaurant(tenantId: TenantId, restaurantId: string): Promise<Array<MenuItem>>;
    getOrder(tenantId: string, orderId: string, deviceId: string): Promise<Result>;
    getOrderStatus(tenantId: string, orderId: string): Promise<Result_37>;
    getOrdersByEmail(tenantId: string, email: string, deviceId: string): Promise<Array<Order>>;
    /**
     * / Chủ đối tác: mã khôi phục đã tạo lúc nào (0 = chưa có / đã dùng).
     */
    getOwnerRecoveryInfo(tenantId: TenantId, credential: string): Promise<{
        createdAt: bigint;
        createdBy: string;
    }>;
    getPartnerApplicationStatus(applicationId: string, contactEmail: string): Promise<ApplicationStatusView | null>;
    /**
     * / Tài khoản của 1 đối tác: admin, Kế toán sàn, máy Chủ quán hoặc Kế toán của đối tác đó.
     */
    getPartnerBank(tenantId: TenantId, credential: string): Promise<PartnerBank | null>;
    /**
     * / Thông tin thiết bị (vai trò, đối tác, chi nhánh) — để trang quản lý biết
     * / hiện giao diện Chủ quán hay Nhân viên. null nếu không có / đã bị gỡ.
     */
    getPartnerDevice(deviceId: DeviceId): Promise<Device | null>;
    /**
     * / Tham số áp dụng cho 1 quán. Admin hoặc máy Chủ quán / Nhân viên của quán.
     */
    getPartnerParams(tenantId: TenantId, credential: string): Promise<Array<EffectiveParam>>;
    /**
     * / Cài đặt quán (công khai: trang đặt món cần biết quán có tạm nghỉ không).
     * / counterPlan trả về là trạng thái ĐANG HIỆU LỰC (đã tính hạn gói).
     */
    getPartnerSettings(tenantId: TenantId): Promise<PartnerSettings>;
    /**
     * / Query: return the paymentMode for `tenantId` as its canonical Text
     * / ("driver" or "customer"). Public — no caller gating; the value is not
     * / sensitive. A tenant with no explicit config returns the default "driver".
     */
    getPaymentMode(tenantId: TenantId): Promise<string>;
    /**
     * / Máy (thẻ "deviceId~khoá") đang hoạt động → thông tin + vai trò; ngược
     * / lại null. VPS dùng để phân quyền (lib/platform-guard.js).
     */
    getPlatformDevice(credential: string): Promise<PlatformDeviceView | null>;
    getPromotionByCode(tenantId: TenantId, code: string): Promise<Promotion | null>;
    /**
     * / Trạng thái hiện tại (đang nhận đơn / tạm nghỉ / ngoài giờ) của mọi nhà
     * / hàng thuộc đối tác (cả nhà hàng đang ẩn).
     */
    getRestaurantStatuses(tenantId: TenantId): Promise<Array<RestaurantStatus>>;
    getRestaurants(tenantId: TenantId): Promise<Array<Restaurant>>;
    /**
     * / Query: return the storeHours config for `tenantId`. Public — no caller
     * / gating; the value is not sensitive and the frontend needs it to render the
     * / open/close state on both the driver and customer flows. A tenant with no
     * / explicit config returns the default (00:00–23:59, always open).
     */
    getStoreHours(tenantId: TenantId): Promise<StoreHours>;
    /**
     * / Lấy đối tác theo tenantId. Công khai.
     */
    getTenant(tenantId: TenantId): Promise<Tenant | null>;
    /**
     * / Lấy đối tác theo slug — frontend dùng để phân giải đối tác từ hostname
     * / subdomain hoặc tiền tố đường dẫn /<slug>. Công khai.
     */
    getTenantBySlug(slug: string): Promise<Tenant | null>;
    getUpgradeState(): Promise<UpgradeState>;
    /**
     * / Công khai: phiếu giảm giá thuộc chương trình nào ("" nếu không có).
     * / VPS dùng để biết phiếu có thuộc khuyến mại chung do sàn tài trợ không.
     */
    getVoucherProgram(code: string): Promise<string>;
    isCallerAdmin(): Promise<boolean>;
    isEmailVerified(email: Email): Promise<boolean>;
    isPromotionUsed(tenantId: TenantId, deviceId: string, code: string): Promise<Result_36>;
    isRegistrationPromoUsed(tenantId: TenantId, deviceId: string, code: string): Promise<Result_36>;
    /**
     * / Nhà hàng có đang nhận đơn không (VPS gọi khi tạo đơn online).
     */
    isRestaurantOpen(tenantId: TenantId, restaurantId: string): Promise<boolean>;
    isSalesPromoUsed(tenantId: TenantId, deviceId: string, code: string): Promise<Result_36>;
    /**
     * / Đối tác còn nhận đơn không: đang không tạm nghỉ toàn bộ VÀ có ít nhất 1
     * / nhà hàng đang hiện cho khách đang nhận đơn. Đối tác chưa có nhà hàng nào
     * / hiện thì dùng giờ chung như cũ.
     */
    isStoreOpen(tenantId: TenantId): Promise<boolean>;
    issueInvoiceByDevice(tenantId: string, deviceId: string, orderId: string, invoiceId: string, pdfUrl: string): Promise<Result>;
    issueSalesBonus(tenantId: TenantId, email: string, periodType: string, periodKey: string, totalSales: bigint, hmac: Hmac): Promise<Result_35>;
    issueVpsAdminTicket(): Promise<Result_34>;
    /**
     * / Admin: mọi yêu cầu (mới nhất trước).
     */
    listChangeRequests(): Promise<Result_33>;
    listDevicesByRestaurant(tenantId: TenantId, restaurantId: RestaurantId, credential: string): Promise<Array<Device>>;
    listDevicesByRole(tenantId: TenantId, role: DeviceRole, credential: string): Promise<Array<Device>>;
    /**
     * / Gán tay: [(“tenantId|itemId”, groupId hoặc “-”)].
     */
    listDishGroupAssignments(): Promise<Array<[string, string]>>;
    /**
     * / Mọi nhóm món, xếp theo sortOrder (trang chủ chỉ dùng nhóm active).
     */
    listDishGroups(): Promise<Array<DishGroup>>;
    listHomeHidden(): Promise<Array<[string, HiddenItem]>>;
    /**
     * / Ghi chú bếp các đơn trong 2 ngày gần nhất của 1 đối tác.
     */
    listKitchenNotes(tenantId: TenantId): Promise<Array<KitchenNote>>;
    listMenus(tenantId: TenantId): Promise<Array<MenuItem>>;
    /**
     * / Yêu cầu của 1 đối tác (Chủ đối tác hoặc admin), mới nhất trước.
     */
    listMyChangeRequests(tenantId: TenantId, credential: string): Promise<Array<ChangeRequest>>;
    listMyVouchers(tenantId: TenantId, email: string): Promise<Array<Voucher>>;
    /**
     * / Trạng thái bếp các đơn trong 2 ngày gần nhất của 1 đối tác.
     */
    listOrderPrep(tenantId: TenantId): Promise<Array<OrderPrep>>;
    listOrders(tenantId: string, deviceId: string): Promise<Array<Order>>;
    /**
     * / Query: return today's paid orders for the driver pickup queue — orders with
     * / paymentStatus=#paid AND bookingStatus=#confirmed (not yet picked up),
     * / created today (UTC+7 day boundary, same day-retention logic as
     * / listPendingPaymentOrders). Admin sees the full records WITH PII;
     * / non-admin/anonymous callers (the driver pickup-queue flow) get the records
     * / with PII fields blanked, mirroring listPendingPaymentOrders gating.
     */
    listPaidOrdersForPickup(): Promise<Array<Order>>;
    listPartnerApplications(statusFilter: ApplicationStatus | null): Promise<{
        __kind__: "ok";
        ok: Array<Application>;
    } | {
        __kind__: "err";
        err: string;
    }>;
    listPartnerApplicationsAs(credential: string, statusFilter: ApplicationStatus | null): Promise<Result_32>;
    /**
     * / Admin / máy sàn Kế toán: tài khoản của mọi đối tác.
     */
    listPartnerBanks(credential: string): Promise<Result_31>;
    /**
     * / Admin hoặc máy cấp sàn (mọi vai trò) — sàn làm việc với đối tác.
     */
    listPartnerProfiles(credential: string): Promise<Result_30>;
    listPendingPaymentOrders(tenantId: string, restaurantId: string): Promise<Array<Order>>;
    listPlatformActivations(): Promise<Result_29>;
    listPlatformDevices(): Promise<Result_28>;
    /**
     * / Công khai (VPS đọc khi tạo đơn): [("tenantId|code", tài trợ từ lúc ns)].
     */
    listPlatformFundedPromos(): Promise<Array<[string, bigint]>>;
    /**
     * / Admin: mọi tham số (chung + riêng từng quán) kèm lịch sử.
     */
    listPlatformParams(): Promise<Result_27>;
    listPromotions(tenantId: TenantId, deviceId: string): Promise<Result_26>;
    listRegistrationPromos(tenantId: TenantId, deviceId: string): Promise<Result_25>;
    /**
     * / Giờ riêng + tạm nghỉ của các nhà hàng thuộc đối tác (nhà hàng chưa cài
     * / gì thì không có trong danh sách — dùng giờ chung).
     */
    listRestaurantOps(tenantId: TenantId): Promise<Array<[string, RestaurantOps]>>;
    listRestaurants(tenantId: TenantId): Promise<Array<Restaurant>>;
    listSalesPromos(tenantId: TenantId, deviceId: string): Promise<Result_24>;
    /**
     * / itemId các món báo hết hôm nay (công khai: trang đặt món ẩn các món này).
     */
    listSoldOutToday(tenantId: TenantId): Promise<Array<string>>;
    /**
     * / Món hết hôm nay kèm nhà hàng (công khai: trang đặt món / bán quầy ẩn
     * / món hết ở nhà hàng đang chọn).
     */
    listSoldOutTodayAt(tenantId: TenantId): Promise<Array<SoldOutEntry>>;
    /**
     * / Xem (chỉ đọc) máy của 1 quán để hỗ trợ cài đặt.
     */
    listTenantDevicesAs(credential: string, tenantId: TenantId): Promise<Result_23>;
    /**
     * / Liệt kê đối tác. Công khai. activeOnly=true chỉ trả đối tác đang hoạt
     * / động (caller không phải admin luôn chỉ thấy đối tác đang hoạt động).
     */
    listTenants(activeOnly: boolean): Promise<Array<Tenant>>;
    /**
     * / Bếp báo "Làm xong món" (#ready) hoặc "Đã đưa cho tài xế / khách" (#handed).
     */
    markOrderPrep(tenantId: TenantId, deviceId: DeviceId, orderId: string, stage: PrepStage): Promise<Result_22>;
    markPaymentExpired(orderId: string, hmac: string): Promise<Result>;
    /**
     * / Admin/driver update: mark an order as #pickedUp (Tài xế đã nhận hàng).
     * / Only succeeds when the order is currently #confirmed AND #paid; this ends
     * / the order lifecycle in customer mode. Returns the updated order on
     * / success, or #err if the caller is not an admin/driver, the order does not
     * / exist, or the order is not in the required state.
     */
    markPickedUp(orderId: string): Promise<Result>;
    pruneOldOrdersNow(hmac: string): Promise<Result_6>;
    /**
     * / Công khai: máy mới nhập mã khôi phục → thành máy Chủ đối tác (có khoá
     * / bí mật như activateDeviceSecure). Mã dùng 1 lần rồi xoá.
     */
    recoverOwnerDevice(tenantId: TenantId, code: string, deviceId: DeviceId, name: string, phone: string, tokenHash: Uint8Array): Promise<Result_18>;
    releaseVoucher(tenantId: TenantId, email: string, code: string, hmac: Hmac): Promise<Result_20>;
    /**
     * / Sơ duyệt: chỉ được "yêu cầu bổ sung". Duyệt / từ chối vẫn là việc của admin.
     */
    requestApplicationInfo(credential: string, applicationId: string, note: string): Promise<Result_19>;
    restoreUpgradeState(blob: Uint8Array): Promise<boolean>;
    reviewPartnerApplication(applicationId: string, decision: Decision, note: string): Promise<{
        __kind__: "ok";
        ok: Application;
    } | {
        __kind__: "err";
        err: string;
    }>;
    revokeDevice(tenantId: TenantId, deviceId: DeviceId, adminDeviceId: DeviceId): Promise<Result_18>;
    /**
     * / Thu hồi: máy mất quyền ngay ở canister; VPS nhớ tối đa 5 phút.
     */
    revokePlatformDevice(deviceId: string): Promise<Result_8>;
    /**
     * / Admin: tạo mới hoặc sửa nhóm (groupId chữ thường không dấu, số, “-”).
     */
    saveDishGroup(groupId: string, name: string, keywords: Array<string>, sortOrder: bigint, active: boolean, credential: string): Promise<Result_17>;
    schema(): Promise<string>;
    seedMenuItems(tenantId: TenantId, deviceId: DeviceId): Promise<boolean>;
    sendKmNotifyEmails(emails: Array<string>, subject: string, htmlBody: string, hmac: Hmac): Promise<Result_8>;
    sendVerificationCode(email: Email): Promise<SendCodeResult>;
    /**
     * / Admin: đặt tài khoản nhận tiền QR tại quầy cho quán.
     */
    setCounterPaymentAccount(tenantId: TenantId, bankBin: string, bankName: string, vaAccountNumber: string, accountName: string, merchantId: string, enabled: boolean): Promise<Result_16>;
    /**
     * / Bật/tắt gói bán tại quầy. CHỈ admin Tôi Đặt Món (sau khi quán trả phí).
     */
    setCounterPlan(tenantId: TenantId, enabled: boolean): Promise<Result_12>;
    /**
     * / Admin: bật/tắt gói bán quầy kèm hạn (0 = không hạn).
     */
    setCounterPlanUntil(tenantId: TenantId, enabled: boolean, until: Timestamp): Promise<Result_8>;
    /**
     * / Admin: gán tay 1 món vào nhóm. groupId "" = bỏ gán tay (về tự động),
     * / "-" = không xếp vào nhóm nào.
     */
    setDishGroupAssignment(tenantId: TenantId, itemId: string, groupId: string, credential: string): Promise<Result_8>;
    setHomeHidden(tenantId: TenantId, itemId: string, hidden: boolean, reason: string, credential: string): Promise<Result_8>;
    /**
     * / Báo hết / còn món TẠI 1 nhà hàng (restaurantId "" = mọi nhà hàng).
     * / Chủ đối tác: mọi nhà hàng. Nhân viên: chỉ nhà hàng của máy (máy không
     * / gắn nhà hàng thì như cũ — mọi nhà hàng).
     */
    setItemSoldOutAt(tenantId: TenantId, deviceId: DeviceId, itemId: string, restaurantId: string, soldOut: boolean): Promise<Result_8>;
    /**
     * / Báo món hết trong hôm nay / còn lại. Chủ quán hoặc Nhân viên.
     */
    setItemSoldOutToday(tenantId: TenantId, deviceId: DeviceId, itemId: string, soldOut: boolean): Promise<Result_8>;
    setItemVisible(tenantId: TenantId, deviceId: DeviceId, itemId: string, visible: boolean): Promise<Result_5>;
    /**
     * / Tham gia khuyến mại chung. CHỈ Chủ quán.
     */
    setJoinPlatformPromo(tenantId: TenantId, deviceId: DeviceId, join: boolean): Promise<Result_12>;
    /**
     * / Chủ đối tác: lưu thứ tự món hiện cho khách (itemId lạ / của đối tác
     * / khác bị bỏ qua). Áp dụng cho listMenus / getMenu / getMenuForRestaurant.
     */
    setMenuOrder(tenantId: TenantId, credential: string, itemIds: Array<string>): Promise<Result_8>;
    /**
     * / Máy quầy ghi "Ăn tại quán / Mang về" + ghi chú bếp cho đơn vừa tạo.
     */
    setOrderKitchenNote(tenantId: TenantId, deviceId: DeviceId, orderId: string, dineIn: boolean, note: string): Promise<Result_15>;
    /**
     * / Chủ đối tác: lưu mã khôi phục mới (máy tự sinh mã ngẫu nhiên, chỉ gửi
     * / SHA-256 của mã đã chuẩn hoá — viết hoa, bỏ gạch). Mã cũ hết hiệu lực.
     */
    setOwnerRecoveryHash(tenantId: TenantId, credential: string, codeHash: Uint8Array): Promise<Result_14>;
    /**
     * / Admin: nhập / sửa tài khoản nhận tiền của đối tác. 1 tài khoản dùng cho
     * / CẢ đối soát (sàn chuyển tiền) VÀ chuyển khoản tại quầy (khách quét QR ở
     * / bất kỳ nhà hàng nào của đối tác → tiền về tài khoản đối tác).
     * / bankBin: mã BIN VietQR của ngân hàng; counterQr: dùng cho QR tại quầy.
     */
    setPartnerBank(tenantId: TenantId, bankBin: string, bankName: string, accountNumber: string, accountHolder: string, branch: string, counterQr: boolean): Promise<Result_13>;
    /**
     * / Tạm nghỉ / nhận đơn lại (mọi nhà hàng của đối tác). CHỈ Chủ đối tác.
     */
    setPartnerPaused(tenantId: TenantId, deviceId: DeviceId, paused: boolean): Promise<Result_12>;
    setPartnerProfile(tenantId: TenantId, businessType: BusinessType, registrationNumber: string, representativeName: string, contactName: string, contactEmail: string): Promise<Result_11>;
    /**
     * / Admin-only update: set the paymentMode for `tenantId` to "driver" or
     * / "customer". Rejects any other value with #err. Returns #ok on success,
     * / #err if the caller is not an admin or the value is invalid. Mirrors
     * / setVpsSecret in mixins/secret-api.mo.
     */
    setPaymentMode(tenantId: TenantId, mode: string): Promise<Result_8>;
    /**
     * / Admin: đặt giá trị. scope "" = chung, tenantId = riêng quán đó.
     * / effectiveFrom (ns) trong quá khứ = áp dụng ngay. value "" = bỏ giá trị.
     */
    setPlatformParam(scope: string, key: string, value: string, effectiveFrom: Timestamp, note: string): Promise<Result_10>;
    /**
     * / Admin: đánh dấu / bỏ đánh dấu chương trình KM là "khuyến mại chung do sàn
     * / tài trợ" (code: mã Giờ vàng / KM đăng ký / KM doanh số của đối tác).
     */
    setPromoPlatformFunded(tenantId: TenantId, code: string, funded: boolean): Promise<Result_8>;
    /**
     * / Đặt giờ nhận đơn theo ngày cho 1 nhà hàng. hasHours = false → dùng giờ
     * / chung của đối tác.
     */
    setRestaurantHours(tenantId: TenantId, credential: string, restaurantId: string, hasHours: boolean, week: Array<DayHours>): Promise<Result_9>;
    setRestaurantPriceOverride(tenantId: TenantId, deviceId: DeviceId, restaurantId: string, itemId: string, price: bigint): Promise<Result_8>;
    /**
     * / Tạm nghỉ / mở lại 1 hoặc nhiều nhà hàng. until: ns (0 = đến khi mở lại).
     * / Mở lại (paused = false) cũng bỏ tạm nghỉ toàn bộ đối tác nếu máy là Chủ.
     */
    setRestaurantsPaused(tenantId: TenantId, credential: string, restaurantIds: Array<string>, paused: boolean, until: bigint): Promise<Result_8>;
    /**
     * / Admin-only update: set the store open/close hours for `tenantId`. Rejects
     * / any caller that is not an admin with #err. Returns #ok on success, #err if
     * / the caller is not an admin. Mirrors setPaymentMode in
     * / mixins/payment-mode-config-api.mo.
     */
    setStoreHours(tenantId: TenantId, hours: StoreHours): Promise<Result_8>;
    /**
     * / Giờ mở cửa do Chủ quán tự đặt (setStoreHours cũ chỉ cho admin).
     */
    setStoreHoursByDevice(tenantId: TenantId, deviceId: DeviceId, hours: StoreHours): Promise<Result_8>;
    /**
     * / Bật/tắt đối tác. Admin trung tâm only.
     */
    setTenantActive(tenantId: TenantId, active: boolean): Promise<{
        __kind__: "ok";
        ok: Tenant;
    } | {
        __kind__: "err";
        err: string;
    }>;
    /**
     * / Admin-only. Rotates the VPS secret: current `vpsSecret` is moved into
     * / `vpsSecretPrevious` before `newSecret` is written to `vpsSecret`.
     * / Returns `#ok` on success, `#err` if the caller is not an admin.
     */
    setVpsSecret(newSecret: string): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    snapshotUpgradeState(): Promise<Uint8Array>;
    stopPromotion(tenantId: TenantId, deviceId: string, code: string): Promise<Result_4>;
    stopRegistrationPromo(tenantId: TenantId, deviceId: string, code: string): Promise<Result_3>;
    stopSalesPromo(tenantId: TenantId, deviceId: string, code: string): Promise<Result_1>;
    /**
     * / Chủ đối tác gửi yêu cầu thay đổi. Tối đa 5 yêu cầu đang chờ / đối tác.
     */
    submitChangeRequest(tenantId: TenantId, credential: string, kind: string, payload: string, note: string): Promise<Result_7>;
    submitPartnerApplication(input: ApplicationInput): Promise<{
        __kind__: "ok";
        ok: string;
    } | {
        __kind__: "err";
        err: string;
    }>;
    /**
     * / Ghi nhận "dùng gần nhất" (tối đa 5 phút/lần) — trang /san gọi khi mở.
     */
    touchPlatformDevice(credential: string): Promise<PlatformDeviceView | null>;
    tryConsumeKmSlot(tenantId: TenantId, email: string, programCode: string, dailyLimit: bigint, hmac: Hmac): Promise<Result_6>;
    updateInvoiceStatus(orderId: OrderId, invoiceStatus: InvoiceStatus, invoiceId: string, pdfUrl: string, hmac: Hmac): Promise<Result>;
    updateItem(tenantId: TenantId, deviceId: DeviceId, itemId: string, name: string, price: bigint, unitName: string, vatRate: bigint, category: string, image: Uint8Array, visible: boolean): Promise<Result_5>;
    updateOrderQr(orderId: string, qrCode: string | null, billId: string | null, expireAt: bigint | null, hmac: string): Promise<Result>;
    updatePaymentStatus(orderId: OrderId, paymentStatus: PaymentStatus, hmac: Hmac): Promise<Result>;
    updatePromotion(tenantId: TenantId, deviceId: string, code: string, name: string, startDate: string, endDate: string, daysOfWeek: Array<boolean>, timeSlots: Array<TimeSlot>, dailyOrderLimit: bigint, perCustomerDailyLimit: bigint, tiers: Array<DiscountTier>, active: boolean, enabledOnline: boolean, enabledCounter: boolean, termsUrl: string): Promise<Result_4>;
    updateRegistrationPromo(tenantId: TenantId, deviceId: string, code: string, name: string, startDate: string, endDate: string, voucherValue: bigint, voucherValidDays: bigint, active: boolean, termsUrl: string): Promise<Result_3>;
    updateRestaurant(tenantId: TenantId, deviceId: DeviceId, restaurantId: string, name: string, address: string, phone: string, visible: boolean, lat: number, lng: number): Promise<Result_2>;
    updateSalesPromo(tenantId: TenantId, deviceId: string, code: string, name: string, startDate: string, endDate: string, weeklyTiers: Array<SalesTier>, monthlyTiers: Array<SalesTier>, voucherValidDays: bigint, active: boolean, enabledCounter: boolean, termsUrl: string): Promise<Result_1>;
    updateStatus(orderId: OrderId, bookingStatus: BookingStatus, hmac: Hmac): Promise<Result>;
    /**
     * / Cập nhật thông tin đối tác. Admin trung tâm only.
     */
    updateTenant(tenantId: TenantId, name: string, logoUrl: string, companyName: string, taxCode: string, address: string, phone: string, brandColor: string): Promise<{
        __kind__: "ok";
        ok: Tenant;
    } | {
        __kind__: "err";
        err: string;
    }>;
    verifyEmailCode(tenantId: string, email: Email, code: string): Promise<VerifyResult>;
}

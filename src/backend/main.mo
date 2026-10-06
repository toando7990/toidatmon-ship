import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Iter "mo:core/Iter";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";

import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import Expose "mo:caffeineai-oql/Expose";
import Entity "mo:caffeineai-oql/Entity";
import MapEntity "mo:caffeineai-oql/MapEntity";

import CoreApi "mixins/core-api";
import HmacApi "mixins/hmac-api";
import ApiDocMixin "mixins/api-doc";
import DevicesApi "mixins/devices-api";
import UpgradeApi "mixins/upgrade-api";
import SecretApi "mixins/secret-api";
import MenuApi "mixins/menu-api";
import MenuSeedApi "mixins/menu-seed-api";
import EmailVerificationApi "mixins/email-verification-api";
import PromotionApi "mixins/promotion-api";
import VoucherApi "mixins/voucher-api";
import RegistrationPromoApi "mixins/registration-promo-api";
import SalesPromoApi "mixins/sales-promo-api";
import PromoMaintenanceApi "mixins/promo-maintenance-api";
import PaymentModeConfigApi "mixins/payment-mode-config-api";
import StoreHoursConfigApi "mixins/store-hours-config-api";
import TenantApi "mixins/tenant-api";
import PartnerApplicationApi "mixins/partner-application-api";
import PartnerConsoleApi "mixins/partner-console-api";
import PlatformParamsApi "mixins/platform-params-api";
import DishGroupsApi "mixins/dish-groups-api";
import DishGroupTypes "types/dish-groups";
import VpsAdminApi "mixins/vps-admin-api";
import PlatformParamsTypes "types/platform-params";

import CoreLib "lib/core";
import CoreTypes "types/core";
import MenuSeedLib "lib/menu-seed";
import SecretLib "lib/secret";
import SecretTypes "types/secret";
import AccessControlLib "lib/access-control";
import EmailVerificationTypes "types/email-verification";
import PaymentModeConfigLib "lib/payment-mode-config";
import PaymentModeConfigTypes "types/payment-mode-config";
import StoreHoursConfigLib "lib/store-hours-config";
import StoreHoursConfigTypes "types/store-hours-config";
import PromotionTypes "types/promotion";
import VoucherTypes "types/voucher";
import RegistrationPromoTypes "types/registration-promo";
import SalesPromoTypes "types/sales-promo";
import TenantTypes "types/tenant";
import PartnerApplicationTypes "types/partner-application";
import PartnerConsoleTypes "types/partner-console";
import DeviceAuthTypes "types/device-auth";
import DeviceAuthLib "lib/device-auth";
// Top-level Value modules so the OQL auto-derivation resolver picks them up
// for the variant fields on the exposed entities.
import DeviceRoleValue "types/DeviceRoleValue";
import BoolValue "mo:caffeineai-oql/BoolValue";
import FloatValue "mo:caffeineai-oql/FloatValue";
import IntValue "mo:caffeineai-oql/IntValue";
import NatValue "mo:caffeineai-oql/NatValue";
import RecordValue "mo:caffeineai-oql/RecordValue";
import TextValue "mo:caffeineai-oql/TextValue";
import BlobValue "mo:caffeineai-oql/BlobValue";

actor Main {
  // Authorization state — transient (re-initialized on restart, as before).
  transient let accessControlState = AccessControl.initState();

  // Stable state — initialized by the migration chain (no inline initializers).
  //
  // vpsSecret / vpsSecretPrevious are declared `var` (mutable stable) so that
  // rotations performed via the transient `secretState` wrapper can be
  // persisted back to stable storage in `system func preupgrade`. With `let`
  // (immutable) the stable field could never capture a rotated value, so every
  // upgrade reset the secret to the migration's initial "" and broke HMAC
  // verification until an admin re-entered the secret on /admin.
  var vpsSecret : Text;
  var vpsSecretPrevious : Text;
  let admin : Principal;
  let orders : Map.Map<Text, CoreTypes.Order>;
  let devices : Map.Map<Text, CoreTypes.Device>;
  let pendingActivations : Map.Map<Text, CoreTypes.PendingActivation>;
  let menus : Map.Map<Text, CoreTypes.MenuItem>;
  let restaurants : Map.Map<Text, CoreTypes.Restaurant>;
  let restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;

  // Đối tác (tenant) — tập đối tác của nền tảng đa đối tác. key = tenantId
  // (slug đã chuẩn hoá). Đối tác do admin trung tâm tạo; migration backfill
  // đối tác mặc định 'bunbohue65' cho toàn bộ dữ liệu cũ.
  let tenants : TenantTypes.TenantStore;

  // Đơn đăng ký làm đối tác (quán tự gửi, admin trung tâm duyệt). key =
  // applicationId. Supplied by migrations/20261005_000000.mo.
  let partnerApplications : PartnerApplicationTypes.ApplicationStore;

  // Trang quản lý đối tác (/quan-ly) — supplied by migrations/20261006_000000.mo.
  let partnerSettings : PartnerConsoleTypes.SettingsStore;
  let soldOutItems : PartnerConsoleTypes.SoldOutStore;
  let orderPrep : PartnerConsoleTypes.PrepStore;

  // Khoá bí mật thiết bị — supplied by migrations/20261007_000000.mo.
  let deviceAuth : DeviceAuthTypes.DeviceAuthState;
  let platformParams : PlatformParamsTypes.ParamStore;
  let counterPlanUntil : PlatformParamsTypes.CounterPlanUntilStore;
  let counterPayments : PlatformParamsTypes.CounterPaymentStore;
  let kitchenNotes : PartnerConsoleTypes.KitchenNoteStore;
  // Nhóm món dùng chung toàn nền tảng — supplied by migrations/20261011_000000.mo.
  let dishGroups : DishGroupTypes.GroupStore;
  let dishGroupAssignments : DishGroupTypes.AssignmentStore;

  // Email OTP verification state — keyed by lower-cased email address. Supplied
  // by migrations/20260815_000000.mo (empty Map on fresh install/upgrade).
  let otpRecords : Map.Map<EmailVerificationTypes.Email, EmailVerificationTypes.OtpRecord>;

  // Per-tenant payment-mode map (tenantId -> PaymentMode). Controls who pays
  // shipping for each partner:
  //   #driver   — default; the driver pays at pickup (existing flow)
  //   #customer — the customer pays; the order ends when the driver picks up
  //               the goods (markPickedUp sets bookingStatus=#pickedUp).
  // A tenant absent from the map uses the default #driver. Declared `var`
  // (mutable stable) so that admin rotations performed via the transient
  // `paymentModeState` wrapper can be persisted back to stable storage in
  // `system func preupgrade` — same pattern as `vpsSecret` above.
  var paymentModes : PaymentModeConfigTypes.PaymentModeStore;

  // Per-tenant store open/close hours (tenantId -> StoreHours). Controls when
  // each partner's store accepts orders: when the current time is outside
  // [open, close), both the driver and customer flows block order placement and
  // show a waiting screen. A tenant absent from the map uses the default
  // 00:00–23:59 (always open). Declared `var` (mutable stable) so that admin
  // rotations performed via the transient `storeHoursState` wrapper can be
  // persisted back to stable storage in `system func preupgrade` — same pattern
  // as `paymentModes` / `vpsSecret` above.
  var storeHoursByTenant : StoreHoursConfigTypes.StoreHoursStore;

  // Đếm lượt dùng khuyến mại (KM) trong ngày, theo (tenant, email, chương
  // trình KM) — Giai đoạn 1 của hệ thống KM. Khoá composite dạng
  // "tenantId|email|programCode|YYYYMMDD" (giờ VN) — xem lib/promotion.mo.
  let kmUsage : PromotionTypes.KmUsageStore;

  // Đếm TỔNG số đơn KM/ngày TOÀN HỆ THỐNG CỦA 1 ĐỐI TÁC — khác kmUsage ở
  // trên (đếm theo TỪNG KHÁCH). Khoá "tenantId|programCode|YYYYMMDD".
  let kmDailyCount : PromotionTypes.KmDailyCountStore;

  // Chương trình khuyến mại Hệ 1 — theo khung giờ. key = mã chương trình
  // (8 ký tự ngẫu nhiên). Mỗi chương trình thuộc 1 đối tác.
  let promotions : PromotionTypes.PromotionStore;

  // Phiếu giảm giá — Giai đoạn 3b. key = mã phiếu (8 ký tự ngẫu nhiên).
  // Phát hành tự động bởi Giai đoạn 3c (đăng ký)/3d (doanh số tuần/tháng).
  let vouchers : VoucherTypes.VoucherStore;

  // Chương trình "Khuyến mại đăng ký" (Giai đoạn 3c). key = mã chương trình.
  let registrationPromos : RegistrationPromoTypes.RegistrationPromoStore;

  // Đánh dấu email đã từng nhận thưởng đăng ký (Giai đoạn 3c). key =
  // "tenantId|email" (lowercase), value = issuedAt. Đảm bảo mỗi khách CHỈ
  // NHẬN 1 LẦN DUY NHẤT TRONG ĐỜI TRONG 1 ĐỐI TÁC.
  let registrationBonusIssued : RegistrationPromoTypes.RegistrationBonusIssuedStore;

  // Chương trình "Khuyến mại doanh số tuần/tháng" (Giai đoạn 3d). key = mã
  // chương trình.
  let salesPromos : SalesPromoTypes.SalesPromoStore;

  // Chống phát trùng thưởng doanh số cho cùng 1 kỳ (Giai đoạn 3d). key =
  // "tenantId|email|periodType|periodKey".
  let salesBonusIssued : SalesPromoTypes.SalesBonusIssuedStore;

  // Đánh dấu chương trình KM Hệ 1 đã có khách dùng thành công — Giai đoạn 4f.
  // key = "tenantId|mã chương trình". Chương trình đã đánh dấu thì không cho
  // sửa/xoá nữa, chỉ còn "Dừng" (stopPromotion).
  let promotionUsed : PromotionTypes.PromotionUsedStore;

  // Stable shuttle for the transient `accessControlState`. The access-control
  // state is `transient let` — re-initialized empty on every (re)start — so
  // admin role assignments made at runtime via `assignCallerUserRole` are lost
  // across upgrades. This stable `var` pair persists the role map across
  // upgrades by serializing the non-shared `Map.Map<Principal, UserRole>` into
  // a shared `[(Principal, UserRole)]` array. The preupgrade hook copies the
  // live `accessControlState` into the shuttle; the postupgrade hook re-seeds
  // `accessControlState` from the shuttle.
  var accessControlShuttle : AccessControlLib.AccessControlShuttle;

  // Mutable secret-state record shared with the secret domain. Wraps the two
  // stable secret vars by reference so mixin mutations propagate to actor state.
  transient let secretState : SecretTypes.SecretState = {
    var vpsSecret = vpsSecret;
    var vpsSecretPrevious = vpsSecretPrevious;
  };

  // Mutable payment-mode-state record shared with the payment-mode-config
  // domain. Wraps the stable `var paymentModes` by reference so mixin mutations
  // (setPaymentMode) propagate to actor state — same shape as `secretState`.
  // The stable `var` is updated by the preupgrade hook (see
  // PaymentModeConfigLib.syncToStable) so the value survives upgrades.
  transient let paymentModeState : PaymentModeConfigTypes.PaymentModeState = {
    var paymentModes = paymentModes;
  };

  // Mutable store-hours-state record shared with the store-hours-config domain.
  // Wraps the stable `var storeHoursByTenant` by reference so mixin mutations
  // (setStoreHours) propagate to actor state — same shape as `paymentModeState`.
  // The stable `var` is updated by the preupgrade hook (see
  // StoreHoursConfigLib.syncToStable) so the value survives upgrades.
  transient let storeHoursState : StoreHoursConfigTypes.StoreHoursState = {
    var storeHoursByTenant = storeHoursByTenant;
  };

  // Upgrade hooks: keep the stable `var vpsSecret` / `var vpsSecretPrevious`
  // pair in sync with the transient `secretState` wrapper across upgrades.
  //
  //   preupgrade  : copy secretState.*  -> stable var*   (persist rotation)
  //   postupgrade : copy stable var*    -> secretState.*  (restore to wrapper)
  //
  // Motoko passes primitive `var` actor fields by value, so the helpers cannot
  // mutate the stable `var` pair directly. Instead each hook builds a fresh
  // `StableSecretRef` from the current stable values, hands it to the helper for
  // the copy, then writes the (possibly mutated) ref fields back to the stable
  // `var` pair.
  system func preupgrade() {
    let ref : SecretTypes.StableSecretRef = {
      var vpsSecret = vpsSecret;
      var vpsSecretPrevious = vpsSecretPrevious;
    };
    SecretLib.syncToStable(secretState, ref);
    vpsSecret := ref.vpsSecret;
    vpsSecretPrevious := ref.vpsSecretPrevious;

    // Sync accessControlState -> accessControlShuttle AFTER the secret sync so
    // runtime admin role assignments survive the upgrade.
    accessControlShuttle := AccessControlLib.toStable(accessControlState);

    // Sync paymentModeState -> stable `var paymentModes` so admin rotations
    // performed via setPaymentMode survive the upgrade.
    let paymentModeRef : PaymentModeConfigTypes.StablePaymentModeRef = {
      var paymentModes = paymentModes;
    };
    PaymentModeConfigLib.syncToStable(paymentModeState, paymentModeRef);
    paymentModes := paymentModeRef.paymentModes;

    // Sync storeHoursState -> stable `var storeHoursByTenant` so admin rotations
    // performed via setStoreHours survive the upgrade.
    let storeHoursRef : StoreHoursConfigTypes.StableStoreHoursRef = {
      var storeHoursByTenant = storeHoursByTenant;
    };
    StoreHoursConfigLib.syncToStable(storeHoursState, storeHoursRef);
    storeHoursByTenant := storeHoursRef.storeHoursByTenant;
  };

  system func postupgrade() {
    // Lần nâng cấp đầu có khoá thiết bị: mở 14 ngày ân hạn cho máy cũ.
    DeviceAuthLib.startGraceIfUnset(deviceAuth);

    let ref : SecretTypes.StableSecretRef = {
      var vpsSecret = vpsSecret;
      var vpsSecretPrevious = vpsSecretPrevious;
    };
    SecretLib.syncFromStable(secretState, ref);

    // Re-seed accessControlState <- accessControlShuttle AFTER restoring the
    // secret so the transient `accessControlState` picks up the persisted admin
    // role assignments.
    AccessControlLib.fromStable(accessControlState, accessControlShuttle);

    // Restore paymentModeState <- stable `var paymentModes`.
    let paymentModeRef : PaymentModeConfigTypes.StablePaymentModeRef = {
      var paymentModes = paymentModes;
    };
    PaymentModeConfigLib.syncFromStable(paymentModeState, paymentModeRef);

    // Restore storeHoursState <- stable `var storeHoursByTenant`.
    let storeHoursRef : StoreHoursConfigTypes.StableStoreHoursRef = {
      var storeHoursByTenant = storeHoursByTenant;
    };
    StoreHoursConfigLib.syncFromStable(storeHoursState, storeHoursRef);

    // Idempotent menu seed: ensure the 'Dụng cụ đựng đồ ăn' item exists in the
    // 'Khác' category FOR EVERY TENANT so the VPS can fetch its unit price when
    // computing quotes. Runs on every install/upgrade; no-ops when the item
    // already exists for that tenant.
    for ((tenantId, _t) in tenants.toArray().values()) {
      ignore MenuSeedLib.seedMenuItems(menus, tenantId);
    };
  };

  // Core domain state record shared with the core-api mixin. `secretState` is
  // the mutable-by-reference SecretState (see above) so createOrder/cancelOrder
  // read the LIVE secret pair via `state.secretState.vpsSecret` /
  // `state.secretState.vpsSecretPrevious` even after `setVpsSecret` rotates
  // them.
  transient let coreState : CoreLib.State = {
    var secretState = secretState;
    var admin = admin;
    var orders = orders;
    var devices = devices;
    var pendingActivations = pendingActivations;
    var menus = menus;
    var restaurants = restaurants;
    var restaurantMenuOverrides = restaurantMenuOverrides;
  };

  include MixinAuthorization(accessControlState, null);
  include ApiDocMixin();
  include TenantApi(tenants, accessControlState);
  include PartnerApplicationApi(partnerApplications, tenants, accessControlState);
  include CoreApi(accessControlState, coreState, deviceAuth);
  include HmacApi(orders, secretState);
  include DevicesApi(accessControlState, tenants, devices, deviceAuth, pendingActivations);
  include UpgradeApi(accessControlState, orders, devices, pendingActivations, menus, restaurants, restaurantMenuOverrides);
  include SecretApi(secretState, accessControlState);
  include MenuApi(accessControlState, tenants, devices, deviceAuth, menus, restaurants, restaurantMenuOverrides);
  include MenuSeedApi(accessControlState, devices, deviceAuth, menus);
  include EmailVerificationApi(otpRecords, registrationPromos, registrationBonusIssued, vouchers, secretState, tenants);
  include PromotionApi(accessControlState, devices, deviceAuth, kmUsage, kmDailyCount, promotions, secretState, otpRecords, promotionUsed);
  include VoucherApi(vouchers, secretState);
  include RegistrationPromoApi(accessControlState, devices, deviceAuth, registrationPromos, vouchers);
  include SalesPromoApi(accessControlState, devices, deviceAuth, salesPromos, salesBonusIssued, vouchers, secretState, tenants);
  include PromoMaintenanceApi(promotions, registrationPromos, salesPromos, vouchers, secretState);
  include PaymentModeConfigApi(accessControlState, paymentModeState, coreState);
  include StoreHoursConfigApi(accessControlState, storeHoursState, partnerSettings);
  include PartnerConsoleApi(accessControlState, tenants, devices, deviceAuth, menus, storeHoursState, partnerSettings, soldOutItems, orderPrep, counterPlanUntil, kitchenNotes);
  include PlatformParamsApi(accessControlState, devices, deviceAuth, platformParams, counterPayments);
  include VpsAdminApi(accessControlState, secretState, platformParams);
  include DishGroupsApi(accessControlState, dishGroups, dishGroupAssignments);

  /// Returns the canister's own id as text, so the VPS knows which canister
  /// it is talking to. `Principal.fromActor(Main)` resolves the actor's own
  /// canister principal at runtime (mo:core/IC.getCanisterId does not exist in
  /// core 2.6.1).
  public query func getCanisterIdText() : async Text {
    Principal.fromActor(Main).toText();
  };

  // Variant → text helpers for the manual orders entity. Local funcs keep the
  // payload extractors self-contained; the OQL column arrives as #text.
  func bookingStatusText(s : CoreTypes.BookingStatus) : Text = switch s {
    case (#pending) "pending";
    case (#confirmed) "confirmed";
    case (#shipping) "shipping";
    case (#pickedUp) "pickedUp";
    case (#completed) "completed";
    case (#cancelled) "cancelled";
  };
  func paymentStatusText(s : CoreTypes.PaymentStatus) : Text = switch s {
    case (#unpaid) "unpaid";
    case (#paid) "paid";
    case (#refunded) "refunded";
    case (#expired) "expired";
  };
  func invoiceStatusText(s : CoreTypes.InvoiceStatus) : Text = switch s {
    case (#none) "none";
    case (#invoiced) "invoiced";
    case (#failed) "failed";
  };

  // Flatten the nested Map<Text, Map<Text, Nat>> (restaurantId -> itemId ->
  // price override) into an iterator of flat records so the OQL manual entity
  // can auto-derive one row per (restaurantId, itemId, price) triple.
  func menuOverrideRows(
    overrides : Map.Map<Text, Map.Map<Text, Nat>>,
  ) : Iter.Iter<{ restaurantId : Text; itemId : Text; price : Nat }> {
    let outer = overrides.entries();
    var currentRestaurantId : Text = "";
    var inner : ?Iter.Iter<(Text, Nat)> = null;
    object {
      public func next() : ?{ restaurantId : Text; itemId : Text; price : Nat } {
        loop {
          switch (inner) {
            case (?it) {
              switch (it.next()) {
                case (?(itemId, price)) {
                  return ?{ restaurantId = currentRestaurantId; itemId; price };
                };
                case null { inner := null };
              };
            };
            case null {};
          };
          switch (outer.next()) {
            case (?(restaurantId, innerMap)) {
              currentRestaurantId := restaurantId;
              inner := ?innerMap.entries();
            };
            case null { return null };
          };
        };
      };
    };
  };

  // OQL exposure — operational data is admin-managed; controller-only keeps it
  // private to users while still answerable by the Data Intelligence agent.
  // pendingActivations are short-lived secrets and are NOT exposed.
  include Expose({
    entities = [
      // tenants: all-primitive record — auto-derive. Exposed so the Data
      // Intelligence agent can answer questions about partners.
      Entity.sample(
        tenants.toEntity(
          "tenant", "Tenant", "tenantId",
        ),
        {
          tenantId = "";
          slug = "";
          name = "";
          logoUrl = "";
          companyName = "";
          taxCode = "";
          address = "";
          phone = "";
          brandColor = "";
          active = false;
          createdAt = 0;
          updatedAt = 0;
        },
      )
        .controllerOnly()
        .build(),

      // orders: manual mode because Order carries a [OrderItem] collection
      // field plus variant fields; auto-derive cannot flatten those. Promote
      // each primitive/variant column explicitly; items is dropped.
      Entity.sample(
        orders.toEntityManual(
          "order", "Order", "orderId",
        ),
        {
          orderId = "";
          tenantId = "";
          restaurantId = "";
          cusName = "";
          cusPhone = "";
          cusAddress = "";
          cusTaxCode = "";
          receiverEmail = "";
          pickupCode = "";
          items = [];
          amount = 0;
          goodsAmount = 0;
          shippingFee = 0;
          taxTotal = 0;
          bookingStatus = #pending;
          paymentStatus = #unpaid;
          invoiceStatus = #none;
          ahamoveOrderId = "";
          tingeeQrId = "";
          tingeeQrCode = "";
          sharedLink = "";
          invoiceId = "";
          pdfUrl = "";
          paymentVerificationImage = "";
          billId = null;
          qrCode = null;
          expireAt = null;
          kmDiscountAmount = 0;
          voucherDiscountAmount = 0;
          createdAt = 0;
          updatedAt = 0;
        },
      )
        .payload("orderId", func(o : CoreTypes.Order) : Text = o.orderId)
        .payload("tenantId", func(o : CoreTypes.Order) : Text = o.tenantId)
        .edge("tenantId", "tenant")
        .payload("restaurantId", func(o : CoreTypes.Order) : Text = o.restaurantId)
        .payload("cusName", func(o : CoreTypes.Order) : Text = o.cusName)
        .payload("cusPhone", func(o : CoreTypes.Order) : Text = o.cusPhone)
        .payload("cusAddress", func(o : CoreTypes.Order) : Text = o.cusAddress)
        .payload("cusTaxCode", func(o : CoreTypes.Order) : Text = o.cusTaxCode)
        .payload("receiverEmail", func(o : CoreTypes.Order) : Text = o.receiverEmail)
        .payload("pickupCode", func(o : CoreTypes.Order) : Text = o.pickupCode)
        .payload("amount", func(o : CoreTypes.Order) : Nat = o.amount)
        .payload("goodsAmount", func(o : CoreTypes.Order) : Nat = o.goodsAmount)
        .payload("shippingFee", func(o : CoreTypes.Order) : Nat = o.shippingFee)
        .payload("taxTotal", func(o : CoreTypes.Order) : Nat = o.taxTotal)
        .payload("bookingStatus", func(o : CoreTypes.Order) : Text = bookingStatusText(o.bookingStatus))
        .payload("paymentStatus", func(o : CoreTypes.Order) : Text = paymentStatusText(o.paymentStatus))
        .payload("invoiceStatus", func(o : CoreTypes.Order) : Text = invoiceStatusText(o.invoiceStatus))
        .payload("ahamoveOrderId", func(o : CoreTypes.Order) : Text = o.ahamoveOrderId)
        .payload("tingeeQrId", func(o : CoreTypes.Order) : Text = o.tingeeQrId)
        .payload("tingeeQrCode", func(o : CoreTypes.Order) : Text = o.tingeeQrCode)
        .payload("sharedLink", func(o : CoreTypes.Order) : Text = o.sharedLink)
        .payload("invoiceId", func(o : CoreTypes.Order) : Text = o.invoiceId)
        // pdfUrl: URL file PDF hoá đơn điện tử (do VPS lấy qua mã lệnh 818 và
        // đẩy ngược qua updateInvoiceStatus). Rỗng khi chưa có PDF.
        .payload("pdfUrl", func(o : CoreTypes.Order) : Text = o.pdfUrl)
        // paymentVerificationImage: URL ảnh xác thực thanh toán (ảnh chụp
        // biên lai/QR đã thanh toán) — vai trò Kế toán hiển thị khi tra cứu
        // đơn. Rỗng khi chưa có ảnh.
        .payload("paymentVerificationImage", func(o : CoreTypes.Order) : Text = o.paymentVerificationImage)
        // billId / qrCode / expireAt: optional QR fields (order-payment). OQL
        // manual payloads need a flat value, so options collapse to a sentinel
        // ("" / 0) when null.
        .payload("billId", func(o : CoreTypes.Order) : Text = o.billId.get(""))
        .payload("qrCode", func(o : CoreTypes.Order) : Text = o.qrCode.get(""))
        .payload("expireAt", func(o : CoreTypes.Order) : Nat = o.expireAt.get(0 : Nat64).toNat())
        .payload("createdAt", func(o : CoreTypes.Order) : Int = o.createdAt)
        .payload("updatedAt", func(o : CoreTypes.Order) : Int = o.updatedAt)
        .controllerOnly()
        .build(),

      // devices: auto-derive works — DeviceRole has DeviceRoleValue.mo.
      Entity.sample(
        devices.toEntity(
          "device", "Device", "deviceId",
        ),
        {
          deviceId = "";
          tenantId = "";
          restaurantId = "";
          role = #admin;
          name = "";
          phone = "";
          activatedAt = 0;
          active = false;
        },
      )
        .edge("tenantId", "tenant")
        .controllerOnly()
        .build(),

      // menus: all-primitive record — auto-derive (Blob via BlobValue).
      Entity.sample(
        menus.toEntity(
          "menuItem", "MenuItem", "itemId",
        ),
        {
          itemId = "";
          tenantId = "";
          name = "";
          price = 0;
          unitName = "";
          vatRate = 0;
          category = "";
          image = ("" : Blob);
          visible = false;
        },
      )
        .edge("tenantId", "tenant")
        .controllerOnly()
        .build(),

      // restaurants: all-primitive record — auto-derive.
      Entity.sample(
        restaurants.toEntity(
          "restaurant", "Restaurant", "restaurantId",
        ),
        {
          restaurantId = "";
          tenantId = "";
          name = "";
          address = "";
          phone = "";
          visible = false;
          lat = 0.0;
          lng = 0.0;
        },
      )
        .edge("tenantId", "tenant")
        .controllerOnly()
        .build(),

      // pendingActivations: short-lived activation codes. DeviceRole has a
      // DeviceRoleValue.mo so auto-derive handles the variant field.
      Entity.sample(
        pendingActivations.toEntity(
          "pendingActivation", "PendingActivation", "code",
        ),
        {
          code = "";
          tenantId = "";
          restaurantId = "";
          role = #admin;
          createdAt = 0;
          expiresAt = 0;
          used = false;
        },
      )
        .edge("tenantId", "tenant")
        .controllerOnly()
        .build(),

      // restaurantMenuOverrides: Map<Text, Map<Text, Nat>> — a nested map
      // (restaurantId -> (itemId -> price override)). Flatten into one row per
      // (restaurantId, itemId) triple so each row is a flat record, then .edge
      // the promoted keys to the restaurant and menuItem entities.
      Entity.sample(
        Entity.manual<{ restaurantId : Text; itemId : Text; price : Nat }>(
          "menuOverride",
          func() = menuOverrideRows(restaurantMenuOverrides),
          "MenuOverride",
          "key",
        ),
        { restaurantId = ""; itemId = ""; price = 0 },
      )
        .payload("key", func(r) : Text = r.restaurantId # "|" # r.itemId)
        .payload("restaurantId", func(r) : Text = r.restaurantId)
        .edge("restaurantId", "restaurant")
        .payload("itemId", func(r) : Text = r.itemId)
        .edge("itemId", "menuItem")
        .payload("price", func(r) : Nat = r.price)
        .controllerOnly()
        .build(),

      // paymentModes: per-tenant config entity (one row per tenant). Manual
      // mode over an iterator on paymentModeState so the per-tenant flag is
      // queryable by the Data Intelligence agent. controllerOnly keeps it
      // private to users. The payload columns "tenantId" and "paymentMode"
      // render the variant via PaymentModeConfigTypes.toText so the OQL column
      // arrives as #text.
      Entity.sample(
        Entity.manual<(Text, PaymentModeConfigTypes.PaymentMode)>(
          "paymentMode",
          func() = paymentModeState.paymentModes.entries(),
          "PaymentMode",
          "tenantId",
        ),
        ("", #driver : PaymentModeConfigTypes.PaymentMode),
      )
        .payload("tenantId", func((tenantId, _mode) : (Text, PaymentModeConfigTypes.PaymentMode)) : Text = tenantId)
        .edge("tenantId", "tenant")
        .payload("paymentMode", func((_tenantId, mode) : (Text, PaymentModeConfigTypes.PaymentMode)) : Text = PaymentModeConfigTypes.toText(mode))
        .controllerOnly()
        .build(),

      // storeHours: per-tenant config entity (one row per tenant). Manual mode
      // over an iterator on storeHoursState so the per-tenant open/close hours
      // are queryable by the Data Intelligence agent. controllerOnly keeps it
      // private to users. Each field of the StoreHours record is exposed as its
      // own Nat column (openHour/openMinute/closeHour/closeMinute, 24h clock).
      Entity.sample(
        Entity.manual<(Text, StoreHoursConfigTypes.StoreHours)>(
          "storeHours",
          func() = storeHoursState.storeHoursByTenant.entries(),
          "StoreHours",
          "tenantId",
        ),
        ("", { openHour = 0; openMinute = 0; closeHour = 23; closeMinute = 59 }),
      )
        .payload("tenantId", func((tenantId, _hours) : (Text, StoreHoursConfigTypes.StoreHours)) : Text = tenantId)
        .edge("tenantId", "tenant")
        .payload("openHour", func((_tenantId, hours) : (Text, StoreHoursConfigTypes.StoreHours)) : Nat = hours.openHour)
        .payload("openMinute", func((_tenantId, hours) : (Text, StoreHoursConfigTypes.StoreHours)) : Nat = hours.openMinute)
        .payload("closeHour", func((_tenantId, hours) : (Text, StoreHoursConfigTypes.StoreHours)) : Nat = hours.closeHour)
        .payload("closeMinute", func((_tenantId, hours) : (Text, StoreHoursConfigTypes.StoreHours)) : Nat = hours.closeMinute)
        .controllerOnly()
        .build(),

      // promotions: manual mode because Promotion carries [TimeSlot] and
      // [DiscountTier] collection fields plus a [Bool] daysOfWeek; auto-derive
      // cannot flatten those. Promote each primitive/variant column explicitly;
      // daysOfWeek/timeSlots/tiers are dropped.
      Entity.sample(
        promotions.toEntityManual(
          "promotion", "Promotion", "code",
        ),
        {
          code = "";
          tenantId = "";
          name = "";
          startDate = "";
          endDate = "";
          daysOfWeek = [];
          timeSlots = [];
          dailyOrderLimit = 0;
          perCustomerDailyLimit = 0;
          tiers = [];
          active = false;
          enabledOnline = false;
          enabledCounter = false;
          termsUrl = "";
        },
      )
        .payload("code", func(p : PromotionTypes.Promotion) : Text = p.code)
        .payload("tenantId", func(p : PromotionTypes.Promotion) : Text = p.tenantId)
        .edge("tenantId", "tenant")
        .payload("name", func(p : PromotionTypes.Promotion) : Text = p.name)
        .payload("startDate", func(p : PromotionTypes.Promotion) : Text = p.startDate)
        .payload("endDate", func(p : PromotionTypes.Promotion) : Text = p.endDate)
        .payload("dailyOrderLimit", func(p : PromotionTypes.Promotion) : Nat = p.dailyOrderLimit)
        .payload("perCustomerDailyLimit", func(p : PromotionTypes.Promotion) : Nat = p.perCustomerDailyLimit)
        .payload("active", func(p : PromotionTypes.Promotion) : Bool = p.active)
        .payload("enabledOnline", func(p : PromotionTypes.Promotion) : Bool = p.enabledOnline)
        .payload("enabledCounter", func(p : PromotionTypes.Promotion) : Bool = p.enabledCounter)
        .payload("termsUrl", func(p : PromotionTypes.Promotion) : Text = p.termsUrl)
        .controllerOnly()
        .build(),

      // vouchers: all-primitive record — auto-derive.
      Entity.sample(
        vouchers.toEntity(
          "voucher", "Voucher", "code",
        ),
        {
          code = "";
          tenantId = "";
          programCode = "";
          email = "";
          value = 0;
          startDate = "";
          endDate = "";
          used = false;
          issuedAt = 0;
        },
      )
        .edge("tenantId", "tenant")
        .controllerOnly()
        .build(),

      // registrationPromos: all-primitive record — auto-derive.
      Entity.sample(
        registrationPromos.toEntity(
          "registrationPromo", "RegistrationPromo", "code",
        ),
        {
          code = "";
          tenantId = "";
          name = "";
          startDate = "";
          endDate = "";
          voucherValue = 0;
          voucherValidDays = 0;
          active = false;
          termsUrl = "";
        },
      )
        .edge("tenantId", "tenant")
        .controllerOnly()
        .build(),

      // salesPromos: manual mode because SalesPromo carries [SalesTier]
      // collection fields (weeklyTiers/monthlyTiers); auto-derive cannot
      // flatten those. Promote each primitive column explicitly; the tier
      // arrays are dropped.
      Entity.sample(
        salesPromos.toEntityManual(
          "salesPromo", "SalesPromo", "code",
        ),
        {
          code = "";
          tenantId = "";
          name = "";
          startDate = "";
          endDate = "";
          weeklyTiers = [];
          monthlyTiers = [];
          voucherValidDays = 0;
          active = false;
          enabledCounter = false;
          termsUrl = "";
        },
      )
        .payload("code", func(s : SalesPromoTypes.SalesPromo) : Text = s.code)
        .payload("tenantId", func(s : SalesPromoTypes.SalesPromo) : Text = s.tenantId)
        .edge("tenantId", "tenant")
        .payload("name", func(s : SalesPromoTypes.SalesPromo) : Text = s.name)
        .payload("startDate", func(s : SalesPromoTypes.SalesPromo) : Text = s.startDate)
        .payload("endDate", func(s : SalesPromoTypes.SalesPromo) : Text = s.endDate)
        .payload("voucherValidDays", func(s : SalesPromoTypes.SalesPromo) : Nat = s.voucherValidDays)
        .payload("active", func(s : SalesPromoTypes.SalesPromo) : Bool = s.active)
        .payload("enabledCounter", func(s : SalesPromoTypes.SalesPromo) : Bool = s.enabledCounter)
        .payload("termsUrl", func(s : SalesPromoTypes.SalesPromo) : Text = s.termsUrl)
        .controllerOnly()
        .build(),
    ];
  });
};

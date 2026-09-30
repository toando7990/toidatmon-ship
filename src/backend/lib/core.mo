import Map "mo:core/Map";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import CoreTypes "../types/core";
import SecretTypes "../types/secret";

// Domain logic for the core domain (orders).
// Stateless module functions operating on injected state. Device/menu/restaurant
// domains own their own lib modules (lib/devices.mo, lib/menu.mo) and are
// invoked directly by their mixins; this module only implements order logic.
module {
  public type Order = CoreTypes.Order;
  public type OrderItem = CoreTypes.OrderItem;
  public type Device = CoreTypes.Device;
  public type PendingActivation = CoreTypes.PendingActivation;
  public type MenuItem = CoreTypes.MenuItem;
  public type Restaurant = CoreTypes.Restaurant;
  public type OrderStatus = CoreTypes.OrderStatus;
  public type BookingStatus = CoreTypes.BookingStatus;
  public type PaymentStatus = CoreTypes.PaymentStatus;
  public type InvoiceStatus = CoreTypes.InvoiceStatus;

  // Stable state shape passed in from the actor / mixin layer.
  // `secretState` is the mutable-by-reference SecretState owned by main.mo;
  // reading `secretState.vpsSecret` / `secretState.vpsSecretPrevious` here
  // always sees the CURRENT secret pair, even after `setVpsSecret` rotates
  // them. This fixes the stale-snapshot rotation bug: previously coreState
  // copied the secret into its own var fields at construction time, so HMAC
  // verification in createOrder/cancelOrder used a frozen secret.
  public type State = {
    var secretState : SecretTypes.SecretState;
    var admin : Principal;
    var orders : Map.Map<Text, Order>;
    var devices : Map.Map<Text, Device>;
    var pendingActivations : Map.Map<Text, PendingActivation>;
    var menus : Map.Map<Text, MenuItem>;
    var restaurants : Map.Map<Text, Restaurant>;
    var restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
  };

  // --- Day-based retention (UTC+7) ---

  // Nanosecond constants for the UTC+7 day-boundary math. `Time.now()` returns
  // nanoseconds since epoch (Int). Computed via functions because module-level
  // `let` bindings must be static expressions (arithmetic is non-static).
  func HOUR_NS() : Int { 3600 * 1000000000 };
  func DAY_NS() : Int { 24 * HOUR_NS() };
  func MINUTE_NS() : Int { 60 * 1000000000 };
  func UTC7_OFFSET_NS() : Int { 7 * HOUR_NS() };
  func GRACE_NS() : Int { 5 * MINUTE_NS() };

  // Start of the current UTC+7 day, in nanoseconds since epoch. Computed by
  // shifting `now` forward by the UTC+7 offset, truncating to a whole day, then
  // shifting back. `now` is always positive (post-1970), so Int division
  // truncates toward zero == floor.
  func utc7DayStart(now : Int) : Int {
    let shifted = now + UTC7_OFFSET_NS();
    (shifted / DAY_NS()) * DAY_NS() - UTC7_OFFSET_NS();
  };

  // Retention boundary: orders with createdAt < this are pruned. Normally the
  // start of today (UTC+7). During the 5-minute grace period after midnight
  // (UTC+7) the boundary is pushed back a full day, so yesterday's orders are
  // still served until 00:05 and only then removed.
  func retentionBoundary(now : Int) : Int {
    let dayStart = utc7DayStart(now);
    if (now - dayStart < GRACE_NS()) { dayStart - DAY_NS() } else { dayStart };
  };

  // Day-based retention: remove every order whose createdAt belongs to a
  // previous UTC+7 day (with a 5-minute grace period after midnight). Called at
  // the start of every order read/write operation so the canister only ever
  // serves today's orders; the VPS keeps full history and only syncs the
  // current day.
  public func pruneOldOrders(state : State) : () {
    let boundary = retentionBoundary(Time.now());
    let snapshot = state.orders.toArray();
    for ((id, o) in snapshot.values()) {
      if (o.createdAt < boundary) {
        state.orders.remove(id);
      };
    };
  };

  // --- Orders ---

  // Persist a fully-formed Order record into the orders store. The caller
  // (mixins/core-api.mo createOrder) is responsible for HMAC verification and
  // for building the Order literal including tingeeQrCode; this function only
  // writes it. Overwrites any existing entry with the same orderId.
  public func createOrder(state : State, order : Order) : () {
    pruneOldOrders(state);
    state.orders.add(order.orderId, order);
  };

  // Return all orders OF 1 ĐỐI TÁC as an array snapshot, ordered by
  // Map.entries() (B-tree key order, i.e. lexicographic by orderId). PII gating
  // is the mixin's responsibility (it calls sanitizePii per record when the
  // caller is not an admin); this function returns the raw records.
  public func listOrders(state : State, tenantId : Text) : [Order] {
    pruneOldOrders(state);
    let snapshot = state.orders.toArray();
    snapshot
      .filter(func((_id, o) : (Text, Order)) : Bool { o.tenantId == tenantId })
      .map(func((_id, o) : (Text, Order)) : Order { o });
  };

  // Look up a single order by orderId WITHIN 1 ĐỐI TÁC. Returns null when
  // absent or owned by another tenant. PII gating is the mixin's responsibility.
  public func getOrder(state : State, tenantId : Text, orderId : Text) : ?Order {
    pruneOldOrders(state);
    switch (state.orders.get(orderId)) {
      case null { null };
      case (?o) { if (o.tenantId == tenantId) { ?o } else { null } };
    };
  };

  // Builds the lightweight OrderStatus snapshot for the frontend 5s poll.
  // Includes tingeeQrCode (synced from Order.tingeeQrCode) so OrderTracker.tsx
  // can render the QR via <QRCodeSVG> when paymentStatus is #unpaid. Returns
  // null when the order does not exist or belongs to another tenant.
  public func getOrderStatus(state : State, tenantId : Text, orderId : Text) : ?OrderStatus {
    switch (state.orders.get(orderId)) {
      case null { null };
      case (?o) {
        if (o.tenantId != tenantId) {
          return null;
        };
        ?{
          bookingStatus = o.bookingStatus;
          paymentStatus = o.paymentStatus;
          invoiceStatus = o.invoiceStatus;
          tingeeQrId = o.tingeeQrId;
          sharedLink = o.sharedLink;
          tingeeQrCode = o.tingeeQrCode;
          invoiceId = o.invoiceId;
          pdfUrl = o.pdfUrl;
        };
      };
    };
  };

  // Return all orders for a restaurant OF 1 ĐỐI TÁC whose paymentStatus is
  // #unpaid, as an array snapshot. PII gating is the mixin's responsibility.
  public func listPendingPaymentOrders(state : State, tenantId : Text, restaurantId : Text) : [Order] {
    pruneOldOrders(state);
    let snapshot = state.orders.toArray();
    let pending = snapshot.filter(func((_id, o) : (Text, Order)) : Bool {
      o.tenantId == tenantId and o.restaurantId == restaurantId and (o.paymentStatus == #unpaid or o.paymentStatus == #expired);
    });
    pending.map(func((_id, o) : (Text, Order)) : Order { o });
  };

  // Set bookingStatus=#cancelled on an existing order and return the updated
  // record. Returns null when the order does not exist. HMAC verification is
  // the mixin's responsibility.
  public func cancelOrder(state : State, orderId : Text) : ?Order {
    pruneOldOrders(state);
    switch (state.orders.get(orderId)) {
      case null { null };
      case (?o) {
        let updated : Order = {
          o with
          bookingStatus = #cancelled;
          updatedAt = Time.now();
        };
        state.orders.add(orderId, updated);
        ?updated;
      };
    };
  };

  // Đổi restaurantId của 1 đơn — khách tự phục vụ (Giai đoạn 4a), trường
  // hợp đặt tài xế đến nhầm nhà hàng (các nhà hàng cùng 1 MST, việc chuyển
  // không có rào cản pháp lý — đã xác nhận với người dùng). CHỈ cho phép
  // khi paymentStatus=#unpaid (đơn đã thanh toán/huỷ thì KHÔNG đổi được —
  // ảnh hưởng doanh thu đã ghi nhận cho đúng nhà hàng). Trả #err rõ lý do
  // thay vì null (khác cancelOrder) — frontend cần hiện đúng thông báo cho
  // khách biết TẠI SAO không đổi được (đơn không tồn tại HAY đã thanh
  // toán/huỷ, 2 lý do khác nhau).
  public func changeRestaurant(
    state : State,
    orderId : Text,
    newRestaurantId : Text,
  ) : Result.Result<Order, Text> {
    pruneOldOrders(state);
    switch (state.orders.get(orderId)) {
      case null { #err("Không tìm thấy đơn hàng") };
      case (?o) {
        if (o.paymentStatus != #unpaid) {
          return #err("Đơn đã thanh toán hoặc đã huỷ, không thể đổi nhà hàng");
        };
        let updated : Order = {
          o with
          restaurantId = newRestaurantId;
          updatedAt = Time.now();
        };
        state.orders.add(orderId, updated);
        #ok(updated);
      };
    };
  };

  // Update an existing order's QR fields (billId, qrCode, expireAt). Called by
  // the VPS worker via POST /order/:id/qr. Idempotent-friendly: it just writes
  // the given values (null clears a field). Returns null when the order does
  // not exist.
  public func updateOrderQr(state : State, orderId : Text, qrCode : ?Text, billId : ?Text, expireAt : ?Nat64) : ?Order {
    pruneOldOrders(state);
    switch (state.orders.get(orderId)) {
      case null { null };
      case (?o) {
        let updated : Order = {
          o with
          billId;
          qrCode;
          expireAt;
          updatedAt = Time.now();
        };
        state.orders.add(orderId, updated);
        ?updated;
      };
    };
  };
};

import Result "mo:core/Result";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Text "mo:core/Text";
import AccessControl "mo:caffeineai-authorization/access-control";
import CoreTypes "../types/core";
import CoreLib "../lib/core";
import DevicesLib "../lib/devices";
import Devices "../types/devices";
import HmacLib "../lib/hmac";
import HmacTypes "../types/hmac";

// Public API surface for the core domain. State is injected from main.mo.
// This mixin owns ONLY the 7 order/secret methods. Devices, menus, and
// restaurants live in their own mixins (devices-api, menu-api) — do not
// re-declare them here.
//
// `accessControlState` is the first param (following devices-api/menu-api) so
// the read endpoints can distinguish admin (full Order with PII) from
// non-admin/anonymous (Order with PII fields blanked) via
// `AccessControl.isAdmin(accessControlState, caller)`. Non-admin callers are
// NOT rejected — they still receive the orders, just without PII — so the
// customer OrderList and driver DriverPaymentScreen flows (which call via an
// anonymous agent) keep working while the PII leak is closed.
mixin (
  accessControlState : AccessControl.AccessControlState,
  state : CoreLib.State,
) {
  // --- Orders (VPS push, HMAC-verified; not public to end users) ---
  // createOrder is invoked by the VPS worker with an HMAC over
  // orderId|restaurantId|amount|goodsAmount. The HMAC payload MUST NOT change
  // when adding new parameters — tingeeQrCode and pickupCode are placed AFTER
  // sharedLink and BEFORE hmac so the existing HMAC computation is untouched.
  // On success a new Order is created with bookingStatus=#confirmed,
  // paymentStatus=#unpaid, invoiceStatus=#none, and tingeeQrCode/pickupCode
  // stored as-is.
  public shared func createOrder(
    tenantId : Text,
    orderId : Text,
    restaurantId : Text,
    cusName : Text,
    cusPhone : Text,
    cusAddress : Text,
    cusTaxCode : Text,
    receiverEmail : Text,
    items : [CoreTypes.OrderItem],
    amount : Nat,
    goodsAmount : Nat,
    shippingFee : Nat,
    taxTotal : Nat,
    ahamoveOrderId : Text,
    tingeeQrId : Text,
    sharedLink : Text,
    tingeeQrCode : Text,
    pickupCode : Text,
    kmDiscountAmount : Nat,
    voucherDiscountAmount : Nat,
    hmac : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    // Canonical HMAC payload — UNCHANGED by the tingeeQrCode/pickupCode/
    // kmDiscountAmount/voucherDiscountAmount additions (cùng nguyên tắc đã
    // áp dụng trước đó — chỉ 4 field gốc nằm trong payload, các field bổ
    // sung sau này chỉ mang tính hiển thị/theo dõi, không phải dữ liệu cần
    // bảo toàn tính toàn vẹn giao dịch qua HMAC). tenantId cũng KHÔNG nằm
    // trong payload — nó là dữ liệu định tuyến đối tác, không phải dữ liệu
    // giao dịch.
    let payload : HmacTypes.Payload = orderId # "|" # restaurantId # "|" # amount.toText() # "|" # goodsAmount.toText();
    if (not HmacLib.verifyHmac(state.secretState.vpsSecret, state.secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    if (state.orders.get(orderId) != null) {
      return #err("Order already exists");
    };
    let now : Int = Time.now();
    let order : CoreTypes.Order = {
      orderId;
      tenantId;
      restaurantId;
      cusName;
      cusPhone;
      cusAddress;
      cusTaxCode;
      receiverEmail;
      pickupCode;
      items;
      amount;
      goodsAmount;
      shippingFee;
      taxTotal;
      bookingStatus = #confirmed;
      paymentStatus = #unpaid;
      invoiceStatus = #none;
      ahamoveOrderId;
      tingeeQrId;
      sharedLink;
      tingeeQrCode;
      invoiceId = "";
      pdfUrl = "";
      paymentVerificationImage = "";
      billId = null;
      qrCode = null;
      expireAt = null;
      kmDiscountAmount;
      voucherDiscountAmount;
      createdAt = now;
      updatedAt = now;
    };
    CoreLib.createOrder(state, order);
    #ok(order);
  };

  // List all orders. Admin sees the full records WITH PII; non-admin/anonymous
  // callers get the same records with PII fields blanked (cusName, cusPhone,
  // cusAddress, cusTaxCode, receiverEmail) so the customer OrderList and driver
  // DriverPaymentScreen flows keep working without leaking customer PII.
  //
  // Enterprise gating: an accounting-role device (deviceId bound to #accounting)
  // may also list orders. Admin always passes. Any other caller (including an
  // unregistered deviceId) is treated as a non-admin/anonymous caller and gets
  // PII-blanked records.
  public shared ({ caller }) func listOrders(tenantId : Text, deviceId : Text) : async [CoreTypes.Order] {
    let raw = CoreLib.listOrders(state, tenantId);
    if (AccessControl.isAdmin(accessControlState, caller) or DevicesLib.deviceHasRole(state.devices, deviceId, tenantId, #accounting)) {
      raw;
    } else {
      raw.map(func(o : CoreTypes.Order) : CoreTypes.Order = sanitizePii(o));
    };
  };

  // Get a single order. Admin sees the full record WITH PII; non-admin/anonymous
  // callers get the record with PII fields blanked. Returns #err only if the
  // order does not exist (or belongs to another tenant). An accounting-role
  // device may also read the full record (including the payment verification
  // image) for manual reconciliation.
  public shared ({ caller }) func getOrder(tenantId : Text, orderId : Text, deviceId : Text) : async Result.Result<CoreTypes.Order, Text> {
    switch (CoreLib.getOrder(state, tenantId, orderId)) {
      case null { #err("Order not found") };
      case (?o) {
        if (AccessControl.isAdmin(accessControlState, caller) or DevicesLib.deviceHasRole(state.devices, deviceId, tenantId, #accounting)) {
          #ok(o);
        } else {
          #ok(sanitizePii(o));
        };
      };
    };
  };

  // List orders whose receiverEmail matches `email` (case-insensitive exact
  // match), for the customer-facing "Lịch sử đặt đơn" (order history) tab.
  // Uses the verified email from EmailVerificationDialog so lookup works on
  // any device — unlike /track (OrderList), which only remembers orders
  // placed from the same browser via localStorage. Same PII-blanking rule as
  // listOrders/getOrder: admin sees full records, non-admin/anonymous callers
  // get PII-blanked records (cusAddress, cusTaxCode, receiverEmail cleared).
  // An accounting-role device may also read the full records.
  public shared ({ caller }) func getOrdersByEmail(tenantId : Text, email : Text, deviceId : Text) : async [CoreTypes.Order] {
    let normalized = email.toLower();
    let raw = CoreLib.listOrders(state, tenantId).filter(
      func(o : CoreTypes.Order) : Bool = o.receiverEmail.toLower() == normalized
    );
    if (AccessControl.isAdmin(accessControlState, caller) or DevicesLib.deviceHasRole(state.devices, deviceId, tenantId, #accounting)) {
      raw;
    } else {
      raw.map(func(o : CoreTypes.Order) : CoreTypes.Order = sanitizePii(o));
    };
  };

  // Lightweight status snapshot for the frontend 5s poll. Carries no PII, so
  // no caller gating is needed beyond the existing public access. The snapshot
  // includes tingeeQrCode so OrderTracker.tsx can render the QR when unpaid.
  public shared query func getOrderStatus(
    tenantId : Text,
    orderId : Text,
  ) : async Result.Result<CoreTypes.OrderStatus, Text> {
    switch (CoreLib.getOrderStatus(state, tenantId, orderId)) {
      case null { #err("Order not found") };
      case (?s) { #ok(s) };
    };
  };

  // List pending-payment orders for a restaurant. Admin sees the full records
  // WITH PII. Non-admin/anonymous callers (the staff/driver PaymentQueue
  // device flow) get PII blanked AND pickupCode blanked — the whole point of
  // pickupCode is that the "Hàng đợi thanh toán" screen must NOT be able to
  // read it (staff must get it verbally from whoever is physically picking up
  // the order), so it is stripped server-side here, not just hidden in the UI.
  //
  // KHÔI PHỤC (đã bỏ vai trò doanh nghiệp "Hàng đợi thanh toán" — route
  // /enterprise/payment-queue + role #paymentQueue đã gỡ hoàn toàn): hàm
  // này KHÔNG còn yêu cầu deviceId/role gating nữa — /driver (qua VPS
  // worker, gọi ẩn danh, KHÔNG qua Internet Identity) là nguồn DUY NHẤT
  // gọi hàm này cho luồng thanh toán thật, bảo vệ bằng pickupCode (ở
  // routes/qr.js phía VPS) chứ không phải role thiết bị.
  public shared ({ caller }) func listPendingPaymentOrders(
    tenantId : Text,
    restaurantId : Text,
  ) : async [CoreTypes.Order] {
    let raw = CoreLib.listPendingPaymentOrders(state, tenantId, restaurantId);
    if (AccessControl.isAdmin(accessControlState, caller)) {
      raw;
    } else {
      raw.map(func(o : CoreTypes.Order) : CoreTypes.Order = hidePickupCode(sanitizePii(o)));
    };
  };

  // cancelOrder verifies HMAC over the orderId-only payload and sets
  // bookingStatus=#cancelled.
  public shared func cancelOrder(
    orderId : Text,
    hmac : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    let payload : HmacTypes.Payload = HmacLib.statusPayload(orderId, #cancelled);
    if (not HmacLib.verifyHmac(state.secretState.vpsSecret, state.secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    switch (CoreLib.cancelOrder(state, orderId)) {
      case null { #err("Order not found") };
      case (?o) { #ok(o) };
    };
  };

  // changeOrderRestaurant — khách tự đổi nhà hàng của đơn CHƯA THANH TOÁN
  // (Giai đoạn 4a, trường hợp đặt tài xế đến nhầm nhà hàng — các nhà hàng
  // cùng 1 MST nên không có rào cản pháp lý, đã xác nhận với người dùng).
  // VPS gọi qua HMAC (payload "orderId|newRestaurantId") sau khi khách tự
  // chọn nhà hàng đích trên "Theo dõi đơn" — không yêu cầu đăng nhập, cùng
  // mức tin cậy với các hành động tự phục vụ khác theo orderId (requestQr).
  public shared func changeOrderRestaurant(
    orderId : Text,
    newRestaurantId : Text,
    hmac : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    let payload : HmacTypes.Payload = orderId # "|" # newRestaurantId;
    if (not HmacLib.verifyHmac(state.secretState.vpsSecret, state.secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    CoreLib.changeRestaurant(state, orderId, newRestaurantId);
  };

  // Return a copy of `o` with the three most sensitive PII fields blanked
  // (cusAddress, cusTaxCode, receiverEmail). cusName and cusPhone are
  // intentionally preserved so drivers can identify customers at payment and
  // customers can recognise their own orders; their sensitivity is lower than
  // address / tax code / email. All non-PII fields (orderId, restaurantId,
  // status, amounts, ids, items, timestamps, tingeeQrCode, pdfUrl, …) are
  // preserved so downstream flows that only read non-PII keep working.
  func sanitizePii(o : CoreTypes.Order) : CoreTypes.Order {
    {
      o with
      cusAddress = "";
      cusTaxCode = "";
      receiverEmail = "";
    };
  };

  // Blank pickupCode specifically. NOT part of sanitizePii, because
  // listOrders/getOrder/getOrdersByEmail (the customer-facing reads) must
  // KEEP pickupCode visible — the customer needs to see and copy it. Only
  // listPendingPaymentOrders (the "Hàng đợi thanh toán" staff/driver-device
  // screen) calls this, so the code can only be learned by asking whoever is
  // physically present with the pickup, not by reading it off that screen.
  func hidePickupCode(o : CoreTypes.Order) : CoreTypes.Order {
    { o with pickupCode = "" };
  };

  // Update an existing order's QR fields (billId, qrCode, expireAt). Invoked by
  // the VPS worker (POST /order/:id/qr). Idempotent-friendly: it just writes
  // the given values. Returns #err when the order does not exist. Like the
  // other VPS mutation endpoints (createOrder, cancelOrder), it verifies an
  // HMAC over the canonical QR payload so only the VPS worker (which holds the
  // API key) can write QR state.
  public shared func updateOrderQr(
    orderId : Text,
    qrCode : ?Text,
    billId : ?Text,
    expireAt : ?Nat64,
    hmac : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    let payload : HmacTypes.Payload = HmacLib.qrPayload(orderId, qrCode, billId, expireAt);
    if (not HmacLib.verifyHmac(state.secretState.vpsSecret, state.secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    switch (CoreLib.updateOrderQr(state, orderId, qrCode, billId, expireAt)) {
      case null { #err("Order not found") };
      case (?o) { #ok(o) };
    };
  };

  // Mark an order's payment as expired. Invoked by the VPS worker when Tingee
  // get-status-dynamic-qr reports that the QR passed expire_at while still
  // unpaid. HMAC-verified over expiredPayload (orderId|expired) so only the VPS
  // worker can set paymentStatus=#expired, which lets the driver generate a new
  // QR for the order. Returns #err when the order does not exist.
  public shared func markPaymentExpired(
    orderId : Text,
    hmac : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    let payload : HmacTypes.Payload = HmacLib.expiredPayload(orderId);
    if (not HmacLib.verifyHmac(state.secretState.vpsSecret, state.secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    let now : Int = Time.now();
    HmacLib.applyExpired(state.orders, orderId, now);
  };

  // Xoá NGAY LẬP TỨC mọi đơn của ngày TRƯỚC hôm nay khỏi canister (thay vì
  // chờ đơn mới tiếp theo tự kích hoạt pruneOldOrders() — xem giải thích ở
  // lib/core.mo — "the canister only ever serves today's orders"). Trả về
  // số đơn vừa xoá. Việc 8/9: nút "Xoá các đơn hàng chưa thanh toán trước
  // ngày hiện tại" (VPS) giờ gọi thêm hàm này để đồng bộ NGAY cả 2 nơi —
  // trước đây chỉ xoá ở VPS SQLite, canister chỉ tự dọn khi CÓ ĐƠN MỚI
  // được tạo (có thể trễ nhiều giờ nếu quán chưa nhận đơn mới), khiến 2
  // nguồn dữ liệu tạm thời không khớp nhau. Xoá TOÀN BỘ đơn ngày cũ (không
  // chỉ riêng đơn chưa thanh toán) — ĐÚNG THEO THIẾT KẾ GỐC của canister
  // (chỉ giữ đơn trong ngày, VPS mới là nơi lưu lịch sử lâu dài), không
  // phải hành vi mới/khác lạ — chỉ đẩy sớm thời điểm dọn dẹp vốn dĩ sẽ xảy
  // ra tự nhiên ngay khi có đơn mới tiếp theo.
  public shared func pruneOldOrdersNow(hmac : Text) : async Result.Result<Nat, Text> {
    if (not HmacLib.verifyHmac(state.secretState.vpsSecret, state.secretState.vpsSecretPrevious, "prune-old-orders", hmac)) {
      return #err("Invalid HMAC");
    };
    let before = state.orders.toArray().size();
    CoreLib.pruneOldOrders(state);
    #ok(before - state.orders.toArray().size());
  };

  // --- Enterprise device-gated mutations ---
  //
  // The existing mutation endpoints (updatePaymentStatus/updateInvoiceStatus/
  // cancelOrder/pruneOldOrdersNow) are HMAC-verified VPS endpoints that a
  // device cannot call (a device cannot produce a valid HMAC). These NEW
  // endpoints let the enterprise device roles perform their manual operations,
  // gated by the caller's device role instead of HMAC. The existing HMAC
  // endpoints are left unchanged for the VPS.
  //
  // XOÁ (đã bỏ vai trò doanh nghiệp "Hàng đợi thanh toán" theo yêu cầu — xem
  // listPendingPaymentOrders ở trên): confirmPaymentByDevice(deviceId, orderId)
  // — hàm này KHÔNG CÓ BẤT KỲ đối chiếu nào (không QR, không webhook Tingee,
  // không xác nhận ảnh) trước khi đánh dấu 1 đơn là #paid — chỉ dựa vào nhân
  // viên tự bấm xác nhận. Đây là lỗ hổng tài chính thật (nhân viên có thể tự
  // đánh dấu bất kỳ đơn nào "đã thanh toán" mà khách chưa hề chuyển khoản) —
  // xoá hẳn khỏi canister, không chỉ ẩn giao diện, để không ai còn gọi được
  // qua API dù không còn route UI nào dẫn tới nó.

  // Accounting role: manually clean up (cancel) an order. Gated to a
  // #accounting device (or admin). Delegates to the same cancel logic the VPS
  // endpoint uses.
  public shared ({ caller }) func cleanupOrderByDevice(
    tenantId : Text,
    deviceId : Text,
    orderId : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller) and not DevicesLib.deviceHasRole(state.devices, deviceId, tenantId, #accounting)) {
      return #err("Accounting role required");
    };
    switch (CoreLib.getOrder(state, tenantId, orderId)) {
      case null { #err("Order not found") };
      case (?_) {
        switch (CoreLib.cancelOrder(state, orderId)) {
          case null { #err("Order not found") };
          case (?o) { #ok(o) };
        };
      };
    };
  };

  // Accounting role: manually issue an e-invoice for an order. Gated to a
  // #accounting device (or admin). Delegates to the same invoice-apply logic
  // the VPS endpoint uses, writing invoiceStatus=#invoiced plus the invoiceId
  // and pdfUrl supplied by the accounting device.
  public shared ({ caller }) func issueInvoiceByDevice(
    tenantId : Text,
    deviceId : Text,
    orderId : Text,
    invoiceId : Text,
    pdfUrl : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller) and not DevicesLib.deviceHasRole(state.devices, deviceId, tenantId, #accounting)) {
      return #err("Accounting role required");
    };
    switch (CoreLib.getOrder(state, tenantId, orderId)) {
      case null { #err("Order not found") };
      case (?_) {
        HmacLib.applyInvoiceStatus(state.orders, orderId, #invoiced, invoiceId, pdfUrl, Time.now());
      };
    };
  };

  // Ghi nhận đơn tại quầy cho email của khách — khách tự quét QR "Ghi nhận"
  // trên thẻ đơn (CounterQRDisplay.tsx) bằng điện thoại RIÊNG của họ, mở
  // trang /claim/:orderId, gọi hàm này qua VPS (routes/claim-order-email.js
  // mới, VPS đồng thời cập nhật orders.receiver_email ở SQLite — cần cho
  // routes/sales-bonus-cron.js tính doanh số "Khách hàng thân thiết").
  //
  // KHÔNG dùng HMAC — đây là hành động từ THIẾT BỊ KHÁCH, không phải VPS
  // nội bộ (secret HMAC không thể an toàn nếu đưa cho client). An toàn
  // được đảm bảo bằng nguyên tắc CHỈ CHO GHI 1 LẦN DUY NHẤT: từ chối nếu
  // đơn đã có receiverEmail (khác rỗng) — chặn việc ai đó biết mã đơn
  // người khác rồi ghi đè liên tục.
  public shared func claimOrderEmail(
    tenantId : Text,
    orderId : Text,
    email : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    switch (state.orders.get(orderId)) {
      case null { #err("Không tìm thấy đơn") };
      case (?order) {
        if (order.tenantId != tenantId) {
          return #err("Không tìm thấy đơn");
        };
        if (order.receiverEmail != "") {
          return #err("Đơn này đã được ghi nhận cho 1 email trước đó");
        };
        let updated : CoreTypes.Order = {
          order with
          receiverEmail = email;
          updatedAt = Time.now();
        };
        state.orders.add(orderId, updated);
        #ok(updated);
      };
    };
  };
};

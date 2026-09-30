// Public API surface for HMAC-verified order status updates from the VPS.
//
// Every endpoint here is an `update` (it mutates order state) and verifies the
// caller-supplied HMAC against the canonical payload before delegating to
// `lib/hmac`. The canister performs 0 HTTP outcalls — the VPS is the only
// external actor and must sign each request with the shared secret.
//
// State is injected: `orders` (the core order store) and `secretState` (the
// mutable-by-reference SecretState owned by main.mo). Reading
// `secretState.vpsSecret` / `secretState.vpsSecretPrevious` here always sees
// the CURRENT secret pair, even after `setVpsSecret` rotates them — this fixes
// the stale-snapshot rotation bug (previously the mixin captured the raw
// stable vars at `include` time, so HMAC verification used a frozen secret).

import Result "mo:core/Result";
import Time "mo:core/Time";

import Types "../types/hmac";
import CoreTypes "../types/core";
import SecretTypes "../types/secret";
import HmacLib "../lib/hmac";

mixin (
  orders : CoreTypes.OrderStore,
  secretState : SecretTypes.SecretState,
) {
  // Verify HMAC (payload = orderId|<BookingStatus variant name>); on success
  // update bookingStatus + updatedAt = Time.now() and return the order.
  public shared func updateStatus(
    orderId : CoreTypes.OrderId,
    bookingStatus : CoreTypes.BookingStatus,
    hmac : Types.Hmac,
  ) : async Result.Result<CoreTypes.Order, Text> {
    let payload = HmacLib.statusPayload(orderId, bookingStatus);
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    HmacLib.applyStatus(orders, orderId, bookingStatus, Time.now());
  };

  // Verify HMAC (payload = orderId|<PaymentStatus variant name>); on success
  // update paymentStatus + updatedAt and return the order.
  public shared func updatePaymentStatus(
    orderId : CoreTypes.OrderId,
    paymentStatus : CoreTypes.PaymentStatus,
    hmac : Types.Hmac,
  ) : async Result.Result<CoreTypes.Order, Text> {
    let payload = HmacLib.paymentPayload(orderId, paymentStatus);
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    HmacLib.applyPaymentStatus(orders, orderId, paymentStatus, Time.now());
  };

  // Verify HMAC (payload = orderId|<InvoiceStatus variant name>|invoiceId|pdfUrl);
  // on success update invoiceStatus + invoiceId + pdfUrl + updatedAt and return
  // the order. pdfUrl là URL file PDF hoá đơn điện tử do VPS lấy qua mã lệnh
  // 818 và đẩy ngược về canister.
  public shared func updateInvoiceStatus(
    orderId : CoreTypes.OrderId,
    invoiceStatus : CoreTypes.InvoiceStatus,
    invoiceId : Text,
    pdfUrl : Text,
    hmac : Types.Hmac,
  ) : async Result.Result<CoreTypes.Order, Text> {
    let payload = HmacLib.invoicePayload(orderId, invoiceStatus, invoiceId, pdfUrl);
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    HmacLib.applyInvoiceStatus(orders, orderId, invoiceStatus, invoiceId, pdfUrl, Time.now());
  };
};

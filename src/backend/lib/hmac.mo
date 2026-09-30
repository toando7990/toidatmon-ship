// HMAC-SHA256 verification of VPS-originated status updates.
//
// The canister is the source of truth and performs 0 HTTP outcalls. The VPS
// computes HMAC-SHA256 over each status-update payload using a shared secret
// and the canister verifies it before mutating any order state. Two secrets
// are accepted concurrently (vpsSecret + vpsSecretPrevious) to support a
// rotation window.
//
// This module is stateless: it receives the secret(s), payload, and order
// store as parameters and never owns their lifecycle.

import Sha256 "mo:sha2/Sha256";
import Array "mo:core/Array";
import Map "mo:core/Map";
import Result "mo:core/Result";
import Nat64 "mo:core/Nat64";
import CoreTypes "../types/core";
import HmacTypes "../types/hmac";

module {
  // Block size for SHA-256 (bytes). Secrets longer than this are hashed first;
  // shorter secrets are zero-padded.
  private let blockSize : Nat = 64;

  // Hex digit table for lowercase hex encoding of the digest bytes.
  private let hexDigits : [Text] = [
    "0", "1", "2", "3", "4", "5", "6", "7",
    "8", "9", "a", "b", "c", "d", "e", "f",
  ];

  // Encode a single Nat8 byte as two lowercase hex characters.
  private func byteToHex(b : Nat8) : Text {
    let high = Nat8.toNat(b) / 16;
    let low = Nat8.toNat(b) % 16;
    hexDigits[high] # hexDigits[low];
  };

  // Encode a Blob as a lowercase hex string (64 chars for a 32-byte digest).
  private func blobToHex(b : Blob) : Text {
    let bytes = b.toArray();
    bytes.map(byteToHex).foldLeft("", func(acc : Text, h : Text) : Text { acc # h });
  };

  // Build the HMAC key block: if the secret is longer than blockSize, hash it
  // first; then zero-pad (or truncate) to exactly blockSize bytes.
  private func keyBlock(secret : HmacTypes.Secret) : [Nat8] {
    let secretBytes = secret.encodeUtf8().toArray();
    let hashed : [Nat8] = if (secretBytes.size() > blockSize) {
      Sha256.fromBlob(#sha256, secretBytes.toBlob()).toArray();
    } else {
      secretBytes;
    };
    Array.tabulate(blockSize, func(i : Nat) : Nat8 {
      if (i < hashed.size()) { hashed[i] } else { 0 : Nat8 };
    });
  };

  // XOR every byte of `block` with the single byte `mask` and return a new
  // [Nat8] array of the same length.
  private func xorBlock(block : [Nat8], mask : Nat8) : [Nat8] {
    block.map(func(b : Nat8) : Nat8 { Nat8.bitxor(b, mask) });
  };

  // Compute HMAC-SHA256(secret, payload) and return the digest as a lowercase
  // hex string (64 chars).
  public func hmacSha256(secret : HmacTypes.Secret, payload : HmacTypes.Payload) : HmacTypes.Hmac {
    let key = keyBlock(secret);
    let ipad = xorBlock(key, 0x36 : Nat8);
    let opad = xorBlock(key, 0x5c : Nat8);
    let payloadBytes = payload.encodeUtf8().toArray();
    let innerInput = ipad.concat(payloadBytes);
    let inner = Sha256.fromBlob(#sha256, innerInput.toBlob());
    let outerInput = opad.concat(inner.toArray());
    let outer = Sha256.fromBlob(#sha256, outerInput.toBlob());
    blobToHex(outer);
  };

  // Constant-time comparison of two hex digests. We compare the UTF-8 byte
  // arrays byte-by-byte, accumulating XOR without short-circuiting, so the
  // running time does not leak the position of the first mismatch. Lengths
  // are checked first (different lengths => false) because the byte loop
  // assumes equal length. The VPS must produce the identical canonical form.
  public func digestEqual(a : HmacTypes.Hmac, b : HmacTypes.Hmac) : Bool {
    let aBytes = a.encodeUtf8().toArray();
    let bBytes = b.encodeUtf8().toArray();
    if (aBytes.size() != bBytes.size()) {
      false;
    } else {
      var diff : Nat8 = 0;
      for (i in aBytes.keys()) {
        diff := Nat8.bitxor(diff, Nat8.bitxor(aBytes[i], bBytes[i]));
      };
      diff == 0;
    };
  };

  // Verify an HMAC against the current secret, falling back to the previous
  // secret during a rotation window. Returns true iff either secret reproduces
  // the supplied digest over the same payload.
  public func verifyHmac(
    vpsSecret : HmacTypes.Secret,
    vpsSecretPrevious : HmacTypes.Secret,
    payload : HmacTypes.Payload,
    hmac : HmacTypes.Hmac,
  ) : Bool {
    if (digestEqual(hmacSha256(vpsSecret, payload), hmac)) {
      true;
    } else {
      digestEqual(hmacSha256(vpsSecretPrevious, payload), hmac);
    };
  };

  // Canonical payload for an order booking-status update:
  //   orderId | <BookingStatus variant name>
  public func statusPayload(orderId : CoreTypes.OrderId, bookingStatus : CoreTypes.BookingStatus) : HmacTypes.Payload {
    let statusText = switch (bookingStatus) {
      case (#pending) "pending";
      case (#confirmed) "confirmed";
      case (#shipping) "shipping";
      case (#pickedUp) "pickedUp";
      case (#completed) "completed";
      case (#cancelled) "cancelled";
    };
    orderId # "|" # statusText;
  };

  // Canonical payload for an order payment-status update:
  //   orderId | <PaymentStatus variant name>
  public func paymentPayload(orderId : CoreTypes.OrderId, paymentStatus : CoreTypes.PaymentStatus) : HmacTypes.Payload {
    let statusText = switch (paymentStatus) {
      case (#unpaid) "unpaid";
      case (#paid) "paid";
      case (#refunded) "refunded";
      case (#expired) "expired";
    };
    orderId # "|" # statusText;
  };

  // Canonical payload for an order invoice-status update:
  //   orderId | <InvoiceStatus variant name> | invoiceId | pdfUrl
  // (pdfUrl được thêm vào HMAC payload để VPS ký cả URL file PDF khi đẩy
  // ngược về canister qua mã lệnh 818.)
  public func invoicePayload(
    orderId : CoreTypes.OrderId,
    invoiceStatus : CoreTypes.InvoiceStatus,
    invoiceId : Text,
    pdfUrl : Text,
  ) : HmacTypes.Payload {
    let statusText = switch (invoiceStatus) {
      case (#none) "none";
      case (#invoiced) "invoiced";
      case (#failed) "failed";
    };
    orderId # "|" # statusText # "|" # invoiceId # "|" # pdfUrl;
  };

  // Canonical payload for an order QR update (POST /order/:id/qr):
  //   orderId | qrCode | billId | expireAt
  // Optional values are encoded as the empty string when null so the payload
  // is deterministic regardless of which QR fields the VPS worker sends.
  public func qrPayload(
    orderId : CoreTypes.OrderId,
    qrCode : ?Text,
    billId : ?Text,
    expireAt : ?Nat64,
  ) : HmacTypes.Payload {
    let qr = switch (qrCode) { case (?v) v; case null "" };
    let bill = switch (billId) { case (?v) v; case null "" };
    let exp = switch (expireAt) { case (?v) v.toText(); case null "" };
    orderId # "|" # qr # "|" # bill # "|" # exp;
  };

  // Apply a booking-status update to an order in the store. Returns the
  // updated order, or #err if the order id is unknown. The order record is
  // immutable, so we use record spread and Map.add to overwrite.
  public func applyStatus(
    orders : CoreTypes.OrderStore,
    orderId : CoreTypes.OrderId,
    bookingStatus : CoreTypes.BookingStatus,
    now : Int,
  ) : Result.Result<CoreTypes.Order, Text> {
    switch (orders.get(orderId)) {
      case null { #err("Order not found") };
      case (?order) {
        let updated : CoreTypes.Order = { order with bookingStatus; updatedAt = now };
        orders.add(orderId, updated);
        #ok(updated);
      };
    };
  };

  // Apply a payment-status update to an order in the store.
  //
  // Khi Tingee xác nhận đơn đã thanh toán (#paid) và đơn đang ở trạng thái
  // #confirmed, đơn TỰ ĐỘNG chuyển sang #pickedUp (Tài xế đã nhận hàng) — bước
  // kết thúc hoàn toàn của đơn. Tab 'Hàng đợi tài xế nhận hàng' (với nút
  // markPickedUp thủ công) đã bị bỏ, nên việc chuyển trạng thái phải xảy ra tự
  // động khi thanh toán được xác nhận thay vì tài xế bấm nút. Giữ nguyên guard
  // #confirmed giống markPickedUp (lib/payment-mode-config.mo) để không chuyển
  // trạng thái khi đơn chưa được xác nhận.
  public func applyPaymentStatus(
    orders : CoreTypes.OrderStore,
    orderId : CoreTypes.OrderId,
    paymentStatus : CoreTypes.PaymentStatus,
    now : Int,
  ) : Result.Result<CoreTypes.Order, Text> {
    switch (orders.get(orderId)) {
      case null { #err("Order not found") };
      case (?order) {
        let bookingStatus = if (paymentStatus == #paid and order.bookingStatus == #confirmed) {
          #pickedUp;
        } else {
          order.bookingStatus;
        };
        let updated : CoreTypes.Order = {
          order with
          paymentStatus;
          bookingStatus;
          updatedAt = now;
        };
        orders.add(orderId, updated);
        #ok(updated);
      };
    };
  };

  // Apply an invoice-status update (with invoiceId + pdfUrl) to an order in
  // the store. Ghi cả pdfUrl vào Order khi apply mutation. Order là record
  // bất biến nên dùng record spread + Map.add để ghi đè.
  public func applyInvoiceStatus(
    orders : CoreTypes.OrderStore,
    orderId : CoreTypes.OrderId,
    invoiceStatus : CoreTypes.InvoiceStatus,
    invoiceId : Text,
    pdfUrl : Text,
    now : Int,
  ) : Result.Result<CoreTypes.Order, Text> {
    switch (orders.get(orderId)) {
      case null { #err("Order not found") };
      case (?order) {
        let updated : CoreTypes.Order = {
          order with
          invoiceStatus;
          invoiceId;
          pdfUrl;
          updatedAt = now;
        };
        orders.add(orderId, updated);
        #ok(updated);
      };
    };
  };

  // Canonical payload for an order payment-expiry update:
  //   orderId | expired
  // The VPS worker signs this when Tingee get-status-dynamic-qr reports that
  // the QR passed expire_at while still unpaid, so the canister can set
  // paymentStatus=#expired and let the driver generate a new QR.
  public func expiredPayload(orderId : CoreTypes.OrderId) : HmacTypes.Payload {
    orderId # "|" # "expired";
  };

  // Apply a payment-expiry update to an order in the store. Sets
  // paymentStatus=#expired (QR hết hạn chưa thanh toán) so the driver can
  // generate a new QR. Returns the updated order, or #err if the order id is
  // unknown. HMAC verification is the mixin's responsibility.
  public func applyExpired(
    orders : CoreTypes.OrderStore,
    orderId : CoreTypes.OrderId,
    now : Int,
  ) : Result.Result<CoreTypes.Order, Text> {
    switch (orders.get(orderId)) {
      case null { #err("Order not found") };
      case (?order) {
        let updated : CoreTypes.Order = {
          order with
          paymentStatus = #expired;
          updatedAt = now;
        };
        orders.add(orderId, updated);
        #ok(updated);
      };
    };
  };
};

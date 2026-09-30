// Domain types for HMAC verification of VPS-originated status updates.
//
// The canister is the source of truth and performs 0 HTTP outcalls. The VPS
// computes HMAC-SHA256 over each status-update payload using a shared secret
// and the canister verifies it before mutating any order state. Two secrets
// are accepted concurrently (vpsSecret + vpsSecretPrevious) to support a
// rotation window.
//
// Cross-cutting types (OrderId, Timestamp, BookingStatus, PaymentStatus,
// InvoiceStatus, Order) are owned by the `core` domain and imported from
// `types/core`. This file declares only the HMAC-domain-local types.

import CoreTypes "core";

module {
  // Re-export OrderId for HMAC-domain consumers that build canonical payloads
  // keyed by order.
  public type OrderId = CoreTypes.OrderId;

  // Hex-encoded HMAC-SHA256 digest (64 lowercase hex chars) as produced by the
  // VPS over the canonical payload string.
  public type Hmac = Text;

  // Canonical payload segments joined with `|`. The HMAC domain builds these
  // strings from the public update-function arguments; the VPS must produce the
  // identical canonical form before hashing.
  //   updateStatus        : orderId | <BookingStatus variant name>
  //   updatePaymentStatus : orderId | <PaymentStatus variant name>
  //   updateInvoiceStatus : orderId | <InvoiceStatus variant name> | invoiceId | pdfUrl
  public type Payload = Text;

  // Shared secret material. Stored as Text (hex or raw) by the core domain in
  // stable vars `vpsSecret` and `vpsSecretPrevious`; the HMAC domain receives
  // them as parameters and never owns their lifecycle.
  public type Secret = Text;
};

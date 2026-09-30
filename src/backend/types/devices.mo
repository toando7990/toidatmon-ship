import CoreTypes "core";

// Device-domain types.
//
// Canonical device types (DeviceRole, Device, PendingActivation) are owned by
// the `core` domain and imported from `types/core`. This file re-exports them
// so device-domain consumers can import a single `Devices` module, and may
// declare device-domain-local types if needed.
//
// CONTRACT (enterprise roles): `DeviceRole` is extended with 3 enterprise
// roles — #paymentQueue (hàng đợi thanh toán), #accounting (kế toán),
// #salesPromoReporting (báo cáo bán hàng và KM) — in addition to the existing
// #admin / #driver / #cashier. The canonical variant lives in `types/core.mo`;
// this module re-exports it so device-domain consumers see the extended set.
module {
  public type DeviceRole = CoreTypes.DeviceRole;
  public type Device = CoreTypes.Device;
  public type PendingActivation = CoreTypes.PendingActivation;

  // Enterprise device roles (subset of DeviceRole). Used by role-gating
  // helpers to decide which business APIs an enterprise device may call.
  public type EnterpriseRole = {
    #paymentQueue;
    #accounting;
    #salesPromoReporting;
  };
};

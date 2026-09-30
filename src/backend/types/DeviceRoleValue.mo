import OQL "mo:caffeineai-oql";
import CoreTypes "core";

module {
  // Variant → single #text Value so the `role` column stays queryable.
  public func _toRow(self : CoreTypes.DeviceRole) : OQL.Value {
    #text(
      switch self {
        case (#admin) "admin";
        case (#driver) "driver";
        case (#cashier) "cashier";
        case (#paymentQueue) "paymentQueue";
        case (#accounting) "accounting";
        case (#salesPromoReporting) "salesPromoReporting";
        case (#tenantAdmin) "tenantAdmin";
      }
    );
  };
};

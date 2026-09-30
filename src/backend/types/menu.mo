import CoreTypes "core";

// Menu-domain types.
//
// Canonical menu types (MenuItem, Restaurant) are owned by the `core` domain
// and imported from `types/core`. This file re-exports them so menu-domain
// consumers can import a single `Menu` module.
module {
  public type MenuItem = CoreTypes.MenuItem;
  public type Restaurant = CoreTypes.Restaurant;
};

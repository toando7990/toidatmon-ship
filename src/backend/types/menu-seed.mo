import CoreTypes "core";

// Menu-seed domain types.
//
// The canonical MenuItem type is owned by the `core` domain and imported from
// `types/core`. This file re-exports it so menu-seed consumers import a single
// module, and declares the constants that define the seeded 'Dụng cụ đựng đồ
// ăn' item.
module {
  public type MenuItem = CoreTypes.MenuItem;

  // Identity of the seeded 'Dụng cụ đựng đồ ăn' item. The seed is idempotent:
  // it only adds the item when no existing item matches name + category, so it
  // never duplicates the item across repeated runs (init/upgrade/manual).
  public let SEED_ITEM_ID : Text = "dung-cu-dung-do-an";
  public let SEED_ITEM_NAME : Text = "Dụng cụ đựng đồ ăn";
  public let SEED_ITEM_CATEGORY : Text = "Khác";
  // Đơn giá riêng (VND) để VPS lấy được khi tính tiền qua getMenuForRestaurant.
  public let SEED_ITEM_PRICE : Nat = 5000;
  public let SEED_ITEM_UNIT : Text = "bộ";
  // VAT rate consistent with the frontend default (8%) used by other menu items.
  public let SEED_ITEM_VAT_RATE : Nat = 8;
};

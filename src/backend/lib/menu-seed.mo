import Map "mo:core/Map";

import Types "../types/menu-seed";

// Domain logic for the menu-seed domain.
// State (menus) is injected by the caller; this module exposes a pure,
// idempotent seed function that operates on the injected store.
module {
  public type Menus = Map.Map<Text, Types.MenuItem>;

  // Idempotent seed: ensure the 'Dụng cụ đựng đồ ăn' item exists in the 'Khác'
  // category FOR 1 ĐỐI TÁC. If an item with this name + category already exists
  // for that tenant, do nothing (no duplicate). Otherwise add it with the
  // configured defaults so the VPS can fetch its unit price when computing
  // quotes. Returns true when the item was added, false when it already
  // existed.
  //
  // The seeded item's itemId is prefixed with the tenantId so two partners can
  // each own their own copy of the seed item without colliding in the shared
  // menus map (keyed by itemId).
  public func seedMenuItems(menus : Menus, tenantId : Text) : Bool {
    let exists = menus.toArray().any(func((_id : Text, i : Types.MenuItem)) : Bool {
      i.tenantId == tenantId and i.name == Types.SEED_ITEM_NAME and i.category == Types.SEED_ITEM_CATEGORY
    });
    if (exists) {
      return false;
    };
    let itemId = tenantId # "-" # Types.SEED_ITEM_ID;
    menus.add(itemId, {
      itemId;
      tenantId;
      name = Types.SEED_ITEM_NAME;
      price = Types.SEED_ITEM_PRICE;
      unitName = Types.SEED_ITEM_UNIT;
      vatRate = Types.SEED_ITEM_VAT_RATE;
      category = Types.SEED_ITEM_CATEGORY;
      image = ("" : Blob);
      visible = true;
    });
    true;
  };
};

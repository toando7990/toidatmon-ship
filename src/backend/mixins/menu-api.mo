import AccessControl "mo:caffeineai-authorization/access-control";
import Map "mo:core/Map";
import Result "mo:core/Result";
import Principal "mo:core/Principal";

import MenuLib "../lib/menu";
import CoreTypes "../types/core";
import Common "../types/common";
import DevicesLib "../lib/devices";
import TenantTypes "../types/tenant";
import TenantLib "../lib/tenant";

// Public API surface for the menu domain.
// State slices (menus, restaurants, restaurantMenuOverrides, accessControlState,
// tenants, devices) are injected from main.mo. Write endpoints are gated to the
// central admin OR a #tenantAdmin device of the SAME tenant; storefront reads
// (listMenus, getMenu, getItemImage, listRestaurants, getRestaurants,
// getMenuForRestaurant) stay public and take an explicit tenantId so each
// partner only ever sees its own menu/restaurants.
import DeviceAuthTypes "../types/device-auth";
mixin (
  accessControlState : AccessControl.AccessControlState,
  tenants : TenantTypes.TenantStore,
  devices : DevicesLib.DevicesStore,
  deviceAuth : DeviceAuthTypes.DeviceAuthState,
  menus : Map.Map<Text, CoreTypes.MenuItem>,
  restaurants : Map.Map<Text, CoreTypes.Restaurant>,
  overrides : Map.Map<Text, Map.Map<Text, Nat>>,
  menuOrder : Map.Map<Text, [Text]>,
) {
  // True when the caller may edit the menu/restaurants of `tenantId`: the
  // central admin always may; otherwise the caller must present a deviceId
  // bound to the #tenantAdmin role of that SAME tenant.
  func canManageTenantMenu(caller : Principal, tenantId : Common.TenantId, deviceId : Common.DeviceId) : Bool {
    AccessControl.isAdmin(accessControlState, caller) or DevicesLib.deviceIsTenantAdmin(devices, deviceAuth, deviceId, tenantId);
  };

  // Admin/tenant-admin only. Create a new MenuItem with visible=true. Returns
  // the created item. `image` carries the dish image bytes (Blob) directly into
  // canister state, replacing the previous VPS-hosted imageUrl string.
  public shared ({ caller }) func addItem(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    image : Blob,
  ) : async Result.Result<CoreTypes.MenuItem, Text> {
    if (not canManageTenantMenu(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    if (not TenantLib.isActiveTenant(tenants, tenantId)) {
      return #err("Đối tác không tồn tại hoặc đã ngừng hoạt động");
    };
    MenuLib.addItem(menus, tenantId, itemId, name, price, unitName, vatRate, category, image);
  };

  // Admin/tenant-admin only. Update an existing MenuItem (including
  // visibility). Returns the updated item. `image` carries the dish image bytes
  // (Blob) directly into canister state, replacing the previous VPS-hosted
  // imageUrl string.
  public shared ({ caller }) func updateItem(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    image : Blob,
    visible : Bool,
  ) : async Result.Result<CoreTypes.MenuItem, Text> {
    if (not canManageTenantMenu(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    MenuLib.updateItem(menus, tenantId, itemId, name, price, unitName, vatRate, category, image, visible);
  };

  // Admin/tenant-admin only. Bật/tắt hiển thị món — CHỈ đổi field visible,
  // KHÔNG đụng tới ảnh hay các field khác. Tách riêng khỏi updateItem để UI
  // bật/tắt hiển thị (MenuItemTable.tsx) không cần tải lại ảnh gốc trước rồi
  // gửi lại — tránh rủi ro vô tình gửi ảnh rỗng đè lên ảnh thật.
  public shared ({ caller }) func setItemVisible(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    itemId : Text,
    visible : Bool,
  ) : async Result.Result<CoreTypes.MenuItem, Text> {
    if (not canManageTenantMenu(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    MenuLib.setItemVisible(menus, tenantId, itemId, visible);
  };

  // Admin/tenant-admin only. Delete a MenuItem. Returns success.
  public shared ({ caller }) func deleteItem(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    itemId : Text,
  ) : async Result.Result<(), Text> {
    if (not canManageTenantMenu(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    MenuLib.deleteItem(menus, tenantId, itemId);
  };

  // Return all menu items (visible + hidden) for admin CỦA 1 ĐỐI TÁC. Ảnh luôn
  // rỗng — lấy riêng qua getItemImage(itemId) để tránh vượt giới hạn kích
  // thước phản hồi IC (3MB) khi catalogue có nhiều món/ảnh.
  public query func listMenus(tenantId : Common.TenantId) : async [CoreTypes.MenuItem] {
    MenuLib.sortByOrder(MenuLib.listMenus(menus, tenantId), menuOrder.get(tenantId));
  };

  // Return only visible menu items for frontend customers CỦA 1 ĐỐI TÁC. Ảnh
  // luôn rỗng — lấy riêng qua getItemImage(itemId).
  public query func getMenu(tenantId : Common.TenantId) : async [CoreTypes.MenuItem] {
    MenuLib.sortByOrder(MenuLib.getMenu(menus, tenantId), menuOrder.get(tenantId));
  };

  // Trả về ảnh (Blob) của ĐÚNG 1 món theo itemId. Public — khách hàng browse
  // menu cũng cần gọi được, không chỉ admin. Mỗi lần gọi chỉ 1 ảnh, không bao
  // giờ vượt giới hạn kích thước phản hồi IC dù catalogue phình to.
  public query func getItemImage(itemId : Text) : async ?Blob {
    MenuLib.getItemImage(menus, itemId);
  };

  // Admin/tenant-admin only. Create a new Restaurant with visible=true. Returns
  // the created restaurant.
  public shared ({ caller }) func addRestaurant(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    restaurantId : Text,
    name : Text,
    address : Text,
    phone : Text,
    lat : Float,
    lng : Float,
  ) : async Result.Result<CoreTypes.Restaurant, Text> {
    if (not canManageTenantMenu(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    if (not TenantLib.isActiveTenant(tenants, tenantId)) {
      return #err("Đối tác không tồn tại hoặc đã ngừng hoạt động");
    };
    MenuLib.addRestaurant(restaurants, tenantId, restaurantId, name, address, phone, lat, lng);
  };

  // Admin/tenant-admin only. Update an existing Restaurant (including
  // visibility). Returns the updated restaurant.
  public shared ({ caller }) func updateRestaurant(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    restaurantId : Text,
    name : Text,
    address : Text,
    phone : Text,
    visible : Bool,
    lat : Float,
    lng : Float,
  ) : async Result.Result<CoreTypes.Restaurant, Text> {
    if (not canManageTenantMenu(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    MenuLib.updateRestaurant(restaurants, tenantId, restaurantId, name, address, phone, visible, lat, lng);
  };

  // Admin/tenant-admin only. Delete a Restaurant and its related price
  // overrides. Returns success.
  public shared ({ caller }) func deleteRestaurant(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    restaurantId : Text,
  ) : async Result.Result<(), Text> {
    if (not canManageTenantMenu(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    MenuLib.deleteRestaurant(restaurants, overrides, tenantId, restaurantId);
  };

  // Return all restaurants (visible + hidden) for admin CỦA 1 ĐỐI TÁC.
  public query func listRestaurants(tenantId : Common.TenantId) : async [CoreTypes.Restaurant] {
    MenuLib.listRestaurants(restaurants, tenantId);
  };

  // Return only visible restaurants for frontend customers CỦA 1 ĐỐI TÁC.
  public query func getRestaurants(tenantId : Common.TenantId) : async [CoreTypes.Restaurant] {
    MenuLib.getRestaurants(restaurants, tenantId);
  };

  // Admin/tenant-admin only. Set a price override for a (restaurantId, itemId)
  // pair. Returns success.
  public shared ({ caller }) func setRestaurantPriceOverride(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    restaurantId : Text,
    itemId : Text,
    price : Nat,
  ) : async Result.Result<(), Text> {
    if (not canManageTenantMenu(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    MenuLib.setRestaurantPriceOverride(overrides, restaurantId, itemId, price);
  };

  // Return visible menu items with price overrides applied for a specific
  // restaurant CỦA 1 ĐỐI TÁC. Ảnh luôn rỗng — lấy riêng qua getItemImage(itemId).
  public query func getMenuForRestaurant(
    tenantId : Common.TenantId,
    restaurantId : Text,
  ) : async [CoreTypes.MenuItem] {
    MenuLib.sortByOrder(MenuLib.getMenuForRestaurant(menus, overrides, tenantId, restaurantId), menuOrder.get(tenantId));
  };
};

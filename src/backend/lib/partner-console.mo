import Map "mo:core/Map";
import Time "mo:core/Time";

import Common "../types/common";
import DevicesLib "devices";
import DeviceAuth "device-auth";
import DeviceAuthTypes "../types/device-auth";
import Types "../types/partner-console";

module {
  public type PartnerSettings = Types.PartnerSettings;

  func UTC7_OFFSET_NS() : Int { 7 * 3600 * 1_000_000_000 };
  func DAY_NS() : Int { 24 * 3600 * 1_000_000_000 };

  /// Số ngày (giờ VN) kể từ epoch — dùng làm khoá ngày cho "Hết hôm nay".
  public func vnDay(now : Int) : Nat {
    ((now + UTC7_OFFSET_NS()) / DAY_NS()).toNat();
  };

  /// Chủ quán (#tenantAdmin) của đúng đối tác.
  public func isOwner(devices : DevicesLib.DevicesStore, auth : DeviceAuthTypes.DeviceAuthState, credential : Text, tenantId : Common.TenantId) : Bool {
    DevicesLib.deviceIsTenantAdmin(devices, auth, credential, tenantId);
  };

  /// Chủ quán hoặc Nhân viên (#cashier) đang hoạt động của đúng đối tác.
  public func isOwnerOrStaff(devices : DevicesLib.DevicesStore, auth : DeviceAuthTypes.DeviceAuthState, credential : Text, tenantId : Common.TenantId) : Bool {
    let ?deviceId = DeviceAuth.resolve(auth, credential) else return false;
    switch (devices.get(deviceId)) {
      case null { false };
      case (?d) {
        d.active and d.tenantId == tenantId and (d.role == #tenantAdmin or d.role == #cashier);
      };
    };
  };

  public func getSettings(store : Types.SettingsStore, tenantId : Common.TenantId) : PartnerSettings {
    switch (store.get(tenantId)) {
      case (?s) { s };
      case null { Types.defaultSettings };
    };
  };

  public func update(
    store : Types.SettingsStore,
    tenantId : Common.TenantId,
    f : PartnerSettings -> PartnerSettings,
  ) : PartnerSettings {
    let next = { f(getSettings(store, tenantId)) with updatedAt = Time.now().toNat() };
    store.add(tenantId, next);
    next;
  };

  public func isPaused(store : Types.SettingsStore, tenantId : Common.TenantId) : Bool {
    getSettings(store, tenantId).paused;
  };

  func key(tenantId : Text, id : Text) : Text { tenantId # "|" # id };

  public func setSoldOut(store : Types.SoldOutStore, tenantId : Text, itemId : Text, soldOut : Bool) {
    if (soldOut) {
      store.add(key(tenantId, itemId), vnDay(Time.now()));
    } else {
      store.remove(key(tenantId, itemId));
    };
  };

  /// Hết món tại 1 nhà hàng: key "tenantId|itemId|restaurantId".
  /// restaurantId "" = hết ở MỌI nhà hàng (key cũ "tenantId|itemId").
  public func setSoldOutAt(store : Types.SoldOutStore, tenantId : Text, itemId : Text, restaurantId : Text, soldOut : Bool) {
    if (restaurantId == "") { return setSoldOut(store, tenantId, itemId, soldOut) };
    let k = key(tenantId, itemId) # "|" # restaurantId;
    if (soldOut) { store.add(k, vnDay(Time.now())) } else { store.remove(k) };
  };

  /// Các món hết hôm nay: (itemId, restaurantId — "" = mọi nhà hàng).
  public func soldOutTodayAt(store : Types.SoldOutStore, tenantId : Text) : [Types.SoldOutEntry] {
    let today = vnDay(Time.now());
    let prefix = tenantId # "|";
    store.entries().filter(
      func((k, day) : (Text, Nat)) : Bool = day == today and k.startsWith(#text prefix)
    ).map(
      func((k, _day) : (Text, Nat)) : Types.SoldOutEntry {
        let parts = k.trimStart(#text prefix).split(#char '|');
        let itemId = switch (parts.next()) { case (?p) p; case null "" };
        let restaurantId = switch (parts.next()) { case (?p) p; case null "" };
        { itemId; restaurantId };
      }
    ).toArray();
  };

  /// itemId các món đang báo hết Ở MỌI NHÀ HÀNG trong hôm nay (giờ VN).
  public func soldOutToday(store : Types.SoldOutStore, tenantId : Text) : [Text] {
    soldOutTodayAt(store, tenantId).filter(func(e : Types.SoldOutEntry) : Bool = e.restaurantId == "").map(func(e : Types.SoldOutEntry) : Text = e.itemId);
  };

  /// Dọn bản ghi "hết món" của những ngày trước (gọi khi ghi).
  public func pruneSoldOut(store : Types.SoldOutStore) {
    let today = vnDay(Time.now());
    let stale = store.entries().filter(func((_k : Text, d : Nat)) : Bool = d != today).map(func((k : Text, _d : Nat)) : Text = k).toArray();
    for (k in stale.values()) { store.remove(k) };
  };

  public func markPrep(store : Types.PrepStore, tenantId : Text, orderId : Text, stage : Types.PrepStage) : Types.OrderPrep {
    let k = key(tenantId, orderId);
    let now = Time.now().toNat();
    let cur : Types.OrderPrep = switch (store.get(k)) {
      case (?p) { p };
      case null { { orderId; readyAt = 0; handedAt = 0 } };
    };
    let next : Types.OrderPrep = switch (stage) {
      case (#ready) { { cur with readyAt = if (cur.readyAt == 0) now else cur.readyAt } };
      case (#handed) {
        { cur with readyAt = if (cur.readyAt == 0) now else cur.readyAt; handedAt = now };
      };
    };
    store.add(k, next);
    next;
  };

  /// Trạng thái bếp của các đơn tạo từ `sinceNs` trở đi (đơn cũ hơn bị dọn).
  public func listPrep(store : Types.PrepStore, tenantId : Text, sinceNs : Nat) : [Types.OrderPrep] {
    let prefix = tenantId # "|";
    store.entries().filter(
      func((k : Text, p : Types.OrderPrep)) : Bool = k.startsWith(#text prefix) and (p.readyAt >= sinceNs or p.handedAt >= sinceNs)
    ).map(func((_k : Text, p : Types.OrderPrep)) : Types.OrderPrep = p).toArray();
  };

  /// Xoá trạng thái bếp cũ hơn 2 ngày để bộ nhớ không phình.
  public func prunePrep(store : Types.PrepStore) {
    let limit : Int = Time.now() - 2 * DAY_NS();
    let stale = store.entries().filter(
      func((_k : Text, p : Types.OrderPrep)) : Bool = p.readyAt.toInt() < limit and p.handedAt.toInt() < limit
    ).map(func((k : Text, _p : Types.OrderPrep)) : Text = k).toArray();
    for (k in stale.values()) { store.remove(k) };
  };

  // ---- Ghi chú bếp của đơn tại quầy ----

  public func setKitchenNote(store : Types.KitchenNoteStore, tenantId : Text, orderId : Text, dineIn : Bool, note : Text) : Types.KitchenNote {
    let n : Types.KitchenNote = { orderId; dineIn; note; at = Time.now().toNat() };
    store.add(key(tenantId, orderId), n);
    n;
  };

  public func listKitchenNotes(store : Types.KitchenNoteStore, tenantId : Text, since : Nat) : [Types.KitchenNote] {
    let prefix = tenantId # "|";
    store.entries().filter(
      func((k, n) : (Text, Types.KitchenNote)) : Bool { k.startsWith(#text prefix) and n.at >= since }
    ).map(func((_, n) : (Text, Types.KitchenNote)) : Types.KitchenNote = n).toArray();
  };

  /// Bỏ ghi chú cũ hơn 2 ngày.
  public func pruneKitchenNotes(store : Types.KitchenNoteStore) {
    let since : Int = Time.now() - 2 * DAY_NS();
    if (since <= 0) return;
    let old = store.entries().filter(func((_, n) : (Text, Types.KitchenNote)) : Bool { n.at < since.toNat() }).map(func((k, _) : (Text, Types.KitchenNote)) : Text = k).toArray();
    for (k in old.values()) { store.remove(k) };
  };
};

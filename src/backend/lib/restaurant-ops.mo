import Time "mo:core/Time";

import StoreHoursTypes "../types/store-hours-config";
import Types "../types/restaurant-ops";

// Giờ nhận đơn theo ngày + tạm nghỉ của từng nhà hàng (xem
// types/restaurant-ops.mo). Hàm thuần — kho được mixin truyền vào.
module {
  public type DayHours = Types.DayHours;
  public type RestaurantOps = Types.RestaurantOps;

  func MIN_NS() : Int { 60 * 1_000_000_000 };
  func DAY_NS() : Int { 24 * 60 * MIN_NS() };
  func UTC7_NS() : Int { 7 * 60 * MIN_NS() };

  /// (phút trong ngày, thứ: 0 = Thứ 2 … 6 = Chủ nhật) theo giờ VN.
  /// 01/01/1970 là Thứ 5 → (số ngày + 3) % 7.
  public func vnClock(now : Int) : (Nat, Nat) {
    let shifted = now + UTC7_NS();
    let days = shifted / DAY_NS();
    let minute = ((shifted % DAY_NS()) / MIN_NS()).toNat();
    (minute, ((days + 3) % 7).toNat());
  };

  /// Giờ chung của đối tác → 7 ngày giống nhau.
  public func weekFromStoreHours(h : StoreHoursTypes.StoreHours) : [DayHours] {
    let d : DayHours = {
      open = true;
      openMin = h.openHour * 60 + h.openMinute;
      closeMin = h.closeHour * 60 + h.closeMinute;
    };
    [d, d, d, d, d, d, d];
  };

  public func effectiveWeek(ops : ?RestaurantOps, storeHours : StoreHoursTypes.StoreHours) : [DayHours] {
    switch (ops) {
      case (?o) { if (o.hasHours and o.week.size() == 7) o.week else weekFromStoreHours(storeHours) };
      case null { weekFromStoreHours(storeHours) };
    };
  };

  /// Kiểm tra 7 ngày hợp lệ (giờ 0..1440 phút).
  public func validWeek(week : [DayHours]) : Bool {
    if (week.size() != 7) return false;
    for (d in week.values()) {
      if (d.openMin > 1440 or d.closeMin > 1440) return false;
    };
    true;
  };

  func overnight(d : DayHours) : Bool { d.closeMin < d.openMin };

  /// Đang trong giờ nhận đơn? Có tính khung qua đêm của hôm trước.
  /// openMin == closeMin = mở cả ngày.
  public func isOpenAt(week : [DayHours], minute : Nat, day : Nat) : Bool {
    let today = week[day];
    let prev = week[(day + 6) % 7];
    if (today.open) {
      if (today.openMin == today.closeMin) return true;
      if (overnight(today)) {
        if (minute >= today.openMin) return true;
      } else if (minute >= today.openMin and minute < today.closeMin) {
        return true;
      };
    };
    prev.open and overnight(prev) and minute < prev.closeMin;
  };

  public func pausedNow(ops : ?RestaurantOps, now : Int) : Bool {
    switch (ops) {
      case (?o) { o.paused and (o.pausedUntil == 0 or now < o.pausedUntil) };
      case null { false };
    };
  };

  public func isOpen(
    ops : ?RestaurantOps,
    storeHours : StoreHoursTypes.StoreHours,
    tenantPaused : Bool,
    now : Int,
  ) : Bool {
    if (tenantPaused or pausedNow(ops, now)) return false;
    let (minute, day) = vnClock(now);
    isOpenAt(effectiveWeek(ops, storeHours), minute, day);
  };

  public func status(
    restaurantId : Text,
    ops : ?RestaurantOps,
    storeHours : StoreHoursTypes.StoreHours,
    tenantPaused : Bool,
    now : Int,
  ) : Types.RestaurantStatus {
    let (minute, day) = vnClock(now);
    let week = effectiveWeek(ops, storeHours);
    let today = week[day];
    if (tenantPaused or pausedNow(ops, now)) {
      let until = switch (ops) {
        case (?o) { if (not tenantPaused and o.pausedUntil > 0) o.pausedUntil else 0 };
        case null { 0 };
      };
      return { restaurantId; state = "paused"; pausedUntil = until; closesAt = -1; opensAt = -1 };
    };
    if (isOpenAt(week, minute, day)) {
      let prev = week[(day + 6) % 7];
      let closes : Int = if (prev.open and overnight(prev) and minute < prev.closeMin) {
        prev.closeMin;
      } else if (today.openMin == today.closeMin) { -1 } else { today.closeMin };
      return { restaurantId; state = "open"; pausedUntil = 0; closesAt = closes; opensAt = -1 };
    };
    let opens : Int = if (today.open and minute < today.openMin) today.openMin else -1;
    { restaurantId; state = "closed"; pausedUntil = 0; closesAt = -1; opensAt = opens };
  };

  public func blank(tenantId : Text) : RestaurantOps {
    {
      tenantId;
      hasHours = false;
      week = [];
      paused = false;
      pausedUntil = 0;
      updatedAt = Time.now();
    };
  };
};

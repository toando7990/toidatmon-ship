import Map "mo:core/Map";
import Time "mo:core/Time";

import Types "../types/platform-params";

module {
  public type ParamVersion = Types.ParamVersion;

  let MAX_HISTORY : Nat = 5; // giữ tối đa 5 phiên bản đã qua

  func storeKey(scope : Text, key : Text) : Text { scope # "|" # key };

  public func validKey(key : Text) : Bool {
    if (key.size() == 0 or key.size() > 40) return false;
    for (c in key.chars()) {
      if (not ((c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '_')) return false;
    };
    true;
  };

  public func validScope(scope : Text) : Bool {
    scope.size() <= 64 and not scope.contains(#char '|');
  };

  func nowNat() : Nat { Time.now().toNat() };

  /// Phiên bản đang áp dụng (effectiveFrom ≤ now) và phiên bản kế tiếp.
  public func split(versions : [ParamVersion], now : Nat) : (?ParamVersion, ?ParamVersion) {
    var current : ?ParamVersion = null;
    var upcoming : ?ParamVersion = null;
    for (v in versions.values()) {
      if (v.effectiveFrom <= now) {
        current := ?v;
      } else if (upcoming == null) {
        upcoming := ?v;
      };
    };
    (current, upcoming);
  };

  public func versionsOf(store : Types.ParamStore, scope : Text, key : Text) : [ParamVersion] {
    switch (store.get(storeKey(scope, key))) {
      case (?vs) vs;
      case null [];
    };
  };

  /// Đặt giá trị từ ngày effectiveFrom (quá khứ → tính từ bây giờ). Cùng ngày
  /// hiệu lực thì thay thế; các phiên bản sau ngày đó vẫn giữ.
  public func set(
    store : Types.ParamStore,
    scope : Text,
    key : Text,
    value : Text,
    effectiveFrom : Nat,
    note : Text,
  ) : ParamVersion {
    let now = nowNat();
    let from = if (effectiveFrom < now) now else effectiveFrom;
    let v : ParamVersion = { value; effectiveFrom = from; note; setAt = now };
    let kept = versionsOf(store, scope, key).filter(func(x : ParamVersion) : Bool { x.effectiveFrom != from });
    let merged = kept.concat([v]).sort(
      func(a : ParamVersion, b : ParamVersion) : { #less; #equal; #greater } {
        if (a.effectiveFrom < b.effectiveFrom) #less else if (a.effectiveFrom > b.effectiveFrom) #greater else #equal;
      }
    );
    store.add(storeKey(scope, key), prune(merged, now));
    v;
  };

  /// Huỷ một thay đổi CHƯA có hiệu lực.
  public func cancel(store : Types.ParamStore, scope : Text, key : Text, effectiveFrom : Nat) : Bool {
    let now = nowNat();
    if (effectiveFrom <= now) return false;
    let vs = versionsOf(store, scope, key);
    let kept = vs.filter(func(x : ParamVersion) : Bool { x.effectiveFrom != effectiveFrom });
    if (kept.size() == vs.size()) return false;
    if (kept.size() == 0) { store.remove(storeKey(scope, key)) } else {
      store.add(storeKey(scope, key), kept);
    };
    true;
  };

  /// Bỏ bớt phiên bản cũ: giữ phiên bản đang áp dụng + MAX_HISTORY bản trước.
  func prune(vs : [ParamVersion], now : Nat) : [ParamVersion] {
    var pastCount = 0;
    for (v in vs.values()) { if (v.effectiveFrom <= now) pastCount += 1 };
    let keepPast = MAX_HISTORY + 1;
    if (pastCount <= keepPast) return vs;
    let drop : Nat = pastCount - keepPast;
    vs.sliceToArray(drop, vs.size());
  };

  /// Các tham số áp dụng cho 1 quán: giá trị riêng (nếu có) ghi đè giá trị chung.
  public func effectiveFor(store : Types.ParamStore, tenantId : Text) : [Types.EffectiveParam] {
    let now = nowNat();
    let keys = Map.empty<Text, Bool>();
    let globalPrefix = "|";
    let tenantPrefix = tenantId # "|";
    for (k in store.keys()) {
      if (k.startsWith(#text globalPrefix)) {
        keys.add(k.trimStart(#text globalPrefix), true);
      } else if (tenantId != "" and k.startsWith(#text tenantPrefix)) {
        keys.add(k.trimStart(#text tenantPrefix), true);
      };
    };
    let out = keys.keys().map(
      func(key : Text) : Types.EffectiveParam {
        let own = if (tenantId == "") [] else versionsOf(store, tenantId, key);
        if (own.size() > 0) {
          let (current, upcoming) = split(own, now);
          { key; current; upcoming; overridden = true };
        } else {
          let (current, upcoming) = split(versionsOf(store, "", key), now);
          { key; current; upcoming; overridden = false };
        };
      }
    );
    out.toArray();
  };

  public func listAll(store : Types.ParamStore) : [Types.ParamEntry] {
    store.entries().map(
      func((k, versions) : (Text, [ParamVersion])) : Types.ParamEntry {
        let parts = k.split(#char '|').toArray();
        let scope = if (parts.size() > 0) parts[0] else "";
        let key = if (parts.size() > 1) parts[1] else "";
        { scope; key; versions };
      }
    ).toArray();
  };

  // ---- Gói bán quầy có hạn ----

  public func counterPlanUntil(store : Types.CounterPlanUntilStore, tenantId : Text) : Nat {
    switch (store.get(tenantId)) { case (?t) t; case null 0 };
  };

  /// Gói đang hiệu lực: đã bật và (không hạn hoặc chưa tới hạn).
  public func counterPlanActive(enabled : Bool, until : Nat) : Bool {
    enabled and (until == 0 or nowNat() < until);
  };
};

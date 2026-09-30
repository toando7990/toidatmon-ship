import Map "mo:core/Map";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Result "mo:core/Result";

import SalesPromoTypes "../types/sales-promo";
import VoucherTypes "../types/voucher";
import VoucherLib "../lib/voucher";

module {
  func DAY_NS() : Int { 24 * 3600 * 1_000_000_000 };
  func UTC7_OFFSET_NS() : Int { 7 * 3600 * 1_000_000_000 };

  func civilFromDays(z0 : Int) : (Int, Int, Int) {
    let z = z0 + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    (if (m <= 2) y + 1 else y, m, d);
  };

  func padNat(n : Int, width : Nat) : Text {
    var s = n.toText();
    while (s.size() < width) { s := "0" # s };
    s;
  };

  func vnDayIndex(now : Int) : Int {
    (now + UTC7_OFFSET_NS()) / DAY_NS();
  };

  public func vnDateKey(now : Int) : Text {
    let (y, m, d) = civilFromDays(vnDayIndex(now));
    padNat(y, 4) # padNat(m, 2) # padNat(d, 2);
  };

  public func computeVoucherEndDate(now : Int, validDays : Nat) : Text {
    let (y, m, d) = civilFromDays(vnDayIndex(now) + validDays);
    padNat(y, 4) # padNat(m, 2) # padNat(d, 2);
  };

  public func isSalesPromoActiveNow(promo : SalesPromoTypes.SalesPromo, now : Int) : Bool {
    if (not promo.active) return false;
    let today = vnDateKey(now);
    if (today < promo.startDate) return false;
    if (today > promo.endDate) return false;
    true;
  };

  public func findActiveSalesPromo(
    store : SalesPromoTypes.SalesPromoStore,
    tenantId : Text,
    now : Int,
  ) : ?SalesPromoTypes.SalesPromo {
    for ((_code, promo) in store.toArray().vals()) {
      if (promo.tenantId == tenantId and isSalesPromoActiveNow(promo, now)) {
        return ?promo;
      };
    };
    null;
  };

  public func findApplicableSalesTier(
    tiers : [SalesPromoTypes.SalesTier],
    totalSales : Nat,
  ) : ?SalesPromoTypes.SalesTier {
    var best : ?SalesPromoTypes.SalesTier = null;
    for (tier in tiers.vals()) {
      if (totalSales >= tier.minSales) {
        switch (best) {
          case null { best := ?tier };
          case (?b) {
            if (tier.minSales > b.minSales) { best := ?tier };
          };
        };
      };
    };
    best;
  };

  func dedupKey(tenantId : Text, email : Text, periodType : Text, periodKey : Text) : Text {
    tenantId # "|" # email.toLower() # "|" # periodType # "|" # periodKey;
  };

  public func tryIssueSalesBonus(
    promoStore : SalesPromoTypes.SalesPromoStore,
    issuedStore : SalesPromoTypes.SalesBonusIssuedStore,
    voucherStore : VoucherTypes.VoucherStore,
    voucherPrng : VoucherLib.PrngState,
    tenantId : Text,
    email : Text,
    periodType : Text,
    periodKey : Text,
    totalSales : Nat,
    now : Int,
  ) : Result.Result<?VoucherTypes.Voucher, Text> {
    if (periodType != "weekly" and periodType != "monthly") {
      return #err("periodType phải là 'weekly' hoặc 'monthly'");
    };
    let key = dedupKey(tenantId, email, periodType, periodKey);
    if (issuedStore.get(key) != null) {
      return #ok(null);
    };
    switch (findActiveSalesPromo(promoStore, tenantId, now)) {
      case null { #ok(null) };
      case (?promo) {
        let tiers = if (periodType == "weekly") promo.weeklyTiers else promo.monthlyTiers;
        switch (findApplicableSalesTier(tiers, totalSales)) {
          case null { #ok(null) };
          case (?tier) {
            let startDate = vnDateKey(now);
            let endDate = computeVoucherEndDate(now, promo.voucherValidDays);
            let voucher = VoucherLib.issueVoucher(
              voucherStore,
              voucherPrng,
              tenantId,
              promo.code,
              email,
              tier.voucherValue,
              startDate,
              endDate,
              now,
            );
            issuedStore.add(key, now);
            #ok(?voucher);
          };
        };
      };
    };
  };

  // Quét TOÀN BỘ chương trình Doanh số, tự chuyển active=false cho những
  // chương trình ĐÃ QUA endDate — cùng nguyên tắc đã áp dụng ở
  // lib/promotion.mo (xem giải thích đầy đủ ở đó). Trả về số chương trình
  // vừa bị tắt.
  public func deactivateExpiredSalesPromos(
    store : SalesPromoTypes.SalesPromoStore,
    now : Int,
  ) : Nat {
    let today = vnDateKey(now);
    var count = 0;
    for ((code, p) in store.toArray().vals()) {
      if (p.active and today > p.endDate) {
        let updated : SalesPromoTypes.SalesPromo = { p with active = false };
        store.add(code, updated);
        count += 1;
      };
    };
    count;
  };
};

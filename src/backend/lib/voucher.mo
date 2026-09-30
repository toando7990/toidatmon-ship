import Map "mo:core/Map";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Array "mo:core/Array";

import VoucherTypes "../types/voucher";

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

  public func vnDateKey(now : Int) : Text {
    let dayIndex = (now + UTC7_OFFSET_NS()) / DAY_NS();
    let (y, m, d) = civilFromDays(dayIndex);
    padNat(y, 4) # padNat(m, 2) # padNat(d, 2);
  };

  let CODE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  public type PrngState = { var state : Nat; var seeded : Bool };

  public func newPrngState() : PrngState {
    { var state = 0; var seeded = false };
  };

  func nextRandom(prng : PrngState) : Nat {
    if (not prng.seeded) {
      let now64 : Nat64 = Nat64.fromIntWrap(Time.now());
      prng.state := Nat64.toNat(now64 | 1);
      prng.seeded := true;
    };
    var x : Nat64 = Nat64.fromIntWrap(prng.state);
    x := x ^ (x << 13);
    x := x ^ (x >> 7);
    x := x ^ (x << 17);
    prng.state := x.toNat();
    x.toNat();
  };

  public func generateVoucherCode(prng : PrngState) : Text {
    let charsetSize = CODE_CHARSET.size();
    let chars = CODE_CHARSET.chars().toArray();
    var code = "";
    var i = 0;
    while (i < 8) {
      let idx = nextRandom(prng) % charsetSize;
      code := code # chars[idx].toText();
      i += 1;
    };
    code;
  };

  public func issueVoucher(
    store : VoucherTypes.VoucherStore,
    prng : PrngState,
    tenantId : Text,
    programCode : Text,
    email : Text,
    value : Nat,
    startDate : Text,
    endDate : Text,
    now : Int,
  ) : VoucherTypes.Voucher {
    let code = generateVoucherCode(prng);
    let voucher : VoucherTypes.Voucher = {
      code;
      tenantId;
      programCode;
      email = email.toLower();
      value;
      startDate;
      endDate;
      used = false;
      issuedAt = now;
    };
    store.add(code, voucher);
    voucher;
  };

  public func isVoucherValidNow(voucher : VoucherTypes.Voucher, now : Int) : Bool {
    if (voucher.used) return false;
    let today = vnDateKey(now);
    if (today < voucher.startDate) return false;
    if (today > voucher.endDate) return false;
    true;
  };

  // Danh sách phiếu của 1 khách (theo email, không phân biệt hoa/thường)
  // TRONG 1 ĐỐI TÁC — sắp CHƯA DÙNG trước, ĐÃ DÙNG sau (đúng yêu cầu).
  // Trong mỗi nhóm giữ nguyên thứ tự lưu trữ (không sắp phụ theo ngày —
  // không bắt buộc theo yêu cầu, tránh phụ thuộc Array.sort chưa có tiền lệ
  // dùng trong codebase này — chỉ dùng Array.tabulate đã xác nhận qua
  // lib/hmac.mo).
  public func listVouchersForEmail(
    store : VoucherTypes.VoucherStore,
    tenantId : Text,
    email : Text,
  ) : [VoucherTypes.Voucher] {
    let normalized = email.toLower();
    let mine = store.toArray()
      .filter(func((_code : Text, v : VoucherTypes.Voucher)) : Bool { v.tenantId == tenantId and v.email == normalized })
      .map(func((_code : Text, v : VoucherTypes.Voucher)) : VoucherTypes.Voucher = v);
    let unused = mine.filter(func(v : VoucherTypes.Voucher) : Bool { not v.used });
    let usedOnes = mine.filter(func(v : VoucherTypes.Voucher) : Bool { v.used });
    let n1 = unused.size();
    Array.tabulate(
      n1 + usedOnes.size(),
      func(i : Nat) : VoucherTypes.Voucher {
        if (i < n1) unused[i] else usedOnes[i - n1];
      },
    );
  };

  public func applyVoucher(
    store : VoucherTypes.VoucherStore,
    tenantId : Text,
    email : Text,
    code : Text,
    orderAmount : Nat,
    now : Int,
  ) : Result.Result<Nat, Text> {
    switch (store.get(code)) {
      case null { #err("Không tìm thấy phiếu giảm giá") };
      case (?voucher) {
        if (voucher.tenantId != tenantId) {
          return #err("Phiếu không thuộc về đối tác này");
        };
        if (voucher.email != email.toLower()) {
          return #err("Phiếu không thuộc về email này");
        };
        if (voucher.used) {
          return #err("Phiếu đã được sử dụng");
        };
        if (not isVoucherValidNow(voucher, now)) {
          return #err("Phiếu đã hết hạn hoặc chưa tới ngày hiệu lực");
        };
        let discount = if (voucher.value > orderAmount) orderAmount else voucher.value;
        let updated : VoucherTypes.Voucher = { voucher with used = true };
        store.add(code, updated);
        #ok(discount);
      };
    };
  };
};

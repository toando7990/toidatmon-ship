import Map "mo:core/Map";
import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Text "mo:core/Text";

import TenantTypes "../types/tenant";
import TenantLib "tenant";
import Types "../types/partner-application";

// Logic đơn đăng ký đối tác. Phân quyền thực thi ở mixins/partner-application-api.mo.
module {
  public type Application = Types.Application;
  public type ApplicationInput = Types.ApplicationInput;
  public type ApplicationStore = Types.ApplicationStore;

  let maxShort : Nat = 200;
  let maxAddress : Nat = 400;

  func tooLong(t : Text, n : Nat) : Bool = t.size() > n;

  func blank(t : Text) : Bool = t.trim(#char ' ').size() == 0;

  func digitsOnly(t : Text) : Bool {
    for (c in t.chars()) {
      if (not (c >= '0' and c <= '9')) { return false };
    };
    true;
  };

  // Mã số thuế VN: 10 chữ số (doanh nghiệp/hộ KD) hoặc 13 số (đơn vị phụ thuộc,
  // dạng 10 số + 3 số) — chỉ kiểm tra dạng, không tra cứu.
  func validTaxCode(t : Text) : Bool {
    let n = t.size();
    (n == 10 or n == 13) and digitsOnly(t);
  };

  // Điện thoại VN: 9–11 chữ số (cho phép ký tự + ở đầu).
  func validPhone(t : Text) : Bool {
    let s = if (t.startsWith(#text "+")) { t.trim(#text "+") } else { t };
    let n = s.size();
    n >= 9 and n <= 11 and digitsOnly(s);
  };

  func validEmail(t : Text) : Bool {
    t.contains(#char '@') and t.contains(#char '.') and t.size() <= 120 and not t.contains(#char ' ');
  };

  /// Kiểm tra dữ liệu đơn. Trả về #ok(slug đã chuẩn hoá) hoặc #err(lý do tiếng Việt).
  public func validate(i : ApplicationInput) : { #ok : Text; #err : Text } {
    if (not (i.agreedTerms and i.agreedDataProcessing and i.agreedTaxWithholding and i.confirmedAccurate)) {
      return #err("Cần đồng ý tất cả điều khoản ở bước cuối");
    };
    if (blank(i.brandName) or tooLong(i.brandName, maxShort)) {
      return #err("Tên quán không hợp lệ");
    };
    if (blank(i.storeAddress) or tooLong(i.storeAddress, maxAddress)) {
      return #err("Địa chỉ quán không hợp lệ");
    };
    if (blank(i.contactName) or tooLong(i.contactName, maxShort)) {
      return #err("Tên người liên hệ không hợp lệ");
    };
    if (not validPhone(i.contactPhone)) {
      return #err("Số điện thoại không hợp lệ");
    };
    if (not validEmail(i.contactEmail)) {
      return #err("Email không hợp lệ");
    };
    if (i.branchCount == 0 or i.branchCount > 1000) {
      return #err("Số cơ sở không hợp lệ");
    };
    if (tooLong(i.cuisine, maxShort)) {
      return #err("Loại món quá dài");
    };
    if (blank(i.legalName) or tooLong(i.legalName, maxShort)) {
      return #err("Tên pháp lý không hợp lệ");
    };
    if (not validTaxCode(i.taxCode)) {
      return #err("Mã số thuế phải gồm 10 hoặc 13 chữ số");
    };
    if (tooLong(i.registrationNumber, maxShort)) {
      return #err("Số đăng ký kinh doanh quá dài");
    };
    if (blank(i.representativeName) or tooLong(i.representativeName, maxShort)) {
      return #err("Tên người đại diện không hợp lệ");
    };
    if (blank(i.headOfficeAddress) or tooLong(i.headOfficeAddress, 300)) {
      return #err("Địa chỉ trụ sở không hợp lệ");
    };
    if (blank(i.bankName) or tooLong(i.bankName, maxShort)) {
      return #err("Tên ngân hàng không hợp lệ");
    };
    if (i.bankAccountNumber.size() < 6 or i.bankAccountNumber.size() > 20 or not digitsOnly(i.bankAccountNumber)) {
      return #err("Số tài khoản ngân hàng không hợp lệ");
    };
    if (blank(i.bankAccountHolder) or tooLong(i.bankAccountHolder, maxShort)) {
      return #err("Tên chủ tài khoản không hợp lệ");
    };
    TenantTypes.validateSlug(i.desiredSlug);
  };

  func isOpen(a : Application) : Bool = switch (a.status) {
    case (#pending or #needsInfo) { true };
    case (_) { false };
  };

  func slugTaken(store : ApplicationStore, tenants : TenantTypes.TenantStore, slug : Text) : Bool {
    if (TenantLib.getTenantBySlug(tenants, slug) != null) { return true };
    for ((_, a) in store.entries()) {
      if (isOpen(a) and TenantTypes.normalizeSlug(a.input.desiredSlug) == slug) { return true };
    };
    false;
  };

  func openCount(store : ApplicationStore) : Nat {
    var n = 0;
    for ((_, a) in store.entries()) {
      if (isOpen(a)) { n += 1 };
    };
    n;
  };

  /// Nộp đơn mới. Trả về #ok(applicationId).
  public func submit(
    store : ApplicationStore,
    tenants : TenantTypes.TenantStore,
    input : ApplicationInput,
  ) : { #ok : Text; #err : Text } {
    let slug = switch (validate(input)) {
      case (#err e) { return #err(e) };
      case (#ok s) { s };
    };
    if (slugTaken(store, tenants, slug)) {
      return #err("Tên miền con này đã có người đăng ký hoặc đang chờ duyệt");
    };
    if (openCount(store) >= Types.maxOpenApplications) {
      return #err("Hệ thống đang nhận quá nhiều đơn, vui lòng thử lại sau");
    };
    let now = Time.now().toNat();
    // Mã đơn: PA-<thời điểm ns> — duy nhất vì Time.now() tăng và slug đã khoá.
    let id = "PA-" # now.toText();
    let app : Application = {
      applicationId = id;
      input = { input with desiredSlug = slug };
      status = #pending;
      adminNote = "";
      tenantId = "";
      createdAt = now;
      updatedAt = now;
    };
    store.add(id, app);
    #ok(id);
  };

  /// Tra cứu trạng thái: cần đúng email đã khai (chống dò mã đơn).
  public func statusFor(store : ApplicationStore, id : Text, email : Text) : ?Types.ApplicationStatusView {
    switch (store.get(id)) {
      case null { null };
      case (?a) {
        if (a.input.contactEmail.toLower() != email.trim(#char ' ').toLower()) { return null };
        ?{
          applicationId = a.applicationId;
          brandName = a.input.brandName;
          desiredSlug = a.input.desiredSlug;
          status = a.status;
          adminNote = a.adminNote;
          createdAt = a.createdAt;
          updatedAt = a.updatedAt;
        };
      };
    };
  };

  /// Danh sách đơn, mới nhất trước. statusFilter = null → tất cả.
  public func list(store : ApplicationStore, statusFilter : ?Types.ApplicationStatus) : [Application] {
    let all = store.toArray().map(func((_k : Text, a : Application)) : Application = a);
    let filtered = switch (statusFilter) {
      case null { all };
      case (?s) { all.filter(func(a : Application) : Bool = a.status == s) };
    };
    filtered.sort(func(a : Application, b : Application) : { #less; #equal; #greater } = Nat.compare(b.createdAt, a.createdAt));
  };

  public type Decision = { #approve; #reject; #requestInfo };

  /// Admin xử lý đơn. Khi #approve: tạo Tenant với thông tin ĐỐI TÁC
  /// (companyName = tên pháp lý, taxCode, address = địa chỉ trụ sở, phone =
  /// SĐT liên hệ của đối tác) — KHÔNG lấy địa chỉ nhà hàng. Đơn cũ chưa có
  /// địa chỉ trụ sở → để trống, admin bổ sung ở trang Đối tác.
  public func review(
    store : ApplicationStore,
    tenants : TenantTypes.TenantStore,
    id : Text,
    decision : Decision,
    note : Text,
  ) : { #ok : Application; #err : Text } {
    let a = switch (store.get(id)) {
      case null { return #err("Không tìm thấy đơn") };
      case (?a) { a };
    };
    if (a.status == #approved) { return #err("Đơn đã được duyệt trước đó") };
    let now = Time.now().toNat();
    let updated : Application = switch (decision) {
      case (#reject) {
        if (blank(note)) { return #err("Cần ghi lý do từ chối") };
        { a with status = #rejected; adminNote = note; updatedAt = now };
      };
      case (#requestInfo) {
        if (blank(note)) { return #err("Cần ghi nội dung cần bổ sung") };
        { a with status = #needsInfo; adminNote = note; updatedAt = now };
      };
      case (#approve) {
        let i = a.input;
        switch (TenantLib.createTenant(tenants, i.desiredSlug, i.brandName, "", i.legalName, i.taxCode, i.headOfficeAddress, i.contactPhone, "#e11d48")) {
          case (#err e) { return #err(e) };
          case (#ok t) {
            { a with status = #approved; adminNote = note; tenantId = t.tenantId; updatedAt = now };
          };
        };
      };
    };
    store.add(id, updated);
    #ok(updated);
  };
};

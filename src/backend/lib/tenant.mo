import Map "mo:core/Map";
import Time "mo:core/Time";
import Int "mo:core/Int";

import Common "../types/common";
import TenantTypes "../types/tenant";

// Tenant (đối tác) domain logic.
//
// Quy tắc phân quyền (được thực thi ở mixins/tenant-api.mo):
//   - Ghi (createTenant/updateTenant/setTenantActive): CHỈ admin trung tâm.
//   - Đọc (listTenants/getTenant/getTenantBySlug): công khai để frontend phân
//     giải đối tác từ hostname/đường dẫn.
module {
  public type Tenant = TenantTypes.Tenant;
  public type TenantId = Common.TenantId;
  public type TenantStore = TenantTypes.TenantStore;

  /// Tạo đối tác mới. Trả về #err khi slug đã tồn tại hoặc không hợp lệ.
  /// Sinh tenantId mới; createdAt = updatedAt = Time.now().
  public func createTenant(
    tenants : TenantStore,
    slug : Text,
    name : Text,
    logoUrl : Text,
    companyName : Text,
    taxCode : Text,
    address : Text,
    phone : Text,
    brandColor : Text,
  ) : { #ok : Tenant; #err : Text } {
    let validated = TenantTypes.validateSlug(slug);
    let normalized = switch (validated) {
      case (#err e) { return #err(e) };
      case (#ok s) { s };
    };
    if (getTenantBySlug(tenants, normalized) != null) {
      return #err("Slug đã tồn tại");
    };
    let now = Time.now().toNat();
    // tenantId = slug đã chuẩn hoá: slug là duy nhất (đã kiểm tra ở trên) và
    // ổn định, nên dùng luôn làm khoá chính — tránh cần bộ đếm sinh id riêng.
    let tenant : Tenant = {
      tenantId = normalized;
      slug = normalized;
      name;
      logoUrl;
      companyName;
      taxCode;
      address;
      phone;
      brandColor;
      active = true;
      createdAt = now;
      updatedAt = now;
    };
    tenants.add(normalized, tenant);
    #ok(tenant);
  };

  /// Cập nhật thông tin đối tác (không đổi tenantId/slug/createdAt).
  /// updatedAt = Time.now(). Trả về #err khi không tìm thấy đối tác.
  public func updateTenant(
    tenants : TenantStore,
    tenantId : TenantId,
    name : Text,
    logoUrl : Text,
    companyName : Text,
    taxCode : Text,
    address : Text,
    phone : Text,
    brandColor : Text,
  ) : { #ok : Tenant; #err : Text } {
    switch (tenants.get(tenantId)) {
      case null { #err("Không tìm thấy đối tác") };
      case (?existing) {
        let updated : Tenant = {
          existing with
          name;
          logoUrl;
          companyName;
          taxCode;
          address;
          phone;
          brandColor;
          updatedAt = Time.now().toNat();
        };
        tenants.add(tenantId, updated);
        #ok(updated);
      };
    };
  };

  /// Bật/tắt đối tác. active=false ẩn đối tác khỏi frontend nhưng KHÔNG xoá
  /// dữ liệu. updatedAt = Time.now().
  public func setTenantActive(
    tenants : TenantStore,
    tenantId : TenantId,
    active : Bool,
  ) : { #ok : Tenant; #err : Text } {
    switch (tenants.get(tenantId)) {
      case null { #err("Không tìm thấy đối tác") };
      case (?existing) {
        let updated : Tenant = {
          existing with
          active;
          updatedAt = Time.now().toNat();
        };
        tenants.add(tenantId, updated);
        #ok(updated);
      };
    };
  };

  /// Liệt kê đối tác. activeOnly=true chỉ trả các đối tác đang hoạt động.
  public func listTenants(tenants : TenantStore, activeOnly : Bool) : [Tenant] {
    let all = tenants.toArray().map(func((_id : TenantId, t : Tenant)) : Tenant = t);
    if (activeOnly) {
      all.filter(func(t : Tenant) : Bool = t.active);
    } else {
      all;
    };
  };

  /// Lấy đối tác theo tenantId.
  public func getTenant(tenants : TenantStore, tenantId : TenantId) : ?Tenant {
    tenants.get(tenantId);
  };

  /// Tên hiển thị của đối tác (email, thông báo). Không tìm thấy → "Tôi Đặt Món".
  public func displayName(tenants : TenantStore, tenantId : TenantId) : Text {
    switch (tenants.get(tenantId)) {
      case (?t) { if (t.name.size() > 0) t.name else "Tôi Đặt Món" };
      case null { "Tôi Đặt Món" };
    };
  };

  /// Lấy đối tác theo slug (đã chuẩn hoá chữ thường). Dùng để phân giải đối
  /// tác từ hostname subdomain hoặc tiền tố đường dẫn /<slug>.
  public func getTenantBySlug(tenants : TenantStore, slug : Text) : ?Tenant {
    let normalized = TenantTypes.normalizeSlug(slug);
    tenants.toArray().find(func((_id : TenantId, t : Tenant)) : Bool = t.slug == normalized).map(
      func((_id : TenantId, t : Tenant)) : Tenant = t
    );
  };

  /// Kiểm tra tenantId có tồn tại và đang hoạt động — dùng làm cổng cách ly
  /// dữ liệu cho mọi endpoint theo đối tác.
  public func isActiveTenant(tenants : TenantStore, tenantId : TenantId) : Bool {
    switch (tenants.get(tenantId)) {
      case null { false };
      case (?t) { t.active };
    };
  };
};

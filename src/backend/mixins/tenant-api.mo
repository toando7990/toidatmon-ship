import Principal "mo:core/Principal";
import AccessControl "mo:caffeineai-authorization/access-control";

import TenantLib "../lib/tenant";
import TenantTypes "../types/tenant";
import Common "../types/common";

// Public tenant (đối tác) API.
//
// Quy tắc phân quyền:
//   - createTenant / updateTenant / setTenantActive: CHỈ admin trung tâm
//     (AccessControl.isAdmin). Caller khác nhận #err("Admin only").
//   - listTenants / getTenant / getTenantBySlug: công khai (query) để frontend
//     phân giải đối tác từ hostname subdomain hoặc tiền tố đường dẫn /<slug>.
//     getTenantBySlug/listTenants(activeOnly=true) chỉ trả đối tác đang hoạt
//     động cho caller không phải admin.
//
// KHÔNG có endpoint tự đăng ký đối tác (doNotBuild).
mixin (
  tenants : TenantTypes.TenantStore,
  accessControlState : AccessControl.AccessControlState,
) {
  /// Tạo đối tác mới. Admin trung tâm only.
  public shared ({ caller }) func createTenant(
    slug : Text,
    name : Text,
    logoUrl : Text,
    companyName : Text,
    taxCode : Text,
    address : Text,
    phone : Text,
    brandColor : Text,
  ) : async { #ok : TenantTypes.Tenant; #err : Text } {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    TenantLib.createTenant(tenants, slug, name, logoUrl, companyName, taxCode, address, phone, brandColor);
  };

  /// Cập nhật thông tin đối tác. Admin trung tâm only.
  public shared ({ caller }) func updateTenant(
    tenantId : Common.TenantId,
    name : Text,
    logoUrl : Text,
    companyName : Text,
    taxCode : Text,
    address : Text,
    phone : Text,
    brandColor : Text,
  ) : async { #ok : TenantTypes.Tenant; #err : Text } {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    TenantLib.updateTenant(tenants, tenantId, name, logoUrl, companyName, taxCode, address, phone, brandColor);
  };

  /// Bật/tắt đối tác. Admin trung tâm only.
  public shared ({ caller }) func setTenantActive(
    tenantId : Common.TenantId,
    active : Bool,
  ) : async { #ok : TenantTypes.Tenant; #err : Text } {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    TenantLib.setTenantActive(tenants, tenantId, active);
  };

  /// Liệt kê đối tác. Công khai. activeOnly=true chỉ trả đối tác đang hoạt
  /// động (caller không phải admin luôn chỉ thấy đối tác đang hoạt động).
  public query ({ caller }) func listTenants(activeOnly : Bool) : async [TenantTypes.Tenant] {
    if (AccessControl.isAdmin(accessControlState, caller)) {
      TenantLib.listTenants(tenants, activeOnly);
    } else {
      TenantLib.listTenants(tenants, true);
    };
  };

  /// Lấy đối tác theo tenantId. Công khai.
  public query ({ caller }) func getTenant(tenantId : Common.TenantId) : async ?TenantTypes.Tenant {
    switch (TenantLib.getTenant(tenants, tenantId)) {
      case null { null };
      case (?t) {
        if (AccessControl.isAdmin(accessControlState, caller) or t.active) { ?t } else { null };
      };
    };
  };

  /// Lấy đối tác theo slug — frontend dùng để phân giải đối tác từ hostname
  /// subdomain hoặc tiền tố đường dẫn /<slug>. Công khai.
  public query ({ caller }) func getTenantBySlug(slug : Text) : async ?TenantTypes.Tenant {
    switch (TenantLib.getTenantBySlug(tenants, slug)) {
      case null { null };
      case (?t) {
        if (AccessControl.isAdmin(accessControlState, caller) or t.active) { ?t } else { null };
      };
    };
  };
};

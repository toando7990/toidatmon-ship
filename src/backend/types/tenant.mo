import Map "mo:core/Map";
import Common "common";

// Tenant (đối tác) domain types.
//
// Mỗi đối tác (partner) sở hữu 1 chuỗi nhà hàng riêng, có subdomain riêng của
// toidatmon.com (ví dụ "bunbohue65.toidatmon.com") và menu riêng. Dữ liệu cốt
// lõi (đơn hàng, menu, nhà hàng, thiết bị, khuyến mại) được lưu trên canister
// và PHẢI cách ly hoàn toàn giữa các đối tác.
//
// Đối tác do admin trung tâm tạo (KHÔNG có tự đăng ký — xem doNotBuild).
module {
  /// Định danh đối tác — khoá chính của TenantStore.
  public type TenantId = Common.TenantId;

  /// Một đối tác (partner) của nền tảng.
  ///
  /// - `slug` là nhãn subdomain (ví dụ "bunbohue65" cho
  ///   bunbohue65.toidatmon.com). Frontend phân giải đối tác từ hostname
  ///   (subdomain) hoặc từ tiền tố đường dẫn /<slug> dự phòng.
  /// - `logoUrl` / `brandColor` phục vụ giao diện thương hiệu riêng của đối
  ///   tác. `brandColor` là chuỗi hex hoặc oklch; rỗng = dùng mặc định.
  /// - `active` = false thì đối tác bị ẩn/ngừng hoạt động: frontend KHÔNG được
  ///   render màn hình trắng cho slug không tồn tại hoặc bị ẩn — phải hiện
  ///   thông báo thân thiện.
  public type Tenant = {
    tenantId : TenantId;
    slug : Text;
    name : Text;
    logoUrl : Text;
    companyName : Text;
    taxCode : Text;
    address : Text;
    phone : Text;
    brandColor : Text;
    active : Bool;
    createdAt : Common.Timestamp;
    updatedAt : Common.Timestamp;
  };

  /// Stable storage shape cho tập đối tác (key = tenantId).
  public type TenantStore = Map.Map<TenantId, Tenant>;

  /// Đối tác mặc định đại diện cho doanh nghiệp Bunbohue65 hiện hữu. Migration
  /// backfill MỌI dữ liệu cũ (đơn hàng, menu, nhà hàng, thiết bị, khuyến mại,
  /// voucher, cấu hình) về tenantId này để không mất dữ liệu và app tiếp tục
  /// chạy sau nâng cấp.
  public let defaultTenantId : TenantId = "bunbohue65";

  /// Slug của đối tác mặc định (khớp subdomain bunbohue65.toidatmon.com).
  public let defaultTenantSlug : Text = "bunbohue65";

  /// Tên hiển thị của đối tác mặc định.
  public let defaultTenantName : Text = "Bunbohue65";

  /// Các slug bị cấm vì trùng hạ tầng/hệ thống (www, admin, api, app...).
  /// createTenant từ chối các slug này.
  public let reservedSlugs : [Text] = [
    "www",
    "admin",
    "api",
    "app",
    "static",
    "assets",
    "cdn",
    "mail",
    "smtp",
    "ftp",
    "ns",
    "ns1",
    "ns2",
    "localhost",
    "toidatmon",
    "dashboard",
    "portal",
    "support",
    "help",
    "status",
  ];

  /// Chuẩn hoá slug: chữ thường, chỉ giữ [a-z0-9-]. Dùng để so khớp hostname
  /// với slug đối tác một cách nhất quán.
  public func normalizeSlug(s : Text) : Text {
    s.toLower();
  };

  /// Kiểm tra slug hợp lệ theo đúng quy tắc createTenant:
  ///   - không rỗng, chỉ chứa [a-z0-9-] (sau khi chuẩn hoá chữ thường),
  ///   - không bắt đầu/kết thúc bằng '-',
  ///   - không nằm trong reservedSlugs.
  /// Trả về #ok(slug đã chuẩn hoá) hoặc #err(lý do).
  public func validateSlug(raw : Text) : { #ok : Text; #err : Text } {
    let slug = normalizeSlug(raw);
    if (slug.size() == 0) {
      return #err("Slug không được để trống");
    };
    // Chỉ cho phép [a-z0-9-]: mọi ký tự phải là chữ thường, số, hoặc '-'.
    for (c in slug.chars()) {
      let isLower = c >= 'a' and c <= 'z';
      let isDigit = c >= '0' and c <= '9';
      if (not (isLower or isDigit or c == '-')) {
        return #err("Slug chỉ được chứa chữ thường, số và dấu gạch ngang");
      };
    };
    if (slug.startsWith(#text "-") or slug.endsWith(#text "-")) {
      return #err("Slug không được bắt đầu hoặc kết thúc bằng dấu gạch ngang");
    };
    if (reservedSlugs.contains(slug)) {
      return #err("Slug này được dành riêng cho hệ thống");
    };
    #ok(slug);
  };
};

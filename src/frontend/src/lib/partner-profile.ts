// Hồ sơ ĐỐI TÁC (pháp nhân). Tôi Đặt Món làm việc với ĐỐI TÁC, không với
// từng nhà hàng. Ví dụ: đối tác "Công ty Gia Khánh Foods" sở hữu thương hiệu
// "Bún Bò Huế 65" gồm 5 nhà hàng.
//   - Đối tác: tên pháp lý (Tenant.companyName), MST, địa chỉ trụ sở
//     (Tenant.address), SĐT liên hệ (Tenant.phone) + hồ sơ bổ sung ở đây.
//   - Thương hiệu: Tenant.name / slug / logo / màu — hiển thị cho khách.
//   - Nhà hàng / chi nhánh: đối tác tự quản lý; sàn chỉ đếm số lượng.
// Hàm canister mới chỉ có trong bindings sau lần build Caffeine kế tiếp →
// gọi qua kiểu cục bộ + ép kiểu.

import type { Backend } from "@/backend";
import type { BusinessType } from "@/lib/partner-applications";
import { slugify } from "@/lib/partner-applications";
import type { Tenant } from "@/types";

export interface PartnerProfile {
  businessType: BusinessType;
  registrationNumber: string;
  representativeName: string;
  contactName: string;
  contactEmail: string;
  updatedAt: bigint;
  /** "admin" | "application" */
  updatedBy: string;
}

export type PartnerProfileInput = Omit<
  PartnerProfile,
  "updatedAt" | "updatedBy"
>;

type Result<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

interface ProfileActor {
  setPartnerProfile(
    tenantId: string,
    businessType: BusinessType,
    registrationNumber: string,
    representativeName: string,
    contactName: string,
    contactEmail: string,
  ): Promise<Result<PartnerProfile>>;
  listPartnerProfiles(
    credential: string,
  ): Promise<Result<Array<[string, PartnerProfile]>>>;
  countRestaurantsByTenant(): Promise<Array<[string, bigint]>>;
}

export function hasProfileApi(actor: Backend | null): boolean {
  return (
    !!actor &&
    typeof (actor as unknown as Partial<ProfileActor>).listPartnerProfiles ===
      "function"
  );
}

function api(actor: Backend): ProfileActor {
  if (!hasProfileApi(actor)) {
    throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
  }
  return actor as unknown as ProfileActor;
}

export async function setPartnerProfile(
  actor: Backend,
  tenantId: string,
  p: PartnerProfileInput,
): Promise<PartnerProfile> {
  const r = await api(actor).setPartnerProfile(
    tenantId,
    p.businessType,
    p.registrationNumber.trim(),
    p.representativeName.trim(),
    p.contactName.trim(),
    p.contactEmail.trim(),
  );
  if (r.__kind__ === "err") {
    throw new Error(r.err === "Admin only" ? "Chỉ admin được làm" : r.err);
  }
  return r.ok;
}

export async function listPartnerProfiles(
  actor: Backend,
  credential = "",
): Promise<Map<string, PartnerProfile>> {
  if (!hasProfileApi(actor)) return new Map();
  const r = await api(actor).listPartnerProfiles(credential);
  if (r.__kind__ === "err") throw new Error(r.err);
  return new Map(r.ok);
}

export async function countRestaurantsByTenant(
  actor: Backend,
): Promise<Map<string, number>> {
  if (!hasProfileApi(actor)) return new Map();
  const rows = await api(actor).countRestaurantsByTenant();
  return new Map(rows.map(([k, n]) => [k, Number(n)]));
}

/** Tên ĐỐI TÁC (pháp nhân) — sàn dùng tên này; chưa có thì tạm dùng thương hiệu. */
export function partnerName(t: Pick<Tenant, "companyName" | "name">): string {
  return t.companyName.trim() || t.name;
}

/**
 * Chủ tài khoản nhận tiền có đứng tên đối tác không (so không dấu, không
 * phân biệt hoa thường). Hộ kinh doanh / cá nhân: tên chủ hộ (người đại
 * diện) cũng hợp lệ. Chưa đủ dữ liệu để so → true (không cảnh báo).
 */
export function holderMatchesPartner(
  holder: string,
  legalName: string,
  representativeName = "",
): boolean {
  const h = slugify(holder);
  if (!h || !slugify(legalName)) return true;
  return (
    h === slugify(legalName) ||
    (!!representativeName && h === slugify(representativeName))
  );
}

// Đơn đăng ký đối tác — facade gọi canister.
//
// Bindings do Caffeine sinh ra từ backend; các hàm mới (submitPartnerApplication…)
// chỉ xuất hiện sau lần build kế tiếp, nên gọi qua kiểu cục bộ + ép kiểu actor
// (cùng cách facade tenant trong lib/canister.ts). Enum không có payload
// (#pending, #approve…) ở phía frontend là chuỗi trùng tên biến thể.

import type { Backend } from "@/backend";

export type BusinessType = "householdBusiness" | "individual" | "company";
export type ApplicationStatus =
  | "pending"
  | "needsInfo"
  | "approved"
  | "rejected";
export type ReviewDecision = "approve" | "reject" | "requestInfo";

export interface ApplicationInput {
  brandName: string;
  desiredSlug: string;
  cuisine: string;
  branchCount: bigint;
  storeAddress: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  businessType: BusinessType;
  legalName: string;
  taxCode: string;
  registrationNumber: string;
  representativeName: string;
  usesEInvoice: boolean;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  agreedTerms: boolean;
  agreedDataProcessing: boolean;
  agreedTaxWithholding: boolean;
  confirmedAccurate: boolean;
}

export interface PartnerApplication {
  applicationId: string;
  input: ApplicationInput;
  status: ApplicationStatus;
  adminNote: string;
  tenantId: string;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface ApplicationStatusView {
  applicationId: string;
  brandName: string;
  desiredSlug: string;
  status: ApplicationStatus;
  adminNote: string;
  createdAt: bigint;
  updatedAt: bigint;
}

type Result<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

interface PartnerApplicationActor {
  submitPartnerApplication(input: ApplicationInput): Promise<Result<string>>;
  getPartnerApplicationStatus(
    applicationId: string,
    contactEmail: string,
  ): Promise<ApplicationStatusView | null>;
  listPartnerApplications(
    statusFilter: ApplicationStatus | null,
  ): Promise<Result<PartnerApplication[]>>;
  reviewPartnerApplication(
    applicationId: string,
    decision: ReviewDecision,
    note: string,
  ): Promise<Result<PartnerApplication>>;
}

function api(actor: Backend): PartnerApplicationActor {
  const a = actor as unknown as Partial<PartnerApplicationActor>;
  if (typeof a.submitPartnerApplication !== "function") {
    throw new Error(
      "Hệ thống chưa sẵn sàng nhận đăng ký, vui lòng thử lại sau",
    );
  }
  return a as PartnerApplicationActor;
}

function unwrap<T>(r: Result<T>): T {
  if (r.__kind__ === "ok") return r.ok;
  throw new Error(r.err);
}

export async function submitPartnerApplication(
  actor: Backend,
  input: ApplicationInput,
): Promise<string> {
  return unwrap(await api(actor).submitPartnerApplication(input));
}

export async function getPartnerApplicationStatus(
  actor: Backend,
  applicationId: string,
  contactEmail: string,
): Promise<ApplicationStatusView | null> {
  return api(actor).getPartnerApplicationStatus(
    applicationId.trim(),
    contactEmail.trim(),
  );
}

export async function listPartnerApplications(
  actor: Backend,
  statusFilter: ApplicationStatus | null = null,
): Promise<PartnerApplication[]> {
  return unwrap(await api(actor).listPartnerApplications(statusFilter));
}

export async function reviewPartnerApplication(
  actor: Backend,
  applicationId: string,
  decision: ReviewDecision,
  note: string,
): Promise<PartnerApplication> {
  return unwrap(
    await api(actor).reviewPartnerApplication(applicationId, decision, note),
  );
}

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: "Chờ duyệt",
  needsInfo: "Cần bổ sung",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  householdBusiness: "Hộ kinh doanh",
  individual: "Cá nhân kinh doanh",
  company: "Doanh nghiệp",
};

// ---- Kiểm tra từng bước phía client (khớp lib/partner-application.mo) ----

export type ApplicationDraft = Omit<ApplicationInput, "branchCount"> & {
  branchCount: string;
};

export const EMPTY_DRAFT: ApplicationDraft = {
  brandName: "",
  desiredSlug: "",
  cuisine: "",
  branchCount: "1",
  storeAddress: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  businessType: "householdBusiness",
  legalName: "",
  taxCode: "",
  registrationNumber: "",
  representativeName: "",
  usesEInvoice: false,
  bankName: "",
  bankAccountNumber: "",
  bankAccountHolder: "",
  agreedTerms: false,
  agreedDataProcessing: false,
  agreedTaxWithholding: false,
  confirmedAccurate: false,
};

const digits = (s: string) => /^[0-9]+$/.test(s);

export function slugify(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateStep(
  step: number,
  d: ApplicationDraft,
  reserved: Set<string>,
): Record<string, string> {
  const e: Record<string, string> = {};
  const blank = (s: string) => s.trim() === "";
  if (step === 0) {
    if (blank(d.brandName)) e.brandName = "Nhập tên quán";
    if (blank(d.desiredSlug)) e.desiredSlug = "Nhập tên miền con";
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.desiredSlug))
      e.desiredSlug = "Chỉ dùng chữ thường không dấu, số và dấu gạch ngang";
    else if (reserved.has(d.desiredSlug))
      e.desiredSlug = "Tên này được dành riêng, hãy chọn tên khác";
    const n = Number(d.branchCount);
    if (!Number.isInteger(n) || n < 1 || n > 1000)
      e.branchCount = "Số cơ sở từ 1 đến 1000";
    if (blank(d.storeAddress)) e.storeAddress = "Nhập địa chỉ quán";
    if (blank(d.contactName)) e.contactName = "Nhập tên người liên hệ";
    const phone = d.contactPhone.replace(/^\+/, "");
    if (!digits(phone) || phone.length < 9 || phone.length > 11)
      e.contactPhone = "Số điện thoại 9–11 chữ số";
    if (!/^\S+@\S+\.\S+$/.test(d.contactEmail.trim()))
      e.contactEmail = "Email không hợp lệ";
  }
  if (step === 1) {
    if (blank(d.legalName)) e.legalName = "Nhập tên pháp lý";
    if (!digits(d.taxCode) || ![10, 13].includes(d.taxCode.length))
      e.taxCode = "Mã số thuế gồm 10 hoặc 13 chữ số";
    if (blank(d.representativeName))
      e.representativeName = "Nhập tên người đại diện";
  }
  if (step === 2) {
    if (blank(d.bankName)) e.bankName = "Nhập tên ngân hàng";
    if (
      !digits(d.bankAccountNumber) ||
      d.bankAccountNumber.length < 6 ||
      d.bankAccountNumber.length > 20
    )
      e.bankAccountNumber = "Số tài khoản 6–20 chữ số";
    if (blank(d.bankAccountHolder))
      e.bankAccountHolder = "Nhập tên chủ tài khoản";
    else if (
      !blank(d.legalName) &&
      slugify(d.bankAccountHolder) !== slugify(d.legalName)
    )
      e.bankAccountHolder =
        "Tên chủ tài khoản phải trùng tên pháp lý ở bước 2 (không dấu, không phân biệt hoa thường)";
  }
  if (step === 3) {
    if (!d.agreedTerms) e.agreedTerms = "Cần đồng ý";
    if (!d.agreedDataProcessing) e.agreedDataProcessing = "Cần đồng ý";
    if (!d.agreedTaxWithholding) e.agreedTaxWithholding = "Cần đồng ý";
    if (!d.confirmedAccurate) e.confirmedAccurate = "Cần xác nhận";
  }
  return e;
}

export function draftToInput(d: ApplicationDraft): ApplicationInput {
  return {
    ...d,
    brandName: d.brandName.trim(),
    desiredSlug: d.desiredSlug.trim(),
    cuisine: d.cuisine.trim(),
    storeAddress: d.storeAddress.trim(),
    contactName: d.contactName.trim(),
    contactPhone: d.contactPhone.trim(),
    contactEmail: d.contactEmail.trim(),
    legalName: d.legalName.trim(),
    taxCode: d.taxCode.trim(),
    registrationNumber: d.registrationNumber.trim(),
    representativeName: d.representativeName.trim(),
    bankName: d.bankName.trim(),
    bankAccountNumber: d.bankAccountNumber.trim(),
    bankAccountHolder: d.bankAccountHolder.trim(),
    branchCount: BigInt(d.branchCount),
  };
}

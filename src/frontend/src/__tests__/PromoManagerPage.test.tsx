// Trang "Quản lý khuyến mại" (gộp Khuyến mại / KM đăng ký / KM doanh số /
// Theo dõi KM): tổng quan, lọc, tóm tắt, quy tắc "đã có khách dùng", sửa /
// sao chép (tự dừng bản sao) / dừng / xoá.

import {
  formatDays,
  formatTimeSlots,
  programStatus,
  programSummary,
} from "@/components/promo/promo-model";
import { PromoManagerPage } from "@/pages/PromoManagerPage";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
})();
const past = "20200101";
const future = "20991231";

const gioRun = {
  tenantId: "t",
  code: "KM-TRUA",
  name: "Giờ vàng buổi trưa",
  active: true,
  startDate: past,
  endDate: future,
  daysOfWeek: [false, true, true, true, true, true, false],
  timeSlots: [{ startHour: 11n, startMinute: 0n, durationMinutes: 120n }],
  tiers: [{ minOrderValue: 100000n, discountAmount: 10000n }],
  enabledOnline: true,
  enabledCounter: false,
  dailyOrderLimit: 50n,
  perCustomerDailyLimit: 1n,
  termsUrl: "",
};
const regRun = {
  tenantId: "t",
  code: "DK-CHAO",
  name: "Chào bạn mới",
  active: true,
  startDate: past,
  endDate: future,
  voucherValue: 30000n,
  voucherValidDays: 7n,
  termsUrl: "",
};
const salesOff = {
  tenantId: "t",
  code: "DS-T9",
  name: "Thưởng tháng 9",
  active: false,
  startDate: past,
  endDate: future,
  voucherValidDays: 30n,
  enabledCounter: true,
  termsUrl: "",
  weeklyTiers: [],
  monthlyTiers: [{ minSales: 2000000n, voucherValue: 100000n }],
};

const m = () => ({ mutate: vi.fn(), isPending: false });
const muts = {
  createGio: m(),
  updateGio: m(),
  deleteGio: m(),
  stopGio: m(),
  createReg: m(),
  updateReg: m(),
  deleteReg: m(),
  stopReg: m(),
  createSales: m(),
  updateSales: m(),
  deleteSales: m(),
  stopSales: m(),
};

vi.mock("@/hooks/useQueries", () => ({
  usePromotions: () => ({ data: [gioRun], isLoading: false }),
  useRegistrationPromos: () => ({ data: [regRun], isLoading: false }),
  useSalesPromos: () => ({ data: [salesOff], isLoading: false }),
  useKmDailyCount: (c: string | null) => ({ data: c ? 23n : undefined }),
  useVoucherCountByProgram: (c: string | null) => ({
    data: c ? 128n : undefined,
  }),
  // KM-TRUA đã có khách dùng → không sửa / xoá được.
  useIsPromotionUsed: (c: string) => ({
    data: c === "KM-TRUA",
    isLoading: false,
  }),
  useIsRegistrationPromoUsed: () => ({ data: false, isLoading: false }),
  useIsSalesPromoUsed: () => ({ data: false, isLoading: false }),
  useCreatePromotion: () => muts.createGio,
  useUpdatePromotion: () => muts.updateGio,
  useDeletePromotion: () => muts.deleteGio,
  useStopPromotion: () => muts.stopGio,
  useCreateRegistrationPromo: () => muts.createReg,
  useUpdateRegistrationPromo: () => muts.updateReg,
  useDeleteRegistrationPromo: () => muts.deleteReg,
  useStopRegistrationPromo: () => muts.stopReg,
  useCreateSalesPromo: () => muts.createSales,
  useUpdateSalesPromo: () => muts.updateSales,
  useDeleteSalesPromo: () => muts.deleteSales,
  useStopSalesPromo: () => muts.stopSales,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Mở menu Radix (cần pointer events trong jsdom).
function openMenu(el: HTMLElement) {
  el.focus();
  fireEvent.keyDown(el, { key: "Enter" });
}

describe("PromoManagerPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("tổng quan 3 loại + danh sách chung, tóm tắt dễ đọc", () => {
    render(<PromoManagerPage />);
    expect(screen.getByTestId("promo.overview.gio")).toHaveTextContent("23/50");
    expect(screen.getByTestId("promo.overview.gio")).toHaveTextContent(
      "Đang chạy: Giờ vàng buổi trưa",
    );
    expect(screen.getByTestId("promo.overview.dangky")).toHaveTextContent(
      "128",
    );
    expect(screen.getByTestId("promo.overview.doanhso")).toHaveTextContent(
      "Không có chương trình đang chạy",
    );
    const card = screen.getByTestId("promo.card.KM-TRUA");
    expect(card).toHaveTextContent(
      "T2–T6 · 11:00–13:00 · đơn từ 100.000đ giảm 10.000đ",
    );
    expect(card).toHaveTextContent("Online");
    expect(screen.getByTestId("promo.status.DS-T9")).toHaveTextContent(
      "Đã dừng",
    );
  });

  it("lọc theo loại, trạng thái và tìm kiếm", () => {
    render(<PromoManagerPage />);
    fireEvent.click(screen.getByTestId("promo.kind.dangky"));
    expect(screen.getByTestId("promo.card.DK-CHAO")).toBeInTheDocument();
    expect(screen.queryByTestId("promo.card.KM-TRUA")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("promo.kind.all"));
    fireEvent.click(screen.getByTestId("promo.status_filter.off"));
    expect(screen.getByTestId("promo.card.DS-T9")).toBeInTheDocument();
    expect(screen.queryByTestId("promo.card.DK-CHAO")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("promo.status_filter.all"));
    fireEvent.change(screen.getByTestId("promo.search"), {
      target: { value: "km-trua" },
    });
    expect(screen.getByTestId("promo.card.KM-TRUA")).toBeInTheDocument();
    expect(screen.queryByTestId("promo.card.DS-T9")).not.toBeInTheDocument();
  });

  it("link cũ mở đúng loại (initialKind)", () => {
    render(<PromoManagerPage initialKind="doanhso" />);
    expect(screen.getByTestId("promo.card.DS-T9")).toBeInTheDocument();
    expect(screen.queryByTestId("promo.card.KM-TRUA")).not.toBeInTheDocument();
  });

  it("chương trình đã có khách dùng → không sửa được", () => {
    render(<PromoManagerPage />);
    expect(screen.getByTestId("promo.edit.KM-TRUA")).toBeDisabled();
    expect(screen.getByTestId("promo.card.KM-TRUA")).toHaveTextContent(
      "Đã có khách dùng",
    );
    expect(screen.getByTestId("promo.edit.DK-CHAO")).not.toBeDisabled();
  });

  it("sửa chương trình Đăng ký mới trong khung trượt → gọi update", async () => {
    render(<PromoManagerPage />);
    fireEvent.click(screen.getByTestId("promo.edit.DK-CHAO"));
    const editor = await screen.findByTestId("promo.editor");
    expect(within(editor).getByText("Sửa chương trình")).toBeInTheDocument();
    fireEvent.change(
      within(editor).getByTestId("registration_promo.form.name_input"),
      {
        target: { value: "Chào bạn mới 2" },
      },
    );
    fireEvent.click(
      within(editor).getByTestId("registration_promo.form.submit_button"),
    );
    await waitFor(() =>
      expect(muts.updateReg.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "DK-CHAO",
          active: true,
          input: expect.objectContaining({ name: "Chào bạn mới 2" }),
        }),
        expect.anything(),
      ),
    );
  });

  it("sao chép thành mới → tạo xong tự dừng bản sao", async () => {
    muts.createSales.mutate.mockImplementation((_input, opts) =>
      opts.onSuccess({ code: "DS-NEW", name: "x" }),
    );
    render(<PromoManagerPage />);
    openMenu(screen.getByTestId("promo.more.DS-T9"));
    fireEvent.click(await screen.findByTestId("promo.copy.DS-T9"));
    const editor = await screen.findByTestId("promo.editor");
    expect(editor).toHaveTextContent('Sao chép từ "Thưởng tháng 9"');
    fireEvent.click(
      within(editor).getByTestId("sales_promo.form.submit_button"),
    );
    await waitFor(() => expect(muts.createSales.mutate).toHaveBeenCalled());
    expect(muts.stopSales.mutate).toHaveBeenCalledWith("DS-NEW");
  });

  it("xoá có xác nhận", async () => {
    render(<PromoManagerPage />);
    openMenu(screen.getByTestId("promo.more.DK-CHAO"));
    fireEvent.click(await screen.findByTestId("promo.delete.DK-CHAO"));
    fireEvent.click(await screen.findByTestId("promo.delete_dialog.confirm"));
    expect(muts.deleteReg.mutate).toHaveBeenCalledWith(
      "DK-CHAO",
      expect.anything(),
    );
  });

  it("tạo chương trình mới theo loại chọn trong menu", async () => {
    render(<PromoManagerPage />);
    openMenu(screen.getByTestId("promo.create_button"));
    fireEvent.click(await screen.findByTestId("promo.create.gio"));
    const editor = await screen.findByTestId("promo.editor");
    expect(within(editor).getByTestId("promotion.form")).toBeInTheDocument();
  });
});

describe("promo-model", () => {
  it("gom ngày trong tuần", () => {
    expect(formatDays([false, true, true, true, true, true, false])).toBe(
      "T2–T6",
    );
    expect(formatDays([true, false, false, false, false, false, true])).toBe(
      "T7, CN",
    );
    expect(formatDays([true, true, true, true, true, true, true])).toBe(
      "Cả tuần",
    );
    expect(formatDays([false, true, false, true, false, false, false])).toBe(
      "T2, T4",
    );
  });

  it("khung giờ + trạng thái theo ngày", () => {
    expect(
      formatTimeSlots([
        { startHour: 23n, startMinute: 30n, durationMinutes: 60n },
      ]),
    ).toBe("23:30–00:30");
    expect(
      programStatus({ active: true, startDate: past, endDate: future }, today),
    ).toBe("run");
    expect(
      programStatus(
        { active: true, startDate: future, endDate: future },
        today,
      ),
    ).toBe("soon");
    expect(
      programStatus({ active: true, startDate: past, endDate: past }, today),
    ).toBe("expired");
    expect(
      programStatus({ active: false, startDate: past, endDate: future }, today),
    ).toBe("off");
  });

  it("tóm tắt Doanh số", () => {
    expect(programSummary({ kind: "doanhso", promo: salesOff })).toBe(
      "Tháng: từ 2.000.000đ → phiếu 100.000đ",
    );
  });
});

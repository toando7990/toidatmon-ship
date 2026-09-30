// Coverage cho DeliveryAddressSelector — không còn yêu cầu xác thực email
// (khách mới dùng địa chỉ lưu cục bộ qua lib/guest-identity.ts). Trạng
// thái: khách mới chưa có địa chỉ (form thêm ngay), đã xác thực nhưng
// chưa có địa chỉ (hướng dẫn sang /profile), có địa chỉ (tự chọn cái đầu
// tiên nếu khách chưa chọn gì) — cho cả 2 luồng.

import { DeliveryAddressSelector } from "@/components/DeliveryAddressSelector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockList = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  listCustomerAddresses: (...args: unknown[]) => mockList(...args),
}));

const mockListGuest = vi.fn();
const mockAddGuest = vi.fn();
vi.mock("@/lib/guest-identity", () => ({
  listGuestAddresses: (...args: unknown[]) => mockListGuest(...args),
  addGuestAddress: (...args: unknown[]) => mockAddGuest(...args),
}));

vi.mock("@/components/MapPicker", () => ({
  MapPicker: () => <div data-ocid="mock-map-picker" />,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
  }) => (
    <a data-href={to} {...rest}>
      {children}
    </a>
  ),
}));

const SAMPLE_ADDRESSES = [
  {
    id: 1,
    email: "a@test.com",
    label: "Nhà",
    address: "123 Le Loi",
    lat: 21.03,
    lng: 105.85,
  },
  {
    id: 2,
    email: "a@test.com",
    label: "Công ty",
    address: "456 Tran Phu",
    lat: 10.77,
    lng: 106.7,
  },
];

function renderSelector(
  props: Partial<Parameters<typeof DeliveryAddressSelector>[0]> = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DeliveryAddressSelector
        verifiedEmail={null}
        guestEmail="khach-abc@khach.bunbohue65.vn"
        selectedAddressId={null}
        onSelectAddress={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("DeliveryAddressSelector", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockListGuest.mockReturnValue([]);
  });

  it("shows the guest add-address form when there's no verified email and no local address yet", () => {
    mockListGuest.mockReturnValue([]);
    renderSelector({ verifiedEmail: null });
    expect(
      screen.getByTestId("delivery_address_selector.guest_add_form"),
    ).toBeInTheDocument();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("shows the empty state (with a link to add one) when verified but no addresses saved", async () => {
    mockList.mockResolvedValue([]);
    renderSelector({ verifiedEmail: "a@test.com" });

    await waitFor(() => {
      expect(
        screen.getByTestId("delivery_address_selector.empty_state"),
      ).toBeInTheDocument();
    });
  });

  it("auto-selects the first address when the customer hasn't chosen any yet", async () => {
    mockList.mockResolvedValue(SAMPLE_ADDRESSES);
    const onSelectAddress = vi.fn();
    renderSelector({
      verifiedEmail: "a@test.com",
      selectedAddressId: null,
      onSelectAddress,
    });

    await waitFor(() => {
      expect(onSelectAddress).toHaveBeenCalledWith(SAMPLE_ADDRESSES[0]);
    });
  });

  it("shows the currently-selected address and an edit link (verified)", async () => {
    mockList.mockResolvedValue(SAMPLE_ADDRESSES);
    renderSelector({ verifiedEmail: "a@test.com", selectedAddressId: 2 });

    await waitFor(() => {
      expect(
        screen.getByTestId("delivery_address_selector.selected_address_text"),
      ).toHaveTextContent("456 Tran Phu");
    });
    expect(
      screen.getByTestId("delivery_address_selector.edit_link"),
    ).toBeInTheDocument();
  });

  it("does not show the dropdown when there is only 1 saved address", async () => {
    mockList.mockResolvedValue([SAMPLE_ADDRESSES[0]]);
    renderSelector({ verifiedEmail: "a@test.com", selectedAddressId: 1 });

    await waitFor(() => {
      expect(
        screen.getByTestId("delivery_address_selector.selected_address_text"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("delivery_address_selector.select"),
    ).not.toBeInTheDocument();
  });

  it("shows the selected local address and an 'add another' button for a guest with saved addresses", () => {
    mockListGuest.mockReturnValue(SAMPLE_ADDRESSES);
    renderSelector({ verifiedEmail: null, selectedAddressId: 1 });

    expect(
      screen.getByTestId("delivery_address_selector.selected_address_text"),
    ).toHaveTextContent("123 Le Loi");
    expect(
      screen.getByTestId("delivery_address_selector.add_another_button"),
    ).toBeInTheDocument();
  });
});

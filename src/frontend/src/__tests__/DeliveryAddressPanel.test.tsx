// Coverage cho DeliveryAddressPanel — mock hoàn toàn MapPicker (đã có
// test riêng, xem MapPicker.test.tsx) và vps-client, tập trung vào luồng
// thêm/sửa/xoá địa chỉ.

import { DeliveryAddressPanel } from "@/components/DeliveryAddressPanel";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockList = vi.fn();
const mockAdd = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/vps-client", () => ({
  listCustomerAddresses: (...args: unknown[]) => mockList(...args),
  addCustomerAddress: (...args: unknown[]) => mockAdd(...args),
  updateCustomerAddress: (...args: unknown[]) => mockUpdate(...args),
  deleteCustomerAddress: (...args: unknown[]) => mockDelete(...args),
}));

vi.mock("@/components/MapPicker", () => ({
  MapPicker: ({
    onChange,
  }: {
    onChange: (lat: number, lng: number) => void;
  }) => (
    <button
      type="button"
      data-ocid="mock-map-picker"
      onClick={() => onChange(21.03, 105.85)}
    >
      Ghim vị trí giả lập
    </button>
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
    label: "",
    address: "456 Tran Phu",
    lat: 10.77,
    lng: 106.7,
  },
];

function renderPanel(email = "a@test.com") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <DeliveryAddressPanel email={email} />
    </QueryClientProvider>,
  );
}

describe("DeliveryAddressPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the empty state when there are no saved addresses", async () => {
    mockList.mockResolvedValue([]);
    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByTestId("delivery_address.empty_state"),
      ).toBeInTheDocument();
    });
  });

  it("lists all saved addresses", async () => {
    mockList.mockResolvedValue(SAMPLE_ADDRESSES);
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("123 Le Loi")).toBeInTheDocument();
      expect(screen.getByText("456 Tran Phu")).toBeInTheDocument();
    });
  });

  it("rejects submitting without picking a location on the map", async () => {
    mockList.mockResolvedValue([]);
    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByTestId("delivery_address.empty_state"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("delivery_address.add_button"));
    fireEvent.change(screen.getByTestId("delivery_address.address_input"), {
      target: { value: "123 Le Loi" },
    });
    fireEvent.click(screen.getByTestId("delivery_address.save_button"));

    expect(mockAdd).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("delivery_address.form.error"),
    ).toBeInTheDocument();
  });

  it("adds a new address with label, address, and picked coordinates", async () => {
    mockList.mockResolvedValue([]);
    mockAdd.mockResolvedValue({
      id: 1,
      email: "a@test.com",
      label: "Nhà",
      address: "123 Le Loi",
      lat: 21.03,
      lng: 105.85,
    });

    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByTestId("delivery_address.empty_state"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("delivery_address.add_button"));
    fireEvent.change(screen.getByTestId("delivery_address.label_input"), {
      target: { value: "Nhà" },
    });
    fireEvent.change(screen.getByTestId("delivery_address.address_input"), {
      target: { value: "123 Le Loi" },
    });
    fireEvent.click(screen.getByTestId("mock-map-picker"));
    fireEvent.click(screen.getByTestId("delivery_address.save_button"));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith("a@test.com", {
        label: "Nhà",
        address: "123 Le Loi",
        lat: 21.03,
        lng: 105.85,
      });
    });
  });

  it("edits an existing address, pre-filling the form", async () => {
    mockList.mockResolvedValue(SAMPLE_ADDRESSES);
    mockUpdate.mockResolvedValue(SAMPLE_ADDRESSES[0]);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("123 Le Loi")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("delivery_address.edit_button.1"));

    expect(screen.getByTestId("delivery_address.address_input")).toHaveValue(
      "123 Le Loi",
    );

    fireEvent.change(screen.getByTestId("delivery_address.address_input"), {
      target: { value: "123 Le Loi (sửa)" },
    });
    fireEvent.click(screen.getByTestId("delivery_address.save_button"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("a@test.com", 1, {
        label: "Nhà",
        address: "123 Le Loi (sửa)",
        lat: 21.03,
        lng: 105.85,
      });
    });
  });

  it("deletes an address when the delete button is clicked", async () => {
    mockList.mockResolvedValue(SAMPLE_ADDRESSES);
    mockDelete.mockResolvedValue(undefined);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("123 Le Loi")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("delivery_address.delete_button.1"));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("a@test.com", 1);
    });
  });
});

// Coverage cho MapPicker — Leaflet/bản đồ thật không thể test trong
// jsdom, mock hoàn toàn react-leaflet và xác nhận component gọi đúng
// onChange khi bấm bản đồ / dùng geolocation.

import { MapPicker } from "@/components/MapPicker";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let capturedClickHandler:
  | ((e: { latlng: { lat: number; lng: number } }) => void)
  | null = null;

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-ocid="mock-map-container">{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => <div data-ocid="mock-marker" />,
  useMap: () => ({ setView: vi.fn(), getZoom: () => 16 }),
  useMapEvents: (handlers: {
    click: (e: { latlng: { lat: number; lng: number } }) => void;
  }) => {
    capturedClickHandler = handlers.click;
    return null;
  },
}));

describe("MapPicker", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    capturedClickHandler = null;
  });

  it("calls onChange with the clicked coordinates", () => {
    const onChange = vi.fn();
    render(<MapPicker lat={null} lng={null} onChange={onChange} />);

    expect(capturedClickHandler).not.toBeNull();
    capturedClickHandler?.({ latlng: { lat: 21.03, lng: 105.85 } });

    expect(onChange).toHaveBeenCalledWith(21.03, 105.85);
  });

  it("does not show a marker or coordinates display when lat/lng are null", () => {
    render(<MapPicker lat={null} lng={null} onChange={vi.fn()} />);
    expect(screen.queryByTestId("mock-marker")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("map_picker.coordinates_display"),
    ).not.toBeInTheDocument();
  });

  it("shows a marker and coordinates display when lat/lng are set", () => {
    render(<MapPicker lat={21.03} lng={105.85} onChange={vi.fn()} />);
    expect(screen.getByTestId("mock-marker")).toBeInTheDocument();
    expect(
      screen.getByTestId("map_picker.coordinates_display"),
    ).toHaveTextContent("21.030000, 105.850000");
  });

  it("fills lat/lng from navigator.geolocation when 'Vị trí của tôi' is clicked", () => {
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 16.0544, longitude: 108.2022 } });
    });
    Object.defineProperty(global.navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    const onChange = vi.fn();

    render(<MapPicker lat={null} lng={null} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("map_picker.locate_button"));

    expect(onChange).toHaveBeenCalledWith(16.0544, 108.2022);
  });

  it("shows an error when the browser has no geolocation support", () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });

    render(<MapPicker lat={null} lng={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("map_picker.locate_button"));

    expect(screen.getByTestId("map_picker.locate_error")).toBeInTheDocument();
  });
});

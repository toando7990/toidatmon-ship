// MapPicker — bản đồ Leaflet + OpenStreetMap (KHÔNG cần API key) để khách
// tự ghim vị trí giao hàng, thay cho geocoding từ địa chỉ chữ (không có
// API geocoding nào được cấu hình trong dự án). Bấm/kéo trên bản đồ để
// đặt marker — trả toạ độ qua onChange, dùng thẳng cho Lalamove "Get
// Quotation" + tính nhà hàng gần nhất (không cần xử lý gì thêm).

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { LocateFixed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

// Vite/bundler thường không tự resolve đúng đường dẫn ảnh icon mặc định
// của Leaflet (thiết kế ban đầu cho môi trường không có bundler) — nếu
// không sửa, marker sẽ hiện ra là ô vuông vỡ ảnh. Đây là cách sửa chuẩn,
// phổ biến rộng rãi cho Leaflet + Vite/webpack.
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Trung tâm Hà Nội — dùng làm điểm bắt đầu khi chưa có toạ độ nào (khách
// thêm địa chỉ lần đầu, chưa từng ghim vị trí).
const DEFAULT_CENTER: [number, number] = [21.0285, 105.8542];

function ClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Di chuyển tâm bản đồ khi toạ độ đổi từ BÊN NGOÀI (VD bấm "Vị trí của
// tôi") — click trực tiếp trên bản đồ không cần việc này vì người dùng
// đang tự nhìn đúng chỗ họ vừa bấm rồi.
function RecenterOnChange({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ recenter khi lat/lng đổi, map instance ổn định không đổi
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng]);
  return null;
}

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

export function MapPicker({ lat, lng, onChange }: MapPickerProps) {
  const hasPosition = lat !== null && lng !== null;
  const center: [number, number] = hasPosition ? [lat, lng] : DEFAULT_CENTER;
  const [locateError, setLocateError] = useState<string | null>(null);
  // Ép remount MapContainer khi cần recenter mạnh (VD toạ độ ban đầu đến
  // muộn từ props sau lần render đầu) — react-leaflet không tự cập nhật
  // center prop sau khi mount.
  const mountedOnce = useRef(hasPosition);
  useEffect(() => {
    if (hasPosition) mountedOnce.current = true;
  }, [hasPosition]);

  function handleLocateMe() {
    setLocateError(null);
    if (!navigator.geolocation) {
      setLocateError("Trình duyệt không hỗ trợ lấy vị trí.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange(pos.coords.latitude, pos.coords.longitude),
      () =>
        setLocateError(
          "Không lấy được vị trí — vui lòng cho phép quyền vị trí hoặc ghim tay trên bản đồ.",
        ),
    );
  }

  return (
    <div className="flex flex-col gap-2" data-ocid="map_picker.container">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Bấm vào bản đồ để ghim đúng vị trí giao hàng.
        </p>
        <button
          type="button"
          onClick={handleLocateMe}
          data-ocid="map_picker.locate_button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-smooth hover:bg-secondary"
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          Vị trí của tôi
        </button>
      </div>
      {locateError && (
        <p
          className="text-xs text-destructive"
          data-ocid="map_picker.locate_error"
        >
          {locateError}
        </p>
      )}
      <div
        className="h-64 w-full overflow-hidden rounded-md border border-border"
        data-ocid="map_picker.map"
      >
        <MapContainer
          center={center}
          zoom={hasPosition ? 16 : 12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={onChange} />
          {hasPosition && (
            <>
              <Marker position={[lat, lng]} icon={defaultIcon} />
              <RecenterOnChange lat={lat} lng={lng} />
            </>
          )}
        </MapContainer>
      </div>
      {hasPosition && (
        <p
          className="text-center text-[11px] text-muted-foreground"
          data-ocid="map_picker.coordinates_display"
        >
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </p>
      )}
    </div>
  );
}

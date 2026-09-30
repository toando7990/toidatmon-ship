// lib/geo.ts — tính khoảng cách 2 điểm (công thức Haversine) và tìm nhà
// hàng gần nhất theo địa chỉ nhận hàng của khách (Phần 3/6 tái cấu trúc
// đặt món từ xa — khách không còn tự chọn nhà hàng, app tự chọn nhà hàng
// gần nhất). Chỉ dùng để CHỌN nhà hàng ở phía trình duyệt — khoảng cách
// đường chim bay này KHÔNG dùng cho phí ship/thời gian giao (việc đó do
// Lalamove "Get Quotation" tự tính theo đường đi thật, xem Phần 4).

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

interface HasCoordinates {
  lat: number;
  lng: number;
}

// Chưa nhập toạ độ (giá trị mặc định cũ khi thêm field lat/lng — xem
// Phần 1/6) — loại khỏi phép tính, không được coi là "gần nhất" một
// cách sai lệch vì toạ độ 0,0 (ngoài khơi Tây Phi) không phải vị trí
// thật của nhà hàng nào cả.
function hasValidCoordinates(r: HasCoordinates): boolean {
  return !(r.lat === 0 && r.lng === 0);
}

// Trả về phần tử gần nhất trong danh sách (theo đường chim bay) tính từ
// (lat, lng) — bỏ qua các phần tử chưa có toạ độ hợp lệ. null nếu danh
// sách rỗng hoặc không có phần tử nào có toạ độ hợp lệ.
export function findNearest<T extends HasCoordinates>(
  items: T[],
  lat: number,
  lng: number,
): T | null {
  const candidates = items.filter(hasValidCoordinates);
  if (candidates.length === 0) return null;
  let nearest = candidates[0];
  let nearestDistance = haversineDistanceKm(lat, lng, nearest.lat, nearest.lng);
  for (const item of candidates.slice(1)) {
    const distance = haversineDistanceKm(lat, lng, item.lat, item.lng);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }
  return nearest;
}

// Coverage cho lib/geo.ts — công thức Haversine + tìm phần tử gần nhất.

import { findNearest, haversineDistanceKm } from "@/lib/geo";
import { describe, expect, it } from "vitest";

describe("haversineDistanceKm", () => {
  it("returns 0 for the same point", () => {
    expect(haversineDistanceKm(21.0285, 105.8542, 21.0285, 105.8542)).toBe(0);
  });

  it("returns the approximate real-world distance Hà Nội -> TP.HCM (~1140-1160km)", () => {
    const d = haversineDistanceKm(21.0285, 105.8542, 10.7769, 106.7009);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1200);
  });
});

describe("findNearest", () => {
  const restaurants = [
    { restaurantId: "R1", lat: 21.03, lng: 105.85 }, // gần Hà Nội
    { restaurantId: "R2", lat: 10.78, lng: 106.7 }, // gần TP.HCM
    { restaurantId: "R3", lat: 0, lng: 0 }, // chưa nhập toạ độ — phải bị loại
  ];

  it("returns the restaurant closest to the given coordinates", () => {
    const nearest = findNearest(restaurants, 21.0285, 105.8542); // ở Hà Nội
    expect(nearest?.restaurantId).toBe("R1");
  });

  it("finds the correct nearest for a different location", () => {
    const nearest = findNearest(restaurants, 10.7769, 106.7009); // ở TP.HCM
    expect(nearest?.restaurantId).toBe("R2");
  });

  it("excludes restaurants with lat=0/lng=0 (not yet configured)", () => {
    // Chỉ còn R3 (0,0) trong danh sách — phải trả về null, KHÔNG được
    // coi R3 là "gần nhất" một cách sai lệch.
    const nearest = findNearest([restaurants[2]], 21.03, 105.85);
    expect(nearest).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(findNearest([], 21.03, 105.85)).toBeNull();
  });
});

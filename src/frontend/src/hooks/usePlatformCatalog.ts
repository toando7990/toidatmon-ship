// Dữ liệu trang chủ nhiều quán: mọi đối tác đang hoạt động, kèm thực đơn,
// chi nhánh, trạng thái mở cửa và khuyến mại hôm nay của từng đối tác.
// Mỗi đối tác là một nhóm truy vấn riêng (cache theo tenantId) để một quán
// lỗi không làm hỏng cả trang.

import {
  getCurrentPromotion,
  getItemImage,
  isStoreOpen,
  listMenus,
  listRestaurants,
  listTenants,
  useCanister,
} from "@/lib/canister";
import {
  type DishGroup,
  buildMatcher,
  groupOf,
  listDishGroupAssignments,
  listDishGroups,
} from "@/lib/dish-groups";
import { haversineDistanceKm } from "@/lib/geo";
import { listSoldOut } from "@/lib/partner-console";
import type { FeedDish, LatLng } from "@/lib/platform-feed";
import { getBestSellers } from "@/lib/vps-client";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

// Món hệ thống tự thêm cho mọi đối tác (lib/menu-seed.mo) — không bán lẻ.
const HIDDEN_ITEM_NAMES = new Set(["dụng cụ đựng đồ ăn"]);

export function usePlatformCatalog(location: LatLng | null) {
  const { actor, isFetching } = useCanister();
  const ready = !!actor && !isFetching;

  const tenantsQ = useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => (actor ? listTenants(actor, true) : Promise.resolve([])),
    enabled: ready,
    staleTime: 5 * 60 * 1000,
  });
  const tenants = useMemo(
    () => (tenantsQ.data ?? []).filter((t) => t.active),
    [tenantsQ.data],
  );

  // Nhóm món dùng chung + gán tay (canister) và món bán chạy 7 ngày (VPS).
  // Lỗi/chưa có → trang chủ vẫn chạy (nhóm theo danh mục quán, không xếp hạng).
  const groupsQ = useQuery({
    queryKey: ["platform", "dishGroups"],
    queryFn: () => (actor ? listDishGroups(actor) : Promise.resolve([])),
    enabled: ready,
    staleTime: 10 * 60 * 1000,
  });
  const assignQ = useQuery({
    queryKey: ["platform", "dishGroupAssignments"],
    queryFn: () =>
      actor
        ? listDishGroupAssignments(actor)
        : Promise.resolve(new Map<string, string>()),
    enabled: ready,
    staleTime: 10 * 60 * 1000,
  });
  const bestQ = useQuery({
    queryKey: ["platform", "bestSellers"],
    queryFn: () => getBestSellers(7, 200),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const matcher = useMemo(
    () => buildMatcher(groupsQ.data ?? ([] as DishGroup[])),
    [groupsQ.data],
  );
  const soldMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bestQ.data ?? []) m.set(`${b.tenantId}|${b.itemId}`, b.qty);
    return m;
  }, [bestQ.data]);

  const per = useQueries({
    queries: tenants.flatMap((t) => [
      {
        queryKey: ["platform", "menus", t.tenantId],
        queryFn: () =>
          actor ? listMenus(actor, t.tenantId) : Promise.resolve([]),
        enabled: ready,
        staleTime: 2 * 60 * 1000,
      },
      {
        queryKey: ["platform", "restaurants", t.tenantId],
        queryFn: () =>
          actor ? listRestaurants(actor, t.tenantId) : Promise.resolve([]),
        enabled: ready,
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: ["platform", "open", t.tenantId],
        queryFn: () =>
          actor ? isStoreOpen(actor, t.tenantId) : Promise.resolve(true),
        enabled: ready,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["platform", "soldOut", t.tenantId],
        queryFn: () =>
          actor
            ? listSoldOut(actor, t.tenantId)
            : Promise.resolve([] as string[]),
        enabled: ready,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["platform", "promo", t.tenantId],
        queryFn: () =>
          actor
            ? getCurrentPromotion(actor, t.tenantId)
            : Promise.resolve(null),
        enabled: ready,
        staleTime: 60_000,
      },
    ]),
  });

  // useQueries trả mảng mới mỗi lần render — dùng dấu thời gian dữ liệu làm
  // khoá để chỉ tính lại danh sách món khi có dữ liệu mới.
  const dataSig = per.map((q) => q.dataUpdatedAt).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataSig thay cho per
  const dishes = useMemo<FeedDish[]>(() => {
    const out: FeedDish[] = [];
    tenants.forEach((t, i) => {
      const menus = per[i * 5]?.data as
        | Awaited<ReturnType<typeof listMenus>>
        | undefined;
      const rests = per[i * 5 + 1]?.data as
        | Awaited<ReturnType<typeof listRestaurants>>
        | undefined;
      const open = per[i * 5 + 2]?.data as boolean | undefined;
      const promo = per[i * 5 + 4]?.data;
      const soldOut = new Set(
        (per[i * 5 + 3]?.data as string[] | undefined) ?? [],
      );
      if (!menus) return;
      const visibleRests = (rests ?? []).filter(
        (r) => r.visible && !(r.lat === 0 && r.lng === 0),
      );
      // Quán chưa có chi nhánh nào hiển thị thì chưa nhận đơn được → bỏ.
      if (rests && (rests ?? []).filter((r) => r.visible).length === 0) return;
      let distanceKm: number | null = null;
      if (location && visibleRests.length > 0) {
        distanceKm = Math.min(
          ...visibleRests.map((r) =>
            haversineDistanceKm(location.lat, location.lng, r.lat, r.lng),
          ),
        );
      }
      for (const m of menus) {
        if (!m.visible || m.price <= 0n || soldOut.has(m.itemId)) continue;
        if (HIDDEN_ITEM_NAMES.has(m.name.trim().toLowerCase())) continue;
        const key = `${t.tenantId}|${m.itemId}`;
        out.push({
          key,
          itemId: m.itemId,
          tenantId: t.tenantId,
          tenantSlug: t.slug,
          tenantName: t.name,
          name: m.name,
          category: m.category,
          price: Number(m.price),
          open: open !== false,
          hasPromo: !!promo,
          distanceKm,
          groupId: groupOf(
            t.tenantId,
            m.itemId,
            m.name,
            m.category,
            matcher,
            assignQ.data ?? new Map(),
          ),
          sold: soldMap.get(key) ?? 0,
        });
      }
    });
    return out;
  }, [tenants, dataSig, location, matcher, assignQ.data, soldMap]);

  const loading =
    !ready || tenantsQ.isLoading || per.some((q) => q.isLoading && !q.data);

  return {
    dishes,
    groups: matcher.groups,
    loading,
    error: tenantsQ.error,
    tenantCount: tenants.length,
  };
}

export function usePlatformItemImage(tenantId: string, itemId: string) {
  const { actor, isFetching } = useCanister();
  return useQuery({
    queryKey: ["platform", "itemImage", tenantId, itemId],
    queryFn: () =>
      actor ? getItemImage(actor, itemId) : Promise.resolve(null),
    enabled: !!actor && !isFetching,
    staleTime: 30 * 60 * 1000,
  });
}

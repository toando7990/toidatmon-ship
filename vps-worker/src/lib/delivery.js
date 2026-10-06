// ============================================================
// lib/delivery.js — điều phối tài xế 2 hãng Lalamove + Ahamove
// ============================================================
// Tôi Đặt Món: 2 hãng dùng TÀI KHOẢN CHUNG của nền tảng cho mọi đối tác
// (khoá trong .env); cài đặt chọn hãng là cài đặt chung của sàn. Mỗi đơn
// biết đối tác của mình (orders.tenant_id) → đọc đúng chi nhánh/trạng thái
// trên canister. Port từ bunbohue65-ship (giao diện đã duyệt 28/09/2026).
// Luồng (giao diện đã duyệt 28/09/2026):
//  1. /quote: báo giá các hãng dùng được, chọn hãng theo cài đặt → phí
//     ship hiện cho khách (quoteForCustomer).
//  2. Tạo đơn → dispatch(): báo giá lại (quotation Lalamove hết hạn sau
//     ~5 phút), chọn hãng, đặt tài xế. Hãng đầu lỗi → đặt ngay hãng kia.
//  3. tick() mỗi 30 giây:
//     - làm mới trạng thái lượt đang chạy (dự phòng khi webhook chưa có);
//     - quá failoverMinutes vẫn "Đang tìm tài xế" → huỷ, chuyển hãng kia;
//     - hãng huỷ / hết hạn và bật redispatchOnCancel → đặt hãng kia.
//     Tối đa 2 lượt / đơn (1 lần chuyển). Khách không trả thêm phí.
//  4. Webhook Ahamove (/webhook/ahamove) → làm mới ngay đơn đó.
// Cờ an toàn: chỉ hãng có LALAMOVE_AUTO_DISPATCH=true /
// AHAMOVE_AUTO_DISPATCH=true mới được TỰ ĐẶT tài xế thật (phát sinh phí).
// ============================================================

const canister = require('./canister');
const lalamove = require('./lalamove');
const ahamove = require('./ahamove');
const rules = require('./delivery-rules');

const SETTINGS_KEY = 'delivery';
const RR_KEY = 'delivery_rr';
const WEBHOOK_KEY = 'ahamove_webhook_last';
const QUOTE_TIMEOUT_MS = 8000;
const REFRESH_EVERY_MS = 45 * 1000;
const UNCERTAIN_PREFIX = 'KHÔNG RÕ KẾT QUẢ: ';
const FINAL_ORDER_STATUSES = new Set(['cancelled', 'completed', 'pickedUp']);

// Bộ chuyển đổi cho test (thay lalamove/ahamove/canister giả).
const deps = { lalamove, ahamove, canister, now: () => Date.now() };

// ---------- Cài đặt ----------
function readSetting(db, key) {
  const row = db.prepare('SELECT value, updated_at, updated_by FROM app_settings WHERE key = ?').get(key);
  if (!row) return null;
  try {
    return { value: JSON.parse(row.value), updatedAt: row.updated_at, updatedBy: row.updated_by };
  } catch {
    return null;
  }
}
function writeSetting(db, key, value, by) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(key, JSON.stringify(value), deps.now(), String(by || ''));
}

function getSettings(db) {
  const r = readSetting(db, SETTINGS_KEY);
  return rules.sanitizeSettings(r ? r.value : null);
}
function setSettings(db, input, by) {
  const s = rules.sanitizeSettings({ ...getSettings(db), ...(input || {}) });
  writeSetting(db, SETTINGS_KEY, s, by);
  return s;
}

function rrCounter(db) {
  const r = readSetting(db, RR_KEY);
  return r && Number.isFinite(Number(r.value)) ? Number(r.value) : 0;
}
function bumpRr(db) {
  writeSetting(db, RR_KEY, rrCounter(db) + 1, 'system');
}

function client(p) {
  return p === 'lalamove' ? deps.lalamove : deps.ahamove;
}
function autoDispatchFlag(p) {
  return process.env[p === 'lalamove' ? 'LALAMOVE_AUTO_DISPATCH' : 'AHAMOVE_AUTO_DISPATCH'] === 'true';
}
function enabledInSettings(settings, p) {
  return p === 'lalamove' ? settings.lalamoveEnabled : settings.ahamoveEnabled;
}
// Hãng được TỰ ĐẶT tài xế thật.
function dispatchProviders(settings) {
  return rules.PROVIDERS.filter(
    (p) => client(p).isConfigured() && enabledInSettings(settings, p) && autoDispatchFlag(p),
  );
}
// Hãng dùng để báo phí cho khách: hãng tự đặt được; nếu chưa bật tự đặt
// hãng nào thì mọi hãng đủ khoá + đang bật (giữ hành vi cũ: vẫn báo phí
// Lalamove khi LALAMOVE_AUTO_DISPATCH tắt).
function quoteProviders(settings) {
  const d = dispatchProviders(settings);
  if (d.length > 0) return d;
  return rules.PROVIDERS.filter((p) => client(p).isConfigured() && enabledInSettings(settings, p));
}

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      t = setTimeout(() => reject(new Error(`${label} quá ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

// Báo giá song song. stops: { pickup:{lat,lng,address}, drop:{lat,lng,address} }
async function quoteAll(providers, stops) {
  const out = {};
  const errors = {};
  await Promise.all(
    providers.map(async (p) => {
      try {
        if (p === 'lalamove') {
          const q = await withTimeout(
            deps.lalamove.getQuotation({
              pickupLat: stops.pickup.lat,
              pickupLng: stops.pickup.lng,
              pickupAddress: stops.pickup.address,
              dropLat: stops.drop.lat,
              dropLng: stops.drop.lng,
              dropAddress: stops.drop.address,
            }),
            QUOTE_TIMEOUT_MS,
            'Lalamove',
          );
          out.lalamove = q;
        } else {
          out.ahamove = await withTimeout(
            deps.ahamove.estimate({ pickup: stops.pickup, drop: stops.drop }),
            QUOTE_TIMEOUT_MS,
            'Ahamove',
          );
        }
      } catch (e) {
        errors[p] = e.message;
        console.warn(`[delivery] báo giá ${p} lỗi:`, e.message);
      }
    }),
  );
  return { quotes: out, errors };
}

// Phí ship hiện cho khách lúc xem giỏ hàng (không tăng bộ đếm xoay vòng).
async function quoteForCustomer(db, stops) {
  const settings = getSettings(db);
  const providers = quoteProviders(settings);
  if (providers.length === 0) return null;
  const { quotes } = await quoteAll(providers, stops);
  const { order } = rules.chooseProviders(settings, providers, quotes, rrCounter(db));
  if (order.length === 0) return null;
  const provider = order[0];
  return { provider, quote: quotes[provider], quotes };
}

// ---------- Đặt tài xế ----------
const inflight = new Set(); // chống đặt trùng cùng 1 đơn

function hasCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

async function loadContext(db, orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
  if (!order) return { error: 'Không tìm thấy đơn' };
  if (['cancelled', 'completed'].includes(order.booking_status)) return { error: `Đơn đã ${order.booking_status}` };
  if (order.is_counter) return { error: 'Đơn tại quầy không giao hàng' };
  // Trạng thái thật trên canister (khách/nhân viên có thể đã huỷ đơn).
  const bs = await syncBookingStatus(db, orderId);
  // pickedUp: tài xế (kể cả tài xế nhà hàng tự gọi) đã thanh toán + lấy món.
  if (FINAL_ORDER_STATUSES.has(bs)) return { error: `Đơn đã ${bs}` };
  if (!hasCoords(Number(order.cus_lat), Number(order.cus_lng))) return { error: 'Đơn không có toạ độ khách' };
  const restaurants = await deps.canister.listRestaurants(order.tenant_id);
  const r = restaurants.find((x) => x.restaurantId === order.restaurant_id);
  if (!r || !hasCoords(Number(r.lat), Number(r.lng))) return { error: 'Nhà hàng chưa có toạ độ' };
  return { order, restaurant: r };
}

function remarksFor(order) {
  const qrLine = process.env.VPS_PUBLIC_URL
    ? `\nQR nhận hàng (bấm link):\n${process.env.VPS_PUBLIC_URL.replace(/\/+$/, '')}/q/${order.order_id}\n`
    : '';
  // Mã nhận hàng ĐẦU TIÊN, in hoa, 1 dòng riêng — tài xế đọc cho nhân
  // viên, và "Quét màn hình tài xế" ở /driver đọc chữ trúng hơn.
  return `MÃ NHẬN HÀNG: ${order.pickup_code}\nĐơn ${order.order_id}${qrLine}`;
}

async function placeWith(provider, ctx, quote) {
  const { order, restaurant } = ctx;
  const remarks = remarksFor(order);
  if (provider === 'lalamove') {
    const placed = await deps.lalamove.placeOrder({
      quotationId: quote.quotationId,
      pickupStopId: quote.pickupStopId,
      dropStopId: quote.dropStopId,
      senderName: restaurant.name || 'Nhà hàng',
      senderPhone: restaurant.phone || '',
      recipientName: order.cus_name,
      recipientPhone: order.cus_phone,
      recipientRemarks: remarks,
    });
    return {
      externalId: placed.lalamoveOrderId,
      rawStatus: placed.status || 'ASSIGNING_DRIVER',
      driverId: placed.driverId || '',
      shareLink: placed.shareLink || '',
      fee: quote.feeVnd,
    };
  }
  const placed = await deps.ahamove.createOrder({
    pickup: {
      lat: restaurant.lat,
      lng: restaurant.lng,
      address: restaurant.address,
      name: restaurant.name || 'Nhà hàng',
      phone: restaurant.phone || '',
      remarks,
    },
    drop: {
      lat: Number(order.cus_lat),
      lng: Number(order.cus_lng),
      address: order.cus_address,
      name: order.cus_name,
      phone: order.cus_phone,
      remarks: `Đơn ${order.order_id}`,
    },
    remarks,
    trackingNumber: order.order_id,
  });
  return {
    externalId: placed.orderId,
    rawStatus: placed.status || 'ASSIGNING',
    driverId: '',
    shareLink: placed.shareLink || '',
    fee: placed.feeVnd ?? quote.feeVnd,
  };
}

function attemptsOf(db, orderId) {
  return db.prepare('SELECT * FROM deliveries WHERE order_id = ? ORDER BY attempt').all(orderId);
}

function insertAttempt(db, orderId, attempt, provider, data) {
  const now = deps.now();
  const unified = data.unified || rules.unifyStatus(provider, { status: data.rawStatus });
  const info = db.prepare(
    `INSERT INTO deliveries (order_id, attempt, provider, external_id, raw_status, unified, driver_id,
      share_link, fee, reason, end_reason, ended, created_at, updated_at, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    orderId, attempt, provider, data.externalId || '', data.rawStatus || '', unified, data.driverId || '',
    data.shareLink || '', data.fee ?? null, data.reason || '', data.endReason || '', data.ended ? 1 : 0,
    now, now, now,
  );
  if (!data.ended) {
    db.prepare('UPDATE orders SET delivery_provider = ?, delivery_order_id = ?, updated_at = ? WHERE order_id = ?')
      .run(provider, data.externalId || '', now, orderId);
    if (provider === 'lalamove') {
      // Giữ cột cũ cho các chỗ còn đọc lalamove_* (route /lalamove-status).
      db.prepare(
        `UPDATE orders SET lalamove_order_id = ?, lalamove_driver_id = ?, lalamove_share_link = ?,
         lalamove_status = ? WHERE order_id = ?`,
      ).run(data.externalId || '', data.driverId || '', data.shareLink || '', data.rawStatus || '', orderId);
    }
  }
  return info.lastInsertRowid;
}

// Lỗi RÕ RÀNG từ hãng (HTTP 4xx) = chắc chắn KHÔNG tạo đơn → được thử hãng
// kia ngay. Lỗi mạng / hết giờ chờ / 5xx = KHÔNG BIẾT hãng đã tạo đơn hay
// chưa → KHÔNG đặt hãng kia (tránh 2 tài xế + 2 lần phí cho 1 đơn).
function isDefiniteRejection(e) {
  if (e && e.preRequest) return true; // lỗi trước khi gửi (VD lấy token)
  const st = Number(e && e.status);
  return Number.isFinite(st) && st >= 400 && st < 500;
}

// dispatch — đặt tài xế cho 1 đơn. opts.exclude: hãng không dùng;
// opts.reason: ghi chú lượt mới (hiện cho khách khi chuyển hãng);
// opts.replacing + opts.beforePlace: chuyển hãng — báo giá hãng mới XONG
// mới gọi beforePlace() (huỷ lượt cũ); beforePlace lỗi → giữ lượt cũ.
// Trả { ok, provider?, error? }. KHÔNG throw.
async function dispatch(db, orderId, opts = {}) {
  if (inflight.has(orderId)) return { ok: false, error: 'Đang đặt tài xế cho đơn này' };
  inflight.add(orderId);
  try {
    const prior = attemptsOf(db, orderId);
    if (prior.some((d) => !d.ended && d.id !== opts.replacing)) return { ok: false, error: 'Đơn đang có tài xế' };
    if (prior.some((d) => d.end_reason && d.end_reason.startsWith(UNCERTAIN_PREFIX))) {
      return { ok: false, error: 'Lượt trước không rõ kết quả — cần kiểm tra thủ công' };
    }
    if (prior.filter((d) => d.unified !== 'place_failed').length >= rules.MAX_ATTEMPTS) {
      return { ok: false, error: 'Đã chuyển hãng 1 lần' };
    }
    const settings = getSettings(db);
    const exclude = new Set(opts.exclude || []);
    const providers = dispatchProviders(settings).filter((p) => !exclude.has(p));
    if (providers.length === 0) return { ok: false, error: 'Không có hãng nào bật tự đặt tài xế' };

    const ctx = await loadContext(db, orderId);
    if (ctx.error) return { ok: false, error: ctx.error };
    const stops = {
      pickup: { lat: Number(ctx.restaurant.lat), lng: Number(ctx.restaurant.lng), address: ctx.restaurant.address },
      drop: { lat: Number(ctx.order.cus_lat), lng: Number(ctx.order.cus_lng), address: ctx.order.cus_address },
    };
    const { quotes, errors } = await quoteAll(providers, stops);
    const { order: plan, usedRoundRobin } = rules.chooseProviders(settings, providers, quotes, rrCounter(db));
    if (plan.length === 0) {
      const msg = Object.entries(errors).map(([p, e]) => `${rules.PROVIDER_NAMES[p]}: ${e}`).join('; ');
      return { ok: false, error: `Không báo giá được (${msg || 'không rõ'})` };
    }
    if (opts.beforePlace) {
      try {
        await opts.beforePlace();
      } catch (e) {
        return { ok: false, error: `Không huỷ được lượt cũ: ${e.message}` };
      }
    }
    if (usedRoundRobin) bumpRr(db);

    let attempt = prior.length;
    let reason = opts.reason || '';
    for (const p of plan) {
      attempt += 1;
      try {
        const placed = await placeWith(p, ctx, quotes[p]);
        insertAttempt(db, orderId, attempt, p, { ...placed, reason });
        console.log(`[delivery] ${orderId}: đặt ${p} thành công → ${placed.externalId}`);
        return { ok: true, provider: p };
      } catch (e) {
        const definite = isDefiniteRejection(e);
        console.error(`[delivery] ${orderId}: đặt ${p} lỗi (${definite ? 'hãng từ chối' : 'không rõ kết quả'}):`, e.message);
        insertAttempt(db, orderId, attempt, p, {
          unified: 'place_failed',
          reason,
          endReason: `${definite ? '' : UNCERTAIN_PREFIX}${e.message}`.slice(0, 300),
          ended: true,
          fee: quotes[p]?.feeVnd,
        });
        if (!definite) {
          return { ok: false, error: `Không rõ ${rules.PROVIDER_NAMES[p]} đã nhận đơn chưa (${e.message}) — kiểm tra app ${rules.PROVIDER_NAMES[p]}` };
        }
        reason = `${rules.PROVIDER_NAMES[p]} không đặt được tài xế — đã chuyển sang hãng khác`;
      }
    }
    return { ok: false, error: 'Không đặt được tài xế ở hãng nào' };
  } catch (e) {
    console.error('[delivery] dispatch lỗi', orderId, e.message);
    return { ok: false, error: e.message };
  } finally {
    inflight.delete(orderId);
  }
}

// ---------- Cập nhật trạng thái ----------
function applyUpdate(db, row, info) {
  const now = deps.now();
  // Đọc lại dòng (có thể vừa bị tick kết thúc trong lúc chờ mạng).
  const fresh = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(row.id);
  if (!fresh || fresh.ended) return { row: fresh || row, endedNow: false };
  // Hãng trả thiếu trạng thái → giữ trạng thái cũ (không lùi về bước 0).
  const status = info.status || fresh.raw_status;
  const unified = rules.unifyStatus(fresh.provider, { ...info, status });
  const set = {
    raw_status: status,
    sub_status: info.subStatus ?? fresh.sub_status,
    drop_status: info.dropStatus ?? fresh.drop_status,
    unified,
    driver_id: info.driverId || fresh.driver_id,
    driver_name: info.driverName || fresh.driver_name,
    driver_phone: info.driverPhone || fresh.driver_phone,
    driver_plate: info.driverPlate || fresh.driver_plate,
    share_link: info.shareLink || fresh.share_link,
    assigned_at: fresh.assigned_at ?? (['to_pickup', 'at_pickup', 'delivering', 'near_drop', 'delivered'].includes(unified) ? now : null),
    picked_at: fresh.picked_at ?? (['delivering', 'near_drop', 'delivered'].includes(unified) ? now : null),
    completed_at: fresh.completed_at ?? (unified === 'delivered' ? now : null),
    ended: rules.TERMINAL.has(unified) ? 1 : 0,
    end_reason: rules.TERMINAL.has(unified) ? (info.cancelComment || rules.UNIFIED_LABELS[unified]) : fresh.end_reason,
  };
  db.prepare(
    `UPDATE deliveries SET raw_status=@raw_status, sub_status=@sub_status, drop_status=@drop_status,
      unified=@unified, driver_id=@driver_id, driver_name=@driver_name, driver_phone=@driver_phone,
      driver_plate=@driver_plate, share_link=@share_link, assigned_at=@assigned_at, picked_at=@picked_at,
      completed_at=@completed_at, ended=@ended, end_reason=@end_reason, updated_at=@now, refreshed_at=@now
     WHERE id=@id AND ended = 0`,
  ).run({ ...set, now, id: fresh.id });
  if (fresh.provider === 'lalamove') {
    db.prepare(
      `UPDATE orders SET lalamove_status = ?, lalamove_driver_id = ?, lalamove_share_link = ? WHERE order_id = ? AND lalamove_order_id = ?`,
    ).run(set.raw_status, set.driver_id, set.share_link, fresh.order_id, fresh.external_id);
  }
  const after = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(fresh.id);
  return { row: after, endedNow: !!after.ended };
}

async function fetchInfo(row) {
  if (row.provider === 'lalamove') {
    const d = await deps.lalamove.getOrderDetails(row.external_id);
    const info = { status: d.status, driverId: d.driverId, shareLink: d.shareLink };
    // Lấy tên/SĐT/biển số tài xế 1 lần khi vừa có tài xế.
    if (d.driverId && (!row.driver_name || d.driverId !== row.driver_id)) {
      try {
        const drv = await deps.lalamove.getDriver(row.external_id, d.driverId);
        info.driverName = drv.name;
        info.driverPhone = drv.phone;
        info.driverPlate = drv.plate;
      } catch (e) {
        console.warn('[delivery] lalamove getDriver lỗi', row.external_id, e.message);
      }
    }
    return info;
  }
  return deps.ahamove.getOrder(row.external_id);
}

// Làm mới lỗi liên tục (VD hãng không còn tìm thấy đơn) quá 15 phút → thôi theo dõi.
const refreshFailSince = new Map();

// Làm mới 1 lượt đang chạy; nếu hãng huỷ → tự đặt hãng kia.
// opts.background: đặt hãng kia chạy nền (dùng khi gọi từ HTTP request).
async function refreshRow(db, row, opts = {}) {
  let updated;
  let endedNow = false;
  try {
    ({ row: updated, endedNow } = applyUpdate(db, row, await fetchInfo(row)));
    refreshFailSince.delete(row.id);
  } catch (e) {
    db.prepare('UPDATE deliveries SET refreshed_at = ? WHERE id = ?').run(deps.now(), row.id);
    console.warn('[delivery] làm mới lỗi', row.provider, row.external_id, e.message);
    const since = refreshFailSince.get(row.id) || deps.now();
    refreshFailSince.set(row.id, since);
    if (deps.now() - since > 15 * 60 * 1000) {
      db.prepare(`UPDATE deliveries SET ended = 1, unified = 'failed', end_reason = ?, updated_at = ? WHERE id = ? AND ended = 0`)
        .run(`Không đọc được trạng thái từ ${rules.PROVIDER_NAMES[row.provider]}: ${e.message}`.slice(0, 300), deps.now(), row.id);
      refreshFailSince.delete(row.id);
    }
    return db.prepare('SELECT * FROM deliveries WHERE id = ?').get(row.id) || row;
  }
  // Chỉ lần làm mới NÀY kết thúc lượt (hãng huỷ) mới đặt hãng kia.
  if (endedNow && updated.unified === 'cancelled' && !updated.legacy) {
    const settings = getSettings(db);
    if (settings.redispatchOnCancel) {
      const run = () =>
        dispatch(db, row.order_id, {
          exclude: [row.provider],
          reason: `${rules.PROVIDER_NAMES[row.provider]} huỷ / không tìm được tài xế — đã tự chuyển sang hãng khác`,
        });
      if (opts.background) setImmediate(() => { run().catch(() => {}); });
      else await run();
    }
  }
  return updated;
}

// Trạng thái đơn trên canister (nguồn chính — huỷ/hoàn thành ghi ở đó).
// null = không đọc được (canister chỉ giữ đơn trong ngày, lỗi mạng…).
async function canisterBookingStatus(db, orderId) {
  try {
    const t = db.prepare('SELECT tenant_id FROM orders WHERE order_id = ?').get(orderId);
    const r = await deps.canister.getOrderStatus(t ? t.tenant_id : '', orderId);
    const bs = r && r.ok && r.ok.bookingStatus;
    if (!bs) return null;
    return Object.keys(bs)[0] || null;
  } catch {
    return null;
  }
}
// Đồng bộ trạng thái huỷ/hoàn thành từ canister về SQLite (trước đây VPS
// chỉ tự huỷ đơn quá hạn, không biết đơn bị huỷ trên canister).
async function syncBookingStatus(db, orderId) {
  const bs = await canisterBookingStatus(db, orderId);
  if (bs === 'cancelled' || bs === 'completed') {
    db.prepare(`UPDATE orders SET booking_status = ?, updated_at = ? WHERE order_id = ? AND booking_status NOT IN ('cancelled', 'completed')`)
      .run(bs, deps.now(), orderId);
  }
  return bs;
}

// Đơn bị huỷ (trên canister hoặc tự huỷ quá hạn) khi tài xế còn chưa lấy
// hàng → huỷ luôn bên hãng để tài xế khỏi chạy tới quán. Huỷ lỗi → thử
// lại các nhịp sau (tối đa 10 phút).
const cancelFailSince = new Map();
async function cancelForCancelledOrders(db) {
  const active = db.prepare(
    `SELECT d.*, o.booking_status AS order_status FROM deliveries d JOIN orders o ON o.order_id = d.order_id
     WHERE d.ended = 0`,
  ).all();
  for (const row of active) {
    let status = row.order_status;
    if (status !== 'cancelled') status = (await syncBookingStatus(db, row.order_id)) || status;
    if (status !== 'cancelled') continue;
    const canCancel = ['finding', 'to_pickup', 'at_pickup'].includes(row.unified);
    let done = !canCancel;
    if (canCancel) {
      try {
        await client(row.provider).cancelOrder(row.external_id, 'Khách huỷ đơn');
        done = true;
      } catch (e) {
        console.warn('[delivery] huỷ theo đơn đã huỷ lỗi', row.provider, row.external_id, e.message);
        const since = cancelFailSince.get(row.id) || deps.now();
        cancelFailSince.set(row.id, since);
        if (deps.now() - since > 10 * 60 * 1000) done = true; // thôi thử
      }
    }
    if (done) {
      cancelFailSince.delete(row.id);
      db.prepare(`UPDATE deliveries SET ended = 1, unified = CASE WHEN ? THEN 'cancelled' ELSE unified END,
        end_reason = 'Đơn đã huỷ trong hệ thống', updated_at = ? WHERE id = ?`).run(canCancel ? 1 : 0, deps.now(), row.id);
    }
  }
}

// Đơn giao tận nơi CHƯA từng đặt được lượt nào (VD lúc tạo đơn canister /
// hãng tạm lỗi mạng, hoặc VPS khởi động lại ngay sau khi tạo đơn) → thử
// lại mỗi 2 phút, trong 20 phút đầu. Không thử lại đơn đã có lượt
// "không đặt được" (tránh đặt lặp).
const retryAt = new Map();
async function retryUndispatched(db, settings) {
  if (dispatchProviders(settings).length === 0) return;
  const now = deps.now();
  const rows = db.prepare(
    `SELECT o.order_id FROM orders o
     WHERE o.cus_lat IS NOT NULL AND o.cus_lng IS NOT NULL
       AND o.is_counter = 0
       AND o.booking_status NOT IN ('cancelled', 'completed')
       AND o.created_at >= ? AND o.created_at <= ?
       AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = o.order_id)`,
  ).all(now - 20 * 60 * 1000, now - 60 * 1000);
  for (const { order_id: id } of rows) {
    if (now - (retryAt.get(id) || 0) < 2 * 60 * 1000) continue;
    retryAt.set(id, now);
    const r = await dispatch(db, id);
    console.log(`[delivery] thử lại đặt tài xế ${id}:`, r.ok ? r.provider : r.error);
  }
  for (const [id, t] of retryAt) if (now - t > 30 * 60 * 1000) retryAt.delete(id);
}

// tick — gọi mỗi 30 giây.
async function tick(db) {
  const now = deps.now();
  const settings = getSettings(db);
  await cancelForCancelledOrders(db);
  await retryUndispatched(db, settings);
  const rows = db.prepare(
    `SELECT d.* FROM deliveries d JOIN orders o ON o.order_id = d.order_id
     WHERE d.ended = 0 AND o.booking_status <> 'cancelled'`,
  ).all();
  for (const row of rows) {
    let cur = row;
    if (now - (row.refreshed_at || 0) >= REFRESH_EVERY_MS) cur = await refreshRow(db, row);
    if (!cur || cur.ended || cur.legacy) continue;
    // Đơn đã có người lấy món / hoàn thành / huỷ → chỉ theo dõi, không chuyển hãng.
    if (db.prepare('SELECT booking_status FROM orders WHERE order_id = ?').get(cur.order_id)?.booking_status === 'completed') continue;
    const waitedMs = now - cur.created_at;
    if (cur.unified === 'finding' && waitedMs >= settings.failoverMinutes * 60 * 1000) {
      const others = dispatchProviders(settings).filter((p) => p !== cur.provider);
      const used = attemptsOf(db, cur.order_id).filter((d) => d.unified !== 'place_failed').length;
      if (others.length === 0 || used >= rules.MAX_ATTEMPTS) continue; // không có hãng để chuyển
      if (FINAL_ORDER_STATUSES.has(await canisterBookingStatus(db, cur.order_id))) continue;
      // Báo giá hãng mới TRƯỚC; chỉ khi có giá mới huỷ lượt cũ rồi đặt.
      const r = await dispatch(db, cur.order_id, {
        exclude: [cur.provider],
        replacing: cur.id,
        reason: `${rules.PROVIDER_NAMES[cur.provider]} chưa có tài xế sau ${settings.failoverMinutes} phút — đã tự chuyển sang hãng khác`,
        beforePlace: async () => {
          await client(cur.provider).cancelOrder(cur.external_id, 'Không có tài xế nhận đơn');
          db.prepare(`UPDATE deliveries SET ended = 1, unified = 'cancelled', end_reason = ?, updated_at = ? WHERE id = ?`)
            .run(`Chưa có tài xế sau ${settings.failoverMinutes} phút`, deps.now(), cur.id);
        },
      });
      if (!r.ok) {
        console.warn('[delivery] chuyển hãng không được', cur.order_id, r.error);
        // Huỷ lượt cũ lỗi (VD tài xế vừa nhận) → làm mới lại để thấy trạng thái thật.
        const still = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(cur.id);
        if (still && !still.ended) await refreshRow(db, { ...still, refreshed_at: 0 });
      }
    }
  }
}

// Webhook Ahamove → làm mới ngay (không tin dữ liệu gửi tới, đọc lại qua API).
async function onAhamoveWebhook(db, body) {
  const raw = String((body && (body._id || body.order_id)) || '').trim();
  if (!raw) return { ok: false, error: 'Thiếu _id' };
  // Đơn nhiều điểm giao: _id dạng "<mã đơn>-<số điểm>".
  const base = raw.replace(/-\d+$/, '');
  const row = db.prepare(
    `SELECT * FROM deliveries WHERE provider = 'ahamove' AND external_id IN (?, ?) ORDER BY id DESC`,
  ).get(raw, base);
  if (!row) return { ok: false, error: 'Không có đơn' };
  // Ghi nhận webhook đã hoạt động (chỉ khi đúng đơn của mình).
  writeSetting(db, WEBHOOK_KEY, deps.now(), 'ahamove');
  if (row.ended) return { ok: true, ignored: true };
  await refreshRow(db, row, { background: true });
  return { ok: true };
}

// ---------- Đọc cho giao diện ----------
function publicStatus(db, orderId) {
  const rows = attemptsOf(db, orderId);
  if (rows.length === 0) return null;
  const placed = rows.filter((r) => r.unified !== 'place_failed');
  const current = [...placed].reverse().find((r) => !r.ended) || placed[placed.length - 1] || null;
  let switched = null;
  if (current && current.reason) {
    const idx = rows.findIndex((r) => r.id === current.id);
    const prev = idx > 0 ? rows[idx - 1] : null;
    switched = {
      from: prev ? prev.provider : '',
      fromName: prev ? rules.PROVIDER_NAMES[prev.provider] : '',
      // "…đã tự chuyển sang hãng khác" → nêu đúng tên hãng đang giao.
      reason: current.reason.replace('hãng khác', rules.PROVIDER_NAMES[current.provider]),
      at: current.created_at,
    };
  }
  if (!current) {
    const last = rows[rows.length - 1];
    const uncertain = !!(last.end_reason && last.end_reason.startsWith(UNCERTAIN_PREFIX));
    return {
      // Lượt cuối KHÔNG RÕ kết quả → nêu hãng để nhân viên kiểm tra app hãng đó.
      provider: uncertain ? last.provider : '',
      providerName: uncertain ? rules.PROVIDER_NAMES[last.provider] : '',
      uncertain,
      status: 'place_failed',
      statusLabel: rules.UNIFIED_LABELS.place_failed,
      step: -1,
      allFailed: true,
      attempts: rows.length,
    };
  }
  // Hết cách: không còn lượt nào đang chạy và lượt cuối cùng kết thúc
  // không giao được (tự chuyển hãng — nếu có — đã chạy ngay lúc đó).
  const last = rows[rows.length - 1];
  const active = rows.some((r) => !r.ended);
  const allFailed = !active && ['cancelled', 'failed', 'place_failed'].includes(last.unified);
  return {
    provider: current.provider,
    providerName: rules.PROVIDER_NAMES[current.provider],
    externalId: current.external_id,
    status: current.unified,
    statusLabel: rules.UNIFIED_LABELS[current.unified] || current.unified,
    rawStatus: current.raw_status,
    step: rules.stepIndex(current.unified),
    driver: current.driver_name || current.driver_phone || current.driver_plate
      ? { name: current.driver_name, phone: current.driver_phone, plate: current.driver_plate }
      : null,
    shareLink: current.share_link,
    times: {
      createdAt: current.created_at,
      assignedAt: current.assigned_at,
      pickedAt: current.picked_at,
      completedAt: current.completed_at,
    },
    switched,
    allFailed,
    endReason: current.ended ? current.end_reason : '',
    attempts: rows.length,
  };
}

function batchStatus(db, orderIds) {
  const out = {};
  for (const id of orderIds) {
    const s = publicStatus(db, id);
    if (s) out[id] = s;
  }
  return out;
}

function stats(db, days = 7) {
  const since = deps.now() - days * 24 * 60 * 60 * 1000;
  const rows = db.prepare(
    `SELECT provider,
       SUM(CASE WHEN unified <> 'place_failed' THEN 1 ELSE 0 END) AS orders,
       AVG(CASE WHEN unified <> 'place_failed' THEN fee END) AS avg_fee,
       AVG(CASE WHEN assigned_at IS NOT NULL THEN (assigned_at - created_at) END) AS avg_assign_ms,
       SUM(CASE WHEN ended = 1 AND attempt = 1 AND unified IN ('cancelled','place_failed')
             AND EXISTS (SELECT 1 FROM deliveries d2 WHERE d2.order_id = deliveries.order_id AND d2.attempt > 1)
           THEN 1 ELSE 0 END) AS switched_away
     FROM deliveries WHERE created_at >= ? GROUP BY provider`,
  ).all(since);
  return rules.PROVIDERS.map((p) => {
    const r = rows.find((x) => x.provider === p) || {};
    return {
      provider: p,
      orders: Number(r.orders || 0),
      avgFee: r.avg_fee != null ? Math.round(r.avg_fee) : null,
      avgAssignMinutes: r.avg_assign_ms != null ? Math.round((r.avg_assign_ms / 60000) * 10) / 10 : null,
      switchedAway: Number(r.switched_away || 0),
    };
  });
}

async function adminInfo(db) {
  const settings = getSettings(db);
  const aha = await deps.ahamove.checkConnection();
  const hook = readSetting(db, WEBHOOK_KEY);
  const base = (process.env.VPS_PUBLIC_URL || '').replace(/\/+$/, '');
  return {
    settings,
    providers: {
      lalamove: {
        configured: deps.lalamove.isConfigured(),
        env: deps.lalamove.ENV,
        autoDispatch: autoDispatchFlag('lalamove'),
        ok: deps.lalamove.isConfigured(),
        error: deps.lalamove.isConfigured() ? '' : 'Chưa cấu hình LALAMOVE_API_KEY / LALAMOVE_API_SECRET',
      },
      ahamove: {
        configured: deps.ahamove.isConfigured(),
        env: deps.ahamove.getEnv(),
        autoDispatch: autoDispatchFlag('ahamove'),
        ok: aha.ok,
        error: aha.ok ? '' : aha.error,
        serviceId: deps.ahamove.SERVICE_ID === 'auto' ? 'Theo thành phố của quán' : deps.ahamove.SERVICE_ID,
      },
    },
    webhook: {
      url: base ? `${base}/webhook/ahamove` : '',
      lastReceivedAt: hook ? Number(hook.value) || null : null,
    },
    stats: stats(db, 7),
  };
}

module.exports = {
  deps,
  getSettings,
  setSettings,
  dispatchProviders,
  quoteProviders,
  quoteAll,
  quoteForCustomer,
  dispatch,
  refreshRow,
  tick,
  onAhamoveWebhook,
  publicStatus,
  batchStatus,
  stats,
  adminInfo,
};

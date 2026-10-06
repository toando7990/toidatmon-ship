// ============================================================
// lib/delivery-rules.js — quy tắc THUẦN (không gọi mạng / DB) cho giao
// hàng 2 hãng Lalamove + Ahamove:
//   - unifyStatus(): trạng thái riêng từng hãng → trạng thái chung cho
//     "Theo dõi đơn" + thẻ đơn /driver;
//   - chooseProviders(): thứ tự hãng cần thử theo cài đặt (Tự động / Xoay
//     vòng / Chỉ Lalamove / Chỉ Ahamove).
// ============================================================

const PROVIDERS = ['lalamove', 'ahamove'];
const PROVIDER_NAMES = { lalamove: 'Lalamove', ahamove: 'Ahamove' };

const DEFAULT_SETTINGS = Object.freeze({
  mode: 'auto', // auto | round_robin | lalamove | ahamove
  tieVnd: 3000, // chênh lệch ≤ mức này coi như bằng nhau → xoay vòng
  failoverMinutes: 7, // quá X phút chưa có tài xế → chuyển hãng
  redispatchOnCancel: true, // hãng huỷ / hết hạn → tự đặt hãng kia
  lalamoveEnabled: true,
  ahamoveEnabled: true,
});

const MAX_ATTEMPTS = 2; // tối đa 1 lần chuyển hãng mỗi đơn

function sanitizeSettings(input) {
  const s = { ...DEFAULT_SETTINGS, ...(input || {}) };
  const out = {
    mode: ['auto', 'round_robin', 'lalamove', 'ahamove'].includes(s.mode) ? s.mode : DEFAULT_SETTINGS.mode,
    tieVnd: Math.max(0, Math.min(100000, Math.round(Number(s.tieVnd)))),
    failoverMinutes: Math.max(2, Math.min(60, Math.round(Number(s.failoverMinutes)))),
    redispatchOnCancel: s.redispatchOnCancel !== false,
    lalamoveEnabled: s.lalamoveEnabled !== false,
    ahamoveEnabled: s.ahamoveEnabled !== false,
  };
  if (!Number.isFinite(out.tieVnd)) out.tieVnd = DEFAULT_SETTINGS.tieVnd;
  if (!Number.isFinite(out.failoverMinutes)) out.failoverMinutes = DEFAULT_SETTINGS.failoverMinutes;
  return out;
}

// Trạng thái chung:
//   finding     Đang tìm tài xế
//   to_pickup   Tài xế đang đến quán
//   at_pickup   Tài xế đã tới quán
//   delivering  Đang giao
//   near_drop   Tài xế sắp tới nơi
//   delivered   Đã giao
//   cancelled   Hãng huỷ / hết hạn / không tìm được tài xế
//   failed      Giao không thành công (hoàn hàng)
//   place_failed  Không đặt được (lỗi API) — chỉ trong lịch sử
const UNIFIED_LABELS = {
  finding: 'Đang tìm tài xế',
  to_pickup: 'Tài xế đang đến quán',
  at_pickup: 'Tài xế đã tới quán',
  delivering: 'Đang giao đến bạn',
  near_drop: 'Tài xế sắp tới nơi',
  delivered: 'Đã giao',
  cancelled: 'Đơn giao hàng đã huỷ',
  failed: 'Giao không thành công',
  place_failed: 'Không đặt được tài xế',
};

const TERMINAL = new Set(['delivered', 'cancelled', 'failed', 'place_failed']);

function unifyStatus(provider, raw) {
  const status = String((raw && raw.status) || '').toUpperCase().trim();
  const sub = String((raw && raw.subStatus) || '').toUpperCase().trim();
  const drop = String((raw && raw.dropStatus) || '').toUpperCase().trim();
  if (provider === 'lalamove') {
    switch (status) {
      case 'ASSIGNING_DRIVER':
        return 'finding';
      case 'ON_GOING':
        return 'to_pickup';
      case 'PICKED_UP':
        return 'delivering';
      case 'COMPLETED':
        return 'delivered';
      case 'CANCELED':
      case 'CANCELLED':
      case 'REJECTED':
      case 'EXPIRED':
        return 'cancelled';
      default:
        return status ? 'finding' : 'finding';
    }
  }
  // ahamove
  switch (status) {
    case 'IDLE':
    case 'ASSIGNING':
      return 'finding';
    case 'ACCEPTED':
      return sub === 'ARRIVED' ? 'at_pickup' : 'to_pickup';
    case 'IN PROCESS':
    case 'IN_PROCESS':
      return sub === 'COMPLETING' ? 'near_drop' : 'delivering';
    case 'COMPLETED':
      if (drop === 'FAILED' || sub === 'IN_RETURN' || sub === 'RETURNED') return 'failed';
      return 'delivered';
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled';
    default:
      return 'finding';
  }
}

// Bước trên "Theo dõi đơn": 0 tìm tài xế · 1 tới quán · 2 đang giao · 3 đã giao.
function stepIndex(unified) {
  switch (unified) {
    case 'finding':
      return 0;
    case 'to_pickup':
    case 'at_pickup':
      return 1;
    case 'delivering':
    case 'near_drop':
      return 2;
    case 'delivered':
      return 3;
    default:
      return -1;
  }
}

// Thứ tự hãng cần thử.
//   available: hãng dùng được (đủ khoá + bật trong cài đặt + bật tự đặt)
//   quotes:    { lalamove?: {feeVnd}, ahamove?: {feeVnd} } — hãng báo giá
//              lỗi thì vắng mặt (coi như không dùng được lượt này)
//   rrCounter: bộ đếm xoay vòng (chẵn → Lalamove trước)
// Trả { order: ['lalamove','ahamove'], usedRoundRobin }
function chooseProviders(settings, available, quotes, rrCounter) {
  const s = sanitizeSettings(settings);
  const ok = PROVIDERS.filter((p) => available.includes(p) && quotes && quotes[p]);
  if (ok.length === 0) return { order: [], usedRoundRobin: false };
  if (ok.length === 1) return { order: ok, usedRoundRobin: false };
  const rr = Number(rrCounter) % 2 === 0 ? ['lalamove', 'ahamove'] : ['ahamove', 'lalamove'];
  switch (s.mode) {
    case 'lalamove':
      return { order: ['lalamove', 'ahamove'], usedRoundRobin: false };
    case 'ahamove':
      return { order: ['ahamove', 'lalamove'], usedRoundRobin: false };
    case 'round_robin':
      return { order: rr, usedRoundRobin: true };
    default: {
      const fl = Number(quotes.lalamove.feeVnd);
      const fa = Number(quotes.ahamove.feeVnd);
      if (Math.abs(fl - fa) <= s.tieVnd) return { order: rr, usedRoundRobin: true };
      return { order: fl < fa ? ['lalamove', 'ahamove'] : ['ahamove', 'lalamove'], usedRoundRobin: false };
    }
  }
}

module.exports = {
  PROVIDERS,
  PROVIDER_NAMES,
  DEFAULT_SETTINGS,
  MAX_ATTEMPTS,
  UNIFIED_LABELS,
  TERMINAL,
  sanitizeSettings,
  unifyStatus,
  stepIndex,
  chooseProviders,
};

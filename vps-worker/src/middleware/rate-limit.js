// ============================================================
// middleware/rate-limit.js — Rate-limit cho create + webhooks
// ============================================================
// Simple in-memory sliding-window rate limiter (no external dep).
// Create: 30 req/phút/IP. Webhook: 60 req/phút/IP.
// ============================================================

const windows = new Map(); // key -> [timestamps]

function rateLimit({ windowMs = 60000, max = 30, message = 'Too many requests' }) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const arr = (windows.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: message });
    }
    arr.push(now);
    windows.set(key, arr);
    next();
  };
}

// Cleanup entries cũ định kỳ (tránh memory leak).
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of windows) {
    const filtered = arr.filter((t) => now - t < 60000);
    if (filtered.length === 0) windows.delete(k);
    else windows.set(k, filtered);
  }
}, 60000).unref();

module.exports = { rateLimit };

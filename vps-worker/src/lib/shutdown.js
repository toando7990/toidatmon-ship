// ============================================================
// lib/shutdown.js — Shared graceful-shutdown flag
// ============================================================
// Module-scope flag shared between index.js (signal handler) and
// cron task callbacks (sync/webhooks/invoice). When the process
// receives SIGTERM/SIGINT, index.js sets `shuttingDown = true` so
// every cron callback can bail out early and not start new work.
// ============================================================

const shutdown = { shuttingDown: false };

module.exports = shutdown;

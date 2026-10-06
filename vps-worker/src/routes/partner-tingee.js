// ============================================================
// routes/partner-tingee.js — Chủ quán cài Tingee riêng của quán (/quan-ly)
// ============================================================
//   GET  /partner-tingee?deviceId=…          xem (không trả secret)
//   POST /partner-tingee        { deviceId, clientId, secret?, vaAccountNumber, bankBin, merchantId?, enabled }
//   POST /partner-tingee/remove { deviceId }
//   GET  /counter-payment-mode/:tenantId     'tingee' | 'bank' | 'none' (máy quầy
//        dùng để bật/tắt nút QR; công khai, không lộ thông tin tài khoản)
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const partnerTingee = require('../lib/partner-tingee');
const secretBox = require('../lib/secret-box');
const { authorizeDevice } = require('../lib/device-guard');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
router.use('/partner-tingee', rateLimit({ windowMs: 60000, max: 30, message: 'Too many requests' }));

function webhookUrl(tenantId) {
  const base = String(process.env.VPS_PUBLIC_URL || '').replace(/\/+$/, '');
  return base ? `${base}/webhook/tingee/${encodeURIComponent(tenantId)}` : `/webhook/tingee/${encodeURIComponent(tenantId)}`;
}

async function owner(req, res) {
  const credential = String((req.body || {}).deviceId || req.query.deviceId || '').trim();
  const device = await authorizeDevice(credential, ['tenantAdmin']);
  if (!device) {
    res.status(403).json({ ok: false, error: 'Chỉ máy Chủ quán được cài Tingee của quán.' });
    return null;
  }
  return device;
}

router.get('/partner-tingee', async (req, res, next) => {
  try {
    const device = await owner(req, res);
    if (!device) return;
    const db = req.app.locals.db;
    res.json({
      ok: true,
      ...partnerTingee.publicInfo(db, device.tenantId),
      webhookUrl: webhookUrl(device.tenantId),
      canStoreSecret: secretBox.isConfigured(),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/partner-tingee', async (req, res, next) => {
  try {
    const device = await owner(req, res);
    if (!device) return;
    if (!secretBox.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'Máy chủ chưa sẵn sàng lưu khoá Tingee. Vui lòng báo Tôi Đặt Món.' });
    }
    const b = req.body || {};
    const clientId = String(b.clientId || '').trim();
    const secret = String(b.secret || '').trim();
    const vaAccountNumber = String(b.vaAccountNumber || '').trim();
    const bankBin = String(b.bankBin || '').trim();
    const merchantId = String(b.merchantId || '').trim();
    if (!clientId || clientId.length > 100) return res.status(400).json({ ok: false, error: 'Client ID không hợp lệ.' });
    if (secret.length > 200) return res.status(400).json({ ok: false, error: 'Secret quá dài.' });
    if (!vaAccountNumber || vaAccountNumber.length > 40) return res.status(400).json({ ok: false, error: 'Thiếu số tài khoản ảo (VA).' });
    if (!/^\d{6,8}$/.test(bankBin)) return res.status(400).json({ ok: false, error: 'Mã ngân hàng (BIN) không hợp lệ.' });
    if (merchantId.length > 100) return res.status(400).json({ ok: false, error: 'Merchant ID quá dài.' });
    const db = req.app.locals.db;
    try {
      partnerTingee.save(db, device.tenantId, {
        clientId, secret, vaAccountNumber, bankBin, merchantId, enabled: b.enabled !== false,
      });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
    console.log('[partner-tingee] cập nhật Tingee của quán', device.tenantId);
    res.json({ ok: true, ...partnerTingee.publicInfo(db, device.tenantId), webhookUrl: webhookUrl(device.tenantId) });
  } catch (e) {
    next(e);
  }
});

router.post('/partner-tingee/remove', async (req, res, next) => {
  try {
    const device = await owner(req, res);
    if (!device) return;
    partnerTingee.remove(req.app.locals.db, device.tenantId);
    res.json({ ok: true, configured: false });
  } catch (e) {
    next(e);
  }
});

router.get('/counter-payment-mode/:tenantId', async (req, res, next) => {
  try {
    const tenantId = canister.tenantOr(req.params.tenantId);
    if (partnerTingee.getConfig(req.app.locals.db, tenantId)) return res.json({ ok: true, mode: 'tingee' });
    let acc = null;
    try {
      acc = await canister.getCounterPaymentAccount(tenantId);
    } catch (e) {
      console.warn('[partner-tingee] getCounterPaymentAccount lỗi:', tenantId, e.message);
    }
    res.json({ ok: true, mode: acc && acc.enabled && acc.vaAccountNumber ? 'bank' : 'none' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

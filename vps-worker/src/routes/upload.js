// ============================================================
// routes/upload.js — POST /upload (frontend) + POST /menu/upload-image (legacy)
// ============================================================
// Frontend (vps-client.ts) calls POST /upload (multipart, field 'image').
// Returns UploadImageResponse (camelCase): { imageUrl, ok, error? }
//
// Legacy POST /menu/upload-image kept for backward compat.
// Multipart, max 1MB, resize 800x800, jpg/png/webp.
// Host /uploads/menu/<uuid>.jpg → trả imageUrl.
// ============================================================

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — khớp frontend
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(new Error('Only jpg/png/webp allowed'));
    cb(null, true);
  },
});

// Helper: process uploaded file → write resized jpg → return imageUrl.
async function processUpload(file) {
  const menuDir = path.join(UPLOAD_DIR, 'menu');
  if (!fs.existsSync(menuDir)) fs.mkdirSync(menuDir, { recursive: true });
  const uuid = crypto.randomBytes(8).toString('hex');
  const outPath = path.join(menuDir, `${uuid}.jpg`);
  await sharp(file.buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(outPath);
  return `/uploads/menu/${uuid}.jpg`;
}

// POST /upload — frontend contract (camelCase response)
router.post('/upload', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'image file required' });
    const imageUrl = await processUpload(req.file);
    res.status(201).json({ imageUrl, ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /menu/upload-image — legacy
router.post('/menu/upload-image', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image file required' });
    const imageUrl = await processUpload(req.file);
    res.status(201).json({ imageUrl });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

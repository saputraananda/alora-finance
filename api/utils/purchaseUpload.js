import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Bukti bayar pengajuan disimpan di folder assets SuperApp (subfolder purchase/) supaya
// tetap terbaca di SuperApp — kedua aplikasi berada di server yang sama.
// Penamaan & batasan meniru backend-superapp/middleware/upload.js (uploadPurchase).

const ALLOWED = /jpeg|jpg|png|webp|pdf/;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const base = process.env.SUPERAPP_ASSETS_DIR;
    if (!base) return cb(new Error('SUPERAPP_ASSETS_DIR belum diisi di .env alfi.'));
    const dir = path.join(base, 'purchase');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      return cb(e);
    }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${baseName}_${unique}${ext}`);
  },
});

const makeUpload = (max) =>
  multer({
    storage,
    fileFilter: (_req, file, cb) => {
      if (ALLOWED.test(path.extname(file.originalname).toLowerCase())) return cb(null, true);
      cb(new Error('Hanya file JPG, PNG, WEBP, atau PDF yang diizinkan.'));
    },
    limits: { fileSize: 10 * 1024 * 1024 },
  }).array('attachments', max);

const wrap = (upload) => (req, res, next) => {
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
};

/** Middleware multipart untuk bukti bayar (maks 5 file, 10 MB per file). */
export const purchaseProofUpload = wrap(makeUpload(5));

/** Middleware multipart untuk menambah lampiran dari detail pengajuan (maks 10 file, 10 MB per file). */
export const purchaseAttachmentUpload = wrap(makeUpload(10));

/** Hapus file yang sudah terunggah bila proses gagal (hanya file yang baru diunggah request ini). */
export const removeUploaded = (files = []) => {
  for (const f of files) {
    if (f?.path) fs.unlink(f.path, () => {});
  }
};

import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getSettings,
  saveCabang,
  saveMethod,
  createBank,
  updateBank,
  deleteBank,
  saveAccountMap,
  saveServiceMap,
  getOpening,
  saveOpening,
  postOpening,
} from '../../controllers/settings/settings.controller.js';

import { listPaymentCategories, createPaymentCategory, updatePaymentCategory } from '../../controllers/settings/paymentCategory.controller.js';
import { listNumbering, createNumbering, updateNumbering } from '../../controllers/settings/numbering.controller.js';
import { getLockDate, saveLockDate } from '../../controllers/settings/lockDate.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/settings/overview', getSettings);
router.put('/settings/cabang/:outletId', saveCabang);
router.put('/settings/method/:code', saveMethod);
// Master Kategori Payment (dikelola Finance; dipakai dialog Cocokkan di Rekonsiliasi Transaksi)
router.get('/settings/payment-categories', listPaymentCategories);
router.post('/settings/payment-categories', createPaymentCategory);
router.put('/settings/payment-categories/:id', updatePaymentCategory);
// Penomoran dokumen (Jurnal Umum manual, Rekon Code mutasi bank)
router.get('/settings/numbering', listNumbering);
router.post('/settings/numbering', createNumbering);
router.put('/settings/numbering/:id', updateNumbering);
// Batas kunci tanggal: jurnal s/d tanggal ini ditolak (semua cabang + Pusat)
router.get('/settings/lock-date', getLockDate);
router.put('/settings/lock-date', saveLockDate);
router.post('/settings/bank-accounts', createBank);
router.put('/settings/bank-accounts/:id', updateBank);
router.delete('/settings/bank-accounts/:id', deleteBank);
router.put('/settings/account-map/:role', saveAccountMap);
router.put('/settings/service-map/:categoryId', saveServiceMap);
router.get('/settings/opening', getOpening);
router.put('/settings/opening', saveOpening);
router.post('/settings/opening/post', postOpening);

export default router;

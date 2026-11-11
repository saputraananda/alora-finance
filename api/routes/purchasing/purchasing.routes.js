import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { requireFinance } from '../../utils/pengajuanAccess.js';
import {
  getMe,
  getSummary,
  listRequests,
  listCredit,
  getRequest,
  listClassifications,
  listCompanies,
  listDepartments,
  saveClassificationAccount,
} from '../../controllers/purchasing/pengajuan.controller.js';
import { approveFinance, rejectFinance } from '../../controllers/purchasing/pengajuanActions.controller.js';
import { payRequest, rejectPayment, journalRequest, addAttachments } from '../../controllers/purchasing/pengajuanPayment.controller.js';
import { purchaseProofUpload, purchaseAttachmentUpload } from '../../utils/purchaseUpload.js';

const router = express.Router();

router.use(authenticateToken);

// /me boleh diakses semua pengguna login (dipakai frontend untuk menampilkan/menolak menu).
router.get('/purchasing/me', getMe);

// Selebihnya hanya tim Finance — termasuk detail (di SuperApp endpoint detail tidak dicek role).
router.use('/purchasing', requireFinance);
router.get('/purchasing/summary', getSummary);
router.get('/purchasing/requests', listRequests);
router.get('/purchasing/requests/:id', getRequest);
router.get('/purchasing/credit', listCredit);
router.get('/purchasing/classifications', listClassifications);
router.get('/purchasing/companies', listCompanies);
router.get('/purchasing/departments', listDepartments);
router.put('/purchasing/classifications/:id/account', saveClassificationAccount);

// Aksi Finance — MENULIS ke database SuperApp (lihat pengajuanActions.controller.js)
router.post('/purchasing/requests/:id/approve', approveFinance);
router.post('/purchasing/requests/:id/reject', rejectFinance);
router.post('/purchasing/requests/:id/pay', purchaseProofUpload, payRequest);
router.post('/purchasing/requests/:id/reject-payment', rejectPayment);
router.post('/purchasing/requests/:id/journal', journalRequest);
router.post('/purchasing/requests/:id/attachments', purchaseAttachmentUpload, addAttachments);

export default router;

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

const router = express.Router();

router.use(authenticateToken);

router.get('/settings/overview', getSettings);
router.put('/settings/cabang/:outletId', saveCabang);
router.put('/settings/method/:code', saveMethod);
router.post('/settings/bank-accounts', createBank);
router.put('/settings/bank-accounts/:id', updateBank);
router.delete('/settings/bank-accounts/:id', deleteBank);
router.put('/settings/account-map/:role', saveAccountMap);
router.put('/settings/service-map/:categoryId', saveServiceMap);
router.get('/settings/opening', getOpening);
router.put('/settings/opening', saveOpening);
router.post('/settings/opening/post', postOpening);

export default router;

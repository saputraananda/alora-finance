import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getRekonDay,
  saveExplanation,
  requestExplanation,
  approveDay,
  getDeposits,
  saveDeposit,
  deleteDeposit,
  slipMiddleware,
  uploadSlip,
  settlementFileMiddleware,
  importSettlements,
  getSettlements,
  addSettlement,
  deleteSettlement,
  settlementTemplate,
} from '../../controllers/rekon/rekon.controller.js';
import {
  getBankRecon,
  bankFileMiddleware,
  importBankStatement,
  autoMatch,
  manualMatch,
  unmatch,
  createAdminFeeJournal,
  saveStatementBalance,
  deleteStatement,
  bankTemplate,
} from '../../controllers/rekon/bank.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/rekon/day', getRekonDay);
router.post('/rekon/explain', saveExplanation);
router.post('/rekon/request-explanation', requestExplanation);
router.post('/rekon/approve', approveDay);

router.get('/rekon/deposits', getDeposits);
router.post('/rekon/deposits', saveDeposit);
router.delete('/rekon/deposits', deleteDeposit);
router.post('/rekon/upload', slipMiddleware, uploadSlip);

router.get('/rekon/settlements', getSettlements);
router.get('/rekon/settlements/template', settlementTemplate);
router.post('/rekon/settlements', addSettlement);
router.post('/rekon/settlements/import', settlementFileMiddleware, importSettlements);
router.delete('/rekon/settlements/:id', deleteSettlement);

// Rekonsiliasi bank (rekening koran)
router.get('/rekon/bank', getBankRecon);
router.get('/rekon/bank/template', bankTemplate);
router.post('/rekon/bank/import', bankFileMiddleware, importBankStatement);
router.post('/rekon/bank/auto-match', autoMatch);
router.post('/rekon/bank/match', manualMatch);
router.post('/rekon/bank/unmatch', unmatch);
router.post('/rekon/bank/admin-fee', createAdminFeeJournal);
router.put('/rekon/bank/balance', saveStatementBalance);
router.delete('/rekon/bank/statements/:id', deleteStatement);

export default router;

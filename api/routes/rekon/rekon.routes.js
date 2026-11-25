import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getRekonDay,
  saveExplanation,
  requestExplanation,
  approveDay,
  transferToGl,
  getDeposits,
  saveDeposit,
  deleteDeposit,
  slipMiddleware,
  uploadSlip,
} from '../../controllers/rekon/rekon.controller.js';
import { getResults, transferResults } from '../../controllers/rekon/reconResults.controller.js';
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
  deleteStatements,
  bankTemplate,
} from '../../controllers/rekon/bank.controller.js';

import {
  importFileMiddleware,
  listAdapters,
  previewImport,
  confirmImport,
  listImportFiles,
} from '../../controllers/rekon/bankImport.controller.js';

import {
  getWorkspace,
  getCategories,
  createMatch,
  undoMatch,
  explainMatch,
  getMatch,
  getHistory,
  getOpenPiutang,
  getParties,
  getInternalDetail,
} from '../../controllers/rekon/reconWorkspace.controller.js';
import { getDeposits as getDepositPool, createDepositMatch } from '../../controllers/rekon/reconDeposit.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/rekon/day', getRekonDay);
router.post('/rekon/explain', saveExplanation);
router.post('/rekon/request-explanation', requestExplanation);
router.post('/rekon/approve', approveDay);
router.post('/rekon/transfer-to-gl', transferToGl);
router.get('/rekon/results', getResults);
router.post('/rekon/results/transfer', transferResults);

router.get('/rekon/deposits', getDeposits);
router.post('/rekon/deposits', saveDeposit);
router.delete('/rekon/deposits', deleteDeposit);
router.post('/rekon/upload', slipMiddleware, uploadSlip);


// Rekonsiliasi bank (rekening koran)
router.get('/rekon/bank', getBankRecon);
// Rekonsiliasi Transaksi (ruang kerja dua panel), pencocokan, riwayat
router.get('/rekon/workspace', getWorkspace);
router.get('/rekon/workspace/categories', getCategories);
router.post('/rekon/workspace/match', createMatch);
router.post('/rekon/workspace/unmatch', undoMatch);
router.post('/rekon/workspace/explain', explainMatch);
router.get('/rekon/workspace/match/:id', getMatch);
router.get('/rekon/workspace/history', getHistory);
router.get('/rekon/workspace/open-piutang', getOpenPiutang);
router.get('/rekon/workspace/parties', getParties);
router.get('/rekon/workspace/internal-detail', getInternalDetail);
// Pencocokan deposit (mode Deposit): deposit tersisa ↔ pembayaran "Potong Saldo Member" / nota belum lunas
router.get('/rekon/deposit', getDepositPool);
router.post('/rekon/deposit/match', createDepositMatch);
// Import mutasi bank (pratinjau → konfirmasi) dan riwayat file
router.get('/rekon/bank/import/adapters', listAdapters);
router.post('/rekon/bank/import/preview', importFileMiddleware, previewImport);
router.post('/rekon/bank/import/confirm', confirmImport);
router.get('/rekon/bank/import/files', listImportFiles);
router.get('/rekon/bank/template', bankTemplate);
router.post('/rekon/bank/import', bankFileMiddleware, importBankStatement);
router.post('/rekon/bank/auto-match', autoMatch);
router.post('/rekon/bank/match', manualMatch);
router.post('/rekon/bank/unmatch', unmatch);
router.post('/rekon/bank/admin-fee', createAdminFeeJournal);
router.put('/rekon/bank/balance', saveStatementBalance);
router.post('/rekon/bank/statements/delete', deleteStatements);
router.delete('/rekon/bank/statements/:id', deleteStatement);

export default router;

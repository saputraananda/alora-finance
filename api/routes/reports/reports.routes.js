import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getProfitLoss,
  getTrialBalance,
  getBalanceSheet,
  getCashDiffReport,
  getMdrReport,
  getAgingReport,
} from '../../controllers/reports/reports.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/reports/profit-loss', getProfitLoss);
router.get('/reports/trial-balance', getTrialBalance);
router.get('/reports/balance-sheet', getBalanceSheet);
router.get('/reports/cash-diff', getCashDiffReport);
router.get('/reports/mdr', getMdrReport);
router.get('/reports/aging', getAgingReport);

export default router;

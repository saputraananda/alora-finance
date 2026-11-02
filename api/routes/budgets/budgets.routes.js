import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getBudgets, saveBudget, saveBatchBudgets, copyPreviousMonthBudget } from '../../controllers/budgets/budgets.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/budgets', getBudgets);
router.post('/budgets', saveBudget);
router.post('/budgets/batch', saveBatchBudgets);
router.post('/budgets/copy-previous', copyPreviousMonthBudget);

export default router;

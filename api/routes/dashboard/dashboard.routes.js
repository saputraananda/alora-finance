import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getFinanceDashboard } from '../../controllers/dashboard/dashboard.controller.js';

const router = express.Router();

router.use(authenticateToken);

// GET /api/finance-ho/dashboard
router.get('/dashboard', getFinanceDashboard);

export default router;

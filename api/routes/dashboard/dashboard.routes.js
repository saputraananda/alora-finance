import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getFinanceDashboard } from '../../controllers/dashboard/dashboard.controller.js';
import { getDashboardOverview } from '../../controllers/dashboard/overview.controller.js';

const router = express.Router();

router.use(authenticateToken);

// GET /api/finance-ho/dashboard
router.get('/dashboard', getFinanceDashboard);
// GET /api/finance-ho/dashboard/overview
router.get('/dashboard/overview', getDashboardOverview);

export default router;

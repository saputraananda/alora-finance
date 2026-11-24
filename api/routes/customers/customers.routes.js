import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { listCustomers } from '../../controllers/customers/customers.controller.js';
import { getDepositOverview, getMemberMutations } from '../../controllers/customers/deposit.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/customers', listCustomers);
router.get('/customers/deposit', getDepositOverview);
router.get('/customers/deposit/:id', getMemberMutations);

export default router;

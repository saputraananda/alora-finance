import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getAccounts, getAccountsForSelect, createAccount, updateAccount, seedDefaultAccounts } from '../../controllers/coa/coa.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/accounts', getAccounts);
router.get('/accounts/select', getAccountsForSelect);
router.post('/accounts', createAccount);
router.put('/accounts/:id', updateAccount);
router.post('/accounts/seed-default', seedDefaultAccounts);

export default router;

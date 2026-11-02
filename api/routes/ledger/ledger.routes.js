import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getGeneralLedger } from '../../controllers/ledger/ledger.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/general-ledger', getGeneralLedger);

export default router;

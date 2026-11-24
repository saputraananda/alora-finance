import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getPosDay, getPosDetail, postPos, postPosAll, postSync } from '../../controllers/pos/pos.controller.js';

import { getNota } from '../../controllers/pos/nota.controller.js';
import { getSetoran, getSetoranDetail, koreksiSetoran, postSetoranSync } from '../../controllers/pos/setoran.controller.js';
import { getFocMeta, getTransactions, getVoids, getRefunds, exportTransactions } from '../../controllers/pos/foc.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/pos/day', getPosDay);
router.get('/pos/detail', getPosDetail);
router.get('/pos/foc/meta', getFocMeta);
router.get('/pos/transactions/export', exportTransactions);
router.get('/pos/transactions', getTransactions);
router.get('/pos/voids', getVoids);
router.get('/pos/refunds', getRefunds);
router.get('/pos/setoran', getSetoran);
router.post('/pos/setoran/sync', postSetoranSync);
router.get('/pos/setoran/:id', getSetoranDetail);
router.put('/pos/setoran/:id', koreksiSetoran);
router.get('/pos/nota', getNota);
router.get('/pos/nota/:id', getNota);
router.post('/pos/sync', postSync);
router.post('/pos/post', postPos);
router.post('/pos/post-all', postPosAll);

export default router;

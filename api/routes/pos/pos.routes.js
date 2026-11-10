import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getPosDay, getPosDetail, postPos, postPosAll, postSync } from '../../controllers/pos/pos.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/pos/day', getPosDay);
router.get('/pos/detail', getPosDetail);
router.post('/pos/sync', postSync);
router.post('/pos/post', postPos);
router.post('/pos/post-all', postPosAll);

export default router;

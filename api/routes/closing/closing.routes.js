import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getChecklist, setReview, getAllocation, postAllocation } from '../../controllers/closing/closing.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/closing/checklist', getChecklist);
router.post('/closing/review', setReview);
router.get('/closing/allocation', getAllocation);
router.post('/closing/allocation', postAllocation);

export default router;

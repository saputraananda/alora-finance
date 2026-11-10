import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getAssets, createAsset, updateAsset, moveAsset, disposeAsset, runDepreciation } from '../../controllers/assets/assets.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/assets', getAssets);
router.post('/assets', createAsset);
router.put('/assets/:id', updateAsset);
router.post('/assets/:id/move', moveAsset);
router.post('/assets/:id/dispose', disposeAsset);
router.post('/assets/depreciation', runDepreciation);

export default router;

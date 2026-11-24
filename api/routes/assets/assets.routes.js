import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getDepreciation, moveAsset, disposeAsset, runDepreciation } from '../../controllers/assets/assets.controller.js';
import { getAssets, getAssetDetail, getAssetPhoto, saveAssetFinance, listAssetCategories, createAssetCategory, updateAssetCategory, deleteAssetCategory, setAssetCategory } from '../../controllers/assets/assetCatalog.controller.js';
import { importFileMiddleware, photoFileMiddleware, previewAssetImport, commitAssetImport, uploadAssetPhoto, deleteAssetPhoto, getAlfiAssetPhoto } from '../../controllers/assets/assetImport.controller.js';

const router = express.Router();

// Foto tanpa token (dipakai tag <img>); sisanya wajib login
router.get('/assets/photo/:file', getAssetPhoto);
router.get('/assets/photo-alfi/:file', getAlfiAssetPhoto);

router.use(authenticateToken);

router.get('/assets', getAssets);
router.get('/assets/depreciation', getDepreciation);
router.get('/assets/categories', listAssetCategories);
router.post('/assets/categories', createAssetCategory);
router.put('/assets/categories/:id', updateAssetCategory);
router.delete('/assets/categories/:id', deleteAssetCategory);
router.put('/assets/category/:kode', setAssetCategory);
router.get('/assets/:id/detail', getAssetDetail);
router.put('/assets/finance/:kode', saveAssetFinance);
router.post('/assets/import/preview', importFileMiddleware, previewAssetImport);
router.post('/assets/import/commit', commitAssetImport);
router.post('/assets/photos/:kode', photoFileMiddleware, uploadAssetPhoto);
router.delete('/assets/photos/:id', deleteAssetPhoto);
router.post('/assets/:id/move', moveAsset);
router.post('/assets/:id/dispose', disposeAsset);
router.post('/assets/depreciation', runDepreciation);

export default router;

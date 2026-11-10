import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getJournals, getJournalDetail, reverseJournal } from '../../controllers/journal/journal.controller.js';
import {
  getJournalMeta,
  uploadMiddleware,
  uploadAttachment,
  createManualJournal,
  updateManualJournal,
  submitJournal,
  approveJournal,
  rejectJournal,
  deleteDraftJournal,
} from '../../controllers/journal/journalManual.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/journals', getJournals);
router.get('/journals/meta', getJournalMeta);
router.post('/journals/upload', uploadMiddleware, uploadAttachment);
router.get('/journals/:id', getJournalDetail);
router.post('/journals', createManualJournal);
router.put('/journals/:id', updateManualJournal);
router.delete('/journals/:id', deleteDraftJournal);
router.post('/journals/:id/submit', submitJournal);
router.post('/journals/:id/approve', approveJournal);
router.post('/journals/:id/reject', rejectJournal);
router.post('/journals/:id/reverse', reverseJournal);

export default router;

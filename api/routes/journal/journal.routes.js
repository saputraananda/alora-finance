import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getJournals, getJournalDetail, createJournal, reverseJournal } from '../../controllers/journal/journal.controller.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/journals', getJournals);
router.get('/journals/:id', getJournalDetail);
router.post('/journals', createJournal);
router.post('/journals/:id/reverse', reverseJournal);

export default router;

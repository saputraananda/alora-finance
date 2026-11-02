import express from 'express';
import { login, me } from '../../controllers/auth/auth.controller.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/me
router.get('/me', authenticateToken, me);

export default router;

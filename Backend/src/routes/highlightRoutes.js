import express from 'express';
import auth from '../middleware/auth.js';
import { createHighlight, listHighlights } from '../controllers/highlightController.js';

const router = express.Router();

router.post('/', auth, createHighlight);
router.get('/:documentId', auth, listHighlights);

export default router;

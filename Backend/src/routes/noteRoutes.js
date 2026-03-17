import express from 'express';
import auth from '../middleware/auth.js';
import { createNote, listNotes } from '../controllers/noteController.js';

const router = express.Router();

router.post('/', auth, createNote);
router.get('/:documentId', auth, listNotes);

export default router;

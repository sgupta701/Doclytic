import express from 'express';
import auth from '../middleware/auth.js';
import { addComment, listComments } from '../controllers/commentController.js';

const router = express.Router();

router.post('/', auth, addComment);
router.get('/:documentId', auth, listComments);

export default router;

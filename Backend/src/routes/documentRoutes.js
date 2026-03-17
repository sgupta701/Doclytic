import express from 'express';
import  auth  from '../middleware/auth.js';
import {
  createDocument,
  downloadDocumentFile,
  getDocument,
  listDocuments,
  updateDocument,
  deleteDocument
} from '../controllers/documentController.js';
import { upload, uploadProvider } from '../utils/upload.js';

const router = express.Router();

const uploadField = upload.single('file');

router.post('/', auth, uploadField, createDocument);
router.get('/', auth, listDocuments);
router.get('/:id/download', auth, downloadDocumentFile);
router.get('/:id', auth, getDocument);
router.put('/:id', auth, uploadField, updateDocument);
router.delete('/:id', auth, deleteDocument);

export default router;

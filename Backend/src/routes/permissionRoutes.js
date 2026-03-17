import express from 'express';
import auth from '../middleware/auth.js';
import {
  grantPermission,
  listPermissionsForDocument,
  revokePermission,
} from '../controllers/permissionController.js';

const router = express.Router();

router.post('/', auth, grantPermission);
router.get('/:documentId', auth, listPermissionsForDocument);
router.delete('/:id', auth, revokePermission);

export default router;

import express from 'express';
import { register, login, getAllUsers, deleteUser, updateUserDepartment } from '../controllers/authController.js';
import auth from '../middleware/auth.js';
const router = express.Router();

router.post('/register', register);
router.post('/login', login);

// Admin-only: list users
router.get('/users', auth, getAllUsers);

// Delete user by id (self or admin)
router.delete('/users/:id', auth, deleteUser);

// Update user department/designation (self or admin)
router.put('/users/:id', auth, updateUserDepartment);

export default router;

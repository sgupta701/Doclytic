import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { serializeUserProfile } from '../utils/serializeUserProfile.js';
import { ensureEmployeeId } from '../utils/employeeId.js';
dotenv.config();

export const register = async (req, res) => {
  try {
    const { email, password, full_name, department_id, designation, contact } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashed, full_name, department_id, designation, contact });
    await user.save();
    await ensureEmployeeId(user);

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: serializeUserProfile(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    await ensureEmployeeId(user);
    user.last_login = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: serializeUserProfile(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const requester = await User.findById(req.userId);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });

    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
    const isAdmin = adminEmails.includes(requester.email);
    if (!isAdmin) return res.status(403).json({ message: 'Forbidden' });

    const users = await User.find().select('-password');
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const requester = await User.findById(req.userId);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });

    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
    const isAdmin = adminEmails.includes(requester.email);

    // Allow self-delete or admin-delete
    if (!isAdmin && requester._id.toString() !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await User.deleteOne({ _id: id });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateUserDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { department_id, designation, contact } = req.body;
    
    const requester = await User.findById(req.userId);
    if (!requester) return res.status(401).json({ message: 'Unauthorized' });

    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
    const isAdmin = adminEmails.includes(requester.email);

    // Only admins can update other users' departments
    if (!isAdmin && requester._id.toString() !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const update = {};
    if (department_id) update.department_id = department_id;
    if (designation) update.designation = designation;
    if (contact) update.contact = contact;

    const updated = await User.findByIdAndUpdate(id, update, { new: true }).select('-password');
    res.json({ message: 'User updated', user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

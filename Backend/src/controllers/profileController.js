import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import { serializeUserProfile } from '../utils/serializeUserProfile.js';
import { ensureEmployeeId } from '../utils/employeeId.js';

export const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'Profile not found' });
    await ensureEmployeeId(user);
    res.json(serializeUserProfile(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const update = { ...req.body };
    if (update.password) {
      update.password = await bcrypt.hash(update.password, 10);
    } else {
      delete update.password;
    }
    const user = await User.findByIdAndUpdate(req.userId, update, { new: true }).select('-password');
    await ensureEmployeeId(user);
    res.json(serializeUserProfile(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

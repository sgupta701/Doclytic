import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export const register = async (req, res) => {
  try {
    const { email, password, full_name, department_id, designation, contact, employee_id, avatar_url, responsibilities, working_hours } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ 
      email, 
      password: hashed, 
      full_name,
      department_id,
      designation,
      contact,
      employee_id,
      avatar_url,
      responsibilities,
      working_hours: working_hours || '9:00 AM - 5:00 PM'
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: {
      id: user._id,
      email: user.email,
      full_name: user.full_name,
      department_id: user.department_id,
      designation: user.designation,
      working_hours: user.working_hours,
      avatar_url: user.avatar_url,
    } });
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

    user.last_login = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        full_name: user.full_name,
        department_id: user.department_id,
        designation: user.designation,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

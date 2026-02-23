// path: src/server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from "cookie-parser"
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import mailRoutes from './routes/mailRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import translate from './routes/translate.js';
import fs from 'fs';


// NEW for real-time
import http from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const server = http.createServer(app);


export const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
    methods: ["GET", "POST"]
  }
});


io.on("connection", (socket) => {
  console.log(" Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log(" Client disconnected:", socket.id);
  });
});


app.use(express.json());
app.use(cookieParser());


const origins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173'];

app.use(cors({ origin: origins, credentials: true }));

connectDB();


if (process.env.FILE_UPLOAD_PROVIDER === 'local') {
  const uploadsDir = process.env.UPLOADS_DIR || './src/uploads';
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  app.use('/uploads', express.static('src/uploads'));
}

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/translate', translate);



app.get('/api/health', (req, res) => res.json({ ok: true }));




const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
});

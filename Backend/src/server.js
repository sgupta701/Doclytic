// path: src/server.js

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import mailRoutes from "./routes/mailRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import translate from "./routes/translate.js";
import commentRoutes from "./routes/commentRoutes.js";
import noteRoutes from "./routes/noteRoutes.js";
import highlightRoutes from "./routes/highlightRoutes.js";
import permissionRoutes from "./routes/permissionRoutes.js";

import fs from "fs";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

dotenv.config();

/* ================= CREATE EXPRESS APP ================= */
const app = express();
const server = http.createServer(app);

/* ================= BODY LIMIT FIX (413 FIX) ================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(cookieParser());

/* ================= CORS FIX ================= */
const origins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:5173"];

app.use(
  cors({
    origin: origins,
    credentials: true,
    exposedHeaders: ["Content-Disposition", "Content-Type", "X-Original-Filename"],
  })
);

/* ================= SOCKET.IO ================= */
export const io = new Server(server, {
  cors: {
    origin: origins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`user:${decoded.id}`);
    } catch (err) {
      console.error("Socket auth error:", err.message);
    }
  }

  console.log("Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

/* ================= DATABASE ================= */
connectDB();

/* ================= STATIC FILES ================= */
if (process.env.FILE_UPLOAD_PROVIDER === "local") {
  const uploadsDir = process.env.UPLOADS_DIR || "./src/uploads";

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  app.use("/api/uploads", express.static("src/uploads"));
  app.use("/uploads", express.static("src/uploads"));
}

/* ================= ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/highlights", highlightRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/mail", mailRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/translate", translate);

/* ================= HEALTH CHECK ================= */
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

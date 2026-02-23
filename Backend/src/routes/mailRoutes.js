// src/routes/mailRoutes.js
import express from "express";
import auth from '../middleware/auth.js';
import {
  authViaGoogle,
  googleCallback,
  fetchMailAttachments,
  listMailFiles,
  downloadMailFile,
  getMailFile, // ✅ Add this import
} from "../controllers/mailController.js";

const router = express.Router();

// Public routes (no authentication needed)
router.get("/google", authViaGoogle);
router.get("/google/callback", googleCallback);

// Protected routes (authentication required)
router.post("/fetch", auth, fetchMailAttachments);
router.get("/files", auth, listMailFiles);
router.get("/file/:id", auth, getMailFile); // ✅ Get single file details
router.get("/download/:id", auth, downloadMailFile); // ✅ Download file

export default router;
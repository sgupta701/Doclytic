// src/controllers/mailController.js
import { google } from "googleapis";
import GmailToken from "../models/GmailToken.js";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { Readable } from "stream";
import { getGFS } from "../utils/gridfs.js";
import mongoose from "mongoose";

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// -----------------------------
// Google login URL
// -----------------------------
export const authViaGoogle = (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  });
  res.json({ authUrl: url });
};

// -----------------------------
// Google OAuth callback
// -----------------------------
export const googleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing code");

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userinfo } = await oauth2.userinfo.get();

    console.log("🔴 Google userinfo:", userinfo);

    // Find or create user
    let user = await User.findOne({ email: userinfo.email });
    if (!user) {
      user = await User.create({
        full_name: userinfo.name,
        email: userinfo.email,
        password: "google-oauth",
      });
      console.log("🔴 Created new user:", user);
    } else {
      console.log("🔴 Found existing user:", user);
    }

    // Save token per user
    await GmailToken.findOneAndUpdate(
      { userId: user._id },
      { ...tokens, userId: user._id },
      { upsert: true }
    );

    const appToken = jwt.sign(
      { id: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("🔴 Generated JWT token for user ID:", user._id.toString());

    const profileData = {
      id: user._id.toString(),
      email: user.email,
      full_name: user.full_name,
      avatar_url: userinfo.picture || ""
    };

    const encodedProfile = encodeURIComponent(JSON.stringify(profileData));
    const redirectUrl = `${process.env.FRONTEND_URL}/auth-callback?token=${appToken}&profile=${encodedProfile}`;
    
    console.log("🔴 Redirecting to:", redirectUrl);
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("❌ googleCallback error:", err);
    res.status(500).send("Google OAuth failed");
  }
};

// -----------------------------
// Load token for a specific user
// -----------------------------
export const loadToken = async (userId) => {
  const saved = await GmailToken.findOne({ userId });
  if (!saved) return null;
  oauth2Client.setCredentials(saved);
  return oauth2Client;
};

// -----------------------------
// Fetch first 10 unread emails with attachments
// -----------------------------
export const fetchMailAttachments = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    if (!userId) {
      console.log("❌ No userId in request");
      return res.status(401).json({ error: "Not authenticated" });
    }

    console.log("🔴 Fetching emails for user:", userId);

    const client = await loadToken(userId);
    if (!client) {
      console.log("🔴 No Gmail token found for user:", userId);
      return res.status(401).json({ error: "Not authenticated with Gmail. Please login with Google first." });
    }

    console.log("🔴 Gmail token found, fetching emails...");

    const gmail = google.gmail({ version: "v1", auth: client });
    const gfs = await getGFS();

    const { data } = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
      maxResults: 10,
    });

    const messages = data.messages || [];
    const savedFiles = [];

    for (const mail of messages) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: mail.id,
        format: "full",
      });

      const parts = msg.data.payload.parts || [];
      for (const part of parts) {
        if (!part.filename || !part.body.attachmentId) continue;

        const attachment = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: mail.id,
          id: part.body.attachmentId,
        });

        const fileBuffer = Buffer.from(attachment.data.data, "base64");
        const uniqueName = `${Date.now()}-${part.filename}`;

        // ✅ FIX: Store userId in metadata so we can filter by user later
        const uploadStream = gfs.openUploadStream(uniqueName, {
          metadata: {
            userId: userId.toString(), // ✅ ADD THIS
            from: msg.data.payload.headers.find((h) => h.name === "From")?.value || "",
            subject: msg.data.payload.headers.find((h) => h.name === "Subject")?.value || "",
            messageId: mail.id,
          },
        });

        const readable = new Readable();
        readable.push(fileBuffer);
        readable.push(null);
        readable.pipe(uploadStream);

        savedFiles.push({ filename: uniqueName, messageId: mail.id });
      }

      // Mark mail as read
      await gmail.users.messages.modify({
        userId: "me",
        id: mail.id,
        resource: { removeLabelIds: ["UNREAD"] },
      });
    }

    res.json({ message: "Fetched unread mail attachments", saved: savedFiles });
  } catch (err) {
    console.error("❌ fetchMailAttachments error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------
// ✅ FIX: List stored attachments - ONLY for current user
// -----------------------------
export const listMailFiles = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    console.log("🔴 Listing files for user:", userId);

    await getGFS();
    
    // ✅ FIX: Filter by userId in metadata
    const files = await mongoose.connection.db
      .collection("mailUploads.files")
      .find({ "metadata.userId": userId.toString() }) // ✅ FILTER BY USER
      .toArray();

    console.log(`✅ Found ${files.length} files for user ${userId}`);
    res.json(files);
  } catch (err) {
    console.error("❌ listMailFiles error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------
// ✅ Get single file details - ONLY if it belongs to current user
// -----------------------------
export const getMailFile = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { id } = req.params;

    const file = await mongoose.connection.db
      .collection("mailUploads.files")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // ✅ Check if file belongs to current user
    if (file.metadata?.userId !== userId.toString()) {
      console.log(`❌ User ${userId} tried to access file owned by ${file.metadata?.userId}`);
      return res.status(403).json({ message: "Access denied. This file does not belong to you." });
    }

    console.log(`✅ User ${userId} accessing their file: ${file.filename}`);
    res.json(file);
  } catch (err) {
    console.error("❌ getMailFile error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------
// ✅ FIX: Download file - ONLY if it belongs to current user
// -----------------------------
export const downloadMailFile = async (req, res) => {
  try {
    const userId = req.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { id } = req.params;
    const gfs = await getGFS();

    const file = await mongoose.connection.db
      .collection("mailUploads.files")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // ✅ FIX: Check if file belongs to current user
    if (file.metadata?.userId !== userId.toString()) {
      console.log(`❌ User ${userId} tried to access file owned by ${file.metadata?.userId}`);
      return res.status(403).json({ message: "Access denied. This file does not belong to you." });
    }

    console.log(`✅ User ${userId} downloading their file: ${file.filename}`);

    res.set("Content-Disposition", `attachment; filename="${file.filename}"`);
    gfs.openDownloadStream(file._id).pipe(res);
  } catch (err) {
    console.error("❌ downloadMailFile error:", err);
    res.status(500).json({ error: err.message });
  }
};
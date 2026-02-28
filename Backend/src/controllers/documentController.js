import { io } from '../server.js';
import Notification from '../models/Notification.js';
import Document from '../models/Document.js';
import DocumentPermission from '../models/DocumentPermission.js';
import DocumentVersion from '../models/DocumentVersion.js';
import User from '../models/User.js';
import { uploadProvider, uploadToS3 } from '../utils/upload.js';
import { sendNotification } from "../utils/sendNotification.js";

import dotenv from 'dotenv';
dotenv.config();

const formatDocumentForClient = (doc) => {
  const plain = doc?.toObject ? doc.toObject() : doc;
  if (plain?.department_id && typeof plain.department_id === "object") {
    plain.department = plain.department_id;
  }
  return plain;
};

export const createDocument = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("department_id");
    if (!user) return res.status(401).json({ message: "User not found" });

    const payload = req.body;
    payload.uploaded_by = req.userId;
    // Default to uploader's department when department_id is not provided.
    if (!payload.department_id && user.department_id) {
      payload.department_id = user.department_id;
    }

    if (req.file) {
      if (uploadProvider === 's3') {
        const key = `${Date.now()}_${req.file.originalname}`;
        const s3resp = await uploadToS3(req.file.buffer, key, req.file.mimetype);
        payload.file_url = s3resp.Location || `${process.env.S3_BASE_URL}/${key}`;
      } else {
        payload.file_url = `/uploads/${req.file.filename}`;
      }
    }

    const doc = await Document.create(payload);

    await DocumentPermission.create({
      document_id: doc._id,
      user_id: req.userId,
      permission_level: "admin",
      granted_by: req.userId,
    });

    await DocumentVersion.create({
      document_id: doc._id,
      version_number: 1,
      content: doc.content,
      changed_by: req.userId,
      change_summary: "Initial version",
    });

    // 🔔 Send Notification
    await sendNotification(
      req.userId,
      `Your document "${doc.title}" has been uploaded.`,
      "success"
    );

    const hydrated = await Document.findById(doc._id).populate('department_id', 'name color');
    res.json(formatDocumentForClient(hydrated));

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


export const getDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id)
      .populate('uploaded_by', 'email full_name')
      .populate('department_id', 'name color');
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    res.json(formatDocumentForClient(doc));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const listDocuments = async (req, res) => {
  try {
    const docs = await Document.find({})
      .populate('department_id', 'name color')
      .sort({ createdAt: -1 });

    res.json(docs.map(formatDocumentForClient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    const perm = await DocumentPermission.findOne({
      document_id: id,
      user_id: req.userId,
    });
    const isUploader = doc.uploaded_by?.toString() === req.userId;

    if (!isUploader && !perm) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (req.file) {
      if (uploadProvider === "s3") {
        const key = `${Date.now()}_${req.file.originalname}`;
        const s3resp = await uploadToS3(
          req.file.buffer,
          key,
          req.file.mimetype
        );
        req.body.file_url =
          s3resp.Location || `${process.env.S3_BASE_URL}/${key}`;
      } else {
        req.body.file_url = `/uploads/${req.file.filename}`;
      }
    }

    const updated = await Document.findByIdAndUpdate(id, req.body, {
      new: true,
    });

    if (req.body.content && req.body.content !== doc.content) {
      const latest = await DocumentVersion.find({
        document_id: id,
      })
        .sort({ version_number: -1 })
        .limit(1);

      const nextVersion = (latest[0]?.version_number || 1) + 1;

      await DocumentVersion.create({
        document_id: id,
        version_number: nextVersion,
        content: req.body.content,
        changed_by: req.userId,
        change_summary: req.body.change_summary || "Content updated",
      });
    }

    // 🔔 Send Notification
    await sendNotification(
      doc.uploaded_by,
      `Your document "${doc.title}" was updated.`,
      "info"
    );

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    if (doc.uploaded_by.toString() !== req.userId) return res.status(403).json({ message: 'Not allowed' });

    await Document.deleteOne({ _id: id });
    await DocumentPermission.deleteMany({ document_id: id });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};


export const uploadDocument = async (req, res) => {
  try {
    const payload = {
      title: req.body.title,
      content: req.body.content || "",
      uploaded_by: req.userId,
      file_url: req.file ? `/uploads/${req.file.filename}` : null
    };

    const doc = await Document.create(payload);

    const notification = await Notification.create({
      userId: req.userId,
      documentId: doc._id,
      message: "New document uploaded"
    });

    io.emit("new-notification", notification);

    res.json(doc);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Upload failed" });
  }
};

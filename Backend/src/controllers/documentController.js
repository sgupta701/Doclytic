import { Readable } from "stream";
import mongoose from "mongoose";
import { io } from "../server.js";
import Notification from "../models/Notification.js";
import Document from "../models/Document.js";
import DocumentPermission from "../models/DocumentPermission.js";
import DocumentVersion from "../models/DocumentVersion.js";
import DocumentExtraction from "../models/DocumentExtraction.js";
import DocumentPriority from "../models/DocumentPriority.js";
import User from "../models/User.js";
import { uploadProvider, uploadToS3 } from "../utils/upload.js";
import { sendNotification } from "../utils/sendNotification.js";
import { getGFS } from "../utils/gridfs.js";

import dotenv from "dotenv";
dotenv.config();

const DOCUMENT_BUCKET_NAME = "documentUploads";
const PYTHON_BACKEND_URL = (process.env.AI_API_URL || process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

const formatDocumentForClient = (doc) => {
  const plain = doc?.toObject ? doc.toObject() : doc;
  if (plain?.department_id && typeof plain.department_id === "object") {
    plain.department = plain.department_id;
  }
  return plain;
};

const mapPriorityLevelToUrgency = (priorityLevel) => {
  const normalized = String(priorityLevel || "").trim().toLowerCase();
  if (normalized === "critical" || normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";
  return "medium";
};

const buildDocumentDownloadUrl = (documentId) => `/api/documents/${documentId}/download`;

const uploadBufferToGridFS = async ({ buffer, filename, contentType, metadata }) => {
  const gfs = await getGFS(DOCUMENT_BUCKET_NAME);
  const uploadStream = gfs.openUploadStream(filename, {
    contentType,
    metadata,
  });

  await new Promise((resolve, reject) => {
    Readable.from(buffer).pipe(uploadStream).on("finish", resolve).on("error", reject);
  });

  return uploadStream.id;
};

const storeIncomingFile = async ({ documentId, userId, file }) => {
  if (uploadProvider === "s3") {
    const key = `${Date.now()}_${file.originalname}`;
    const s3resp = await uploadToS3(file.buffer, key, file.mimetype);
    return {
      fileUrl: s3resp.Location || `${process.env.S3_BASE_URL}/${key}`,
      fileType: file.mimetype,
      storageFileId: null,
    };
  }

  const uniqueName = `${Date.now()}_${file.originalname}`;
  const fileId = await uploadBufferToGridFS({
    buffer: file.buffer,
    filename: uniqueName,
    contentType: file.mimetype,
    metadata: {
      documentId: String(documentId),
      uploadedBy: String(userId),
      originalName: file.originalname,
    },
  });

  return {
    fileUrl: buildDocumentDownloadUrl(documentId),
    fileType: file.mimetype,
    storageFileId: String(fileId),
  };
};

const deleteStoredFileIfAny = async (storageFileId) => {
  if (!storageFileId || !mongoose.Types.ObjectId.isValid(storageFileId)) return;
  const gfs = await getGFS(DOCUMENT_BUCKET_NAME);
  await gfs.delete(new mongoose.Types.ObjectId(storageFileId));
};

const resolveOriginalFilename = async (doc) => {
  if (!doc?.storage_file_id || !mongoose.Types.ObjectId.isValid(doc.storage_file_id)) {
    return doc?.original_filename || "";
  }

  const file = await mongoose.connection.db
    .collection(`${DOCUMENT_BUCKET_NAME}.files`)
    .findOne({ _id: new mongoose.Types.ObjectId(doc.storage_file_id) });

  return (
    doc?.original_filename ||
    file?.metadata?.originalName ||
    file?.metadata?.originalFilename ||
    file?.filename ||
    ""
  );
};

const isRoutingOnlyUpdatePayload = (body) => {
  if (!body || typeof body !== "object") return false;
  const allowedTopLevel = new Set([
    "department_id",
    "routed_department",
    "routed_departments",
    "metadata",
  ]);
  const keys = Object.keys(body);
  if (keys.length === 0) return false;
  if (keys.some((key) => !allowedTopLevel.has(key))) return false;

  if (!("metadata" in body)) return true;
  if (!body.metadata || typeof body.metadata !== "object") return false;

  const allowedMetadataKeys = new Set([
    "manual_review",
    "classification",
    "routing_history",
  ]);
  return Object.keys(body.metadata).every((key) => allowedMetadataKeys.has(key));
};

const isPendingManualReviewDocument = (doc) => {
  const routed = String(doc?.routed_department || "").trim().toLowerCase();
  const manual = doc?.metadata?.manual_review || {};
  const status = String(manual?.status || "").trim().toLowerCase();
  return (
    routed === "manual_review" ||
    manual?.required === true ||
    status === "pending"
  );
};

const isAiPostProcessingUpdate = (body) => {
  if (!body || typeof body !== "object") return false;

  if (body.suppress_notification) return true;

  return Boolean(
    body.priority ||
    body.extraction ||
    body.original_filename ||
    body.metadata?.manual_review ||
    body.routed_department === "manual_review"
  );
};

const notifyDepartmentUsersAboutUpload = async (doc, uploaderId) => {
  if (!doc?.department_id) return;

  const recipients = await User.find({
    department_id: doc.department_id,
    _id: { $ne: uploaderId },
  }).select("_id");

  await Promise.all(
    recipients.map((recipient) =>
      sendNotification(
        recipient._id,
        `A new document "${doc.title}" was uploaded for your department.`,
        "info",
        {
          title: "New Department Document",
          document_id: doc._id,
        }
      )
    )
  );
};

export const createDocument = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("department_id");
    if (!user) return res.status(401).json({ message: "User not found" });

    const payload = { ...req.body };
    payload.uploaded_by = req.userId;
    if (!payload.department_id && user.department_id) {
      payload.department_id = user.department_id;
    }

    const doc = await Document.create(payload);

    if (req.file) {
      const filePayload = await storeIncomingFile({
        documentId: doc._id,
        userId: req.userId,
        file: req.file,
      });
      await Document.findByIdAndUpdate(doc._id, {
        file_url: filePayload.fileUrl,
        file_type: filePayload.fileType,
        original_filename: req.file.originalname,
        storage_file_id: filePayload.storageFileId,
      });
    }

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

    await sendNotification(
      req.userId,
      `Your document "${doc.title}" has been uploaded.`,
      "success",
      {
        title: "Document Uploaded",
        document_id: doc._id,
      }
    );

    await notifyDepartmentUsersAboutUpload(doc, req.userId);

    const hydrated = await Document.findById(doc._id).populate("department_id", "name color");
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
      .populate("uploaded_by", "email full_name")
      .populate("department_id", "name color");
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const priority = await DocumentPriority.findOne({ document_id: doc._id }).lean();
    const original_filename = await resolveOriginalFilename(doc);
    res.json({
      ...formatDocumentForClient(doc),
      original_filename,
      priority: priority || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const listDocuments = async (req, res) => {
  try {
    const docs = await Document.find({})
      .populate("department_id", "name color")
      .sort({ createdAt: -1 });

    const docIds = docs.map((d) => d._id);
    const priorities = await DocumentPriority.find({
      document_id: { $in: docIds },
    }).lean();
    const priorityByDocumentId = new Map(
      priorities.map((p) => [String(p.document_id), p])
    );

    res.json(
      docs.map((doc) => {
        const formatted = formatDocumentForClient(doc);
        return {
          ...formatted,
          priority: priorityByDocumentId.get(String(doc._id)) || null,
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const downloadDocumentFile = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id).lean();
    if (!doc) return res.status(404).json({ message: "Document not found" });

    if (!doc.storage_file_id) {
      if (doc.file_url && /^https?:\/\//i.test(doc.file_url)) {
        return res.redirect(doc.file_url);
      }
      if (doc.python_file_id) {
        const pythonRes = await fetch(`${PYTHON_BACKEND_URL}/documents/${doc.python_file_id}/download`);
        if (pythonRes.ok) {
          const contentType =
            pythonRes.headers.get("content-type") || doc.file_type || "application/octet-stream";
          const originalName =
            pythonRes.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ||
            pythonRes.headers.get("x-original-filename") ||
            doc.original_filename ||
            doc.title ||
            "document";

          res.set("Content-Type", contentType);
          res.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, X-Original-Filename");
          res.set("X-Original-Filename", originalName);
          res.set("Content-Disposition", `inline; filename="${originalName}"`);

          const pythonArrayBuffer = await pythonRes.arrayBuffer();
          return res.send(Buffer.from(pythonArrayBuffer));
        }
      }

      return res.status(404).json({ message: "No DB file available for this document" });
    }

    if (!mongoose.Types.ObjectId.isValid(doc.storage_file_id)) {
      return res.status(400).json({ message: "Invalid storage file id" });
    }

    const fileObjectId = new mongoose.Types.ObjectId(doc.storage_file_id);
    const file = await mongoose.connection.db
      .collection(`${DOCUMENT_BUCKET_NAME}.files`)
      .findOne({ _id: fileObjectId });

    if (!file) {
      if (doc.python_file_id) {
        try {
          const pythonRes = await fetch(`${PYTHON_BACKEND_URL}/documents/${doc.python_file_id}/download`);
          if (pythonRes.ok) {
            const contentType =
              pythonRes.headers.get("content-type") || doc.file_type || "application/octet-stream";
            const originalName =
              pythonRes.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ||
              pythonRes.headers.get("x-original-filename") ||
              doc.original_filename ||
              doc.title ||
              "document";

            res.set("Content-Type", contentType);
            res.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, X-Original-Filename");
            res.set("X-Original-Filename", originalName);
            res.set("Content-Disposition", `inline; filename="${originalName}"`);

            const pythonArrayBuffer = await pythonRes.arrayBuffer();
            return res.send(Buffer.from(pythonArrayBuffer));
          }
        } catch (pythonErr) {
          console.error("Python preview fallback failed:", pythonErr);
        }
      }

      return res.status(404).json({ message: "Stored file not found" });
    }

    const originalName =
      file.metadata?.originalName ||
      file.metadata?.originalFilename ||
      file.filename ||
      doc.title ||
      "document";

    res.set(
      "Content-Type",
      file.contentType || file.metadata?.contentType || doc.file_type || "application/octet-stream"
    );
    res.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, X-Original-Filename");
    res.set("X-Original-Filename", originalName);
    res.set(
      "Content-Disposition",
      `inline; filename="${originalName}"`
    );

    const gfs = await getGFS(DOCUMENT_BUCKET_NAME);
    gfs.openDownloadStream(fileObjectId).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    const shouldSuppressNotification = isAiPostProcessingUpdate(req.body);
    if (req.body && typeof req.body === "object") {
      delete req.body.suppress_notification;
    }
    const perm = await DocumentPermission.findOne({
      document_id: id,
      user_id: req.userId,
    });
    const isUploader = doc.uploaded_by?.toString() === req.userId;
    const isRoutingOnlyUpdate =
      !req.file &&
      isRoutingOnlyUpdatePayload(req.body) &&
      isPendingManualReviewDocument(doc);

    if (!isUploader && !perm && !isRoutingOnlyUpdate) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (req.file) {
      const previousStorageFileId = doc.storage_file_id;
      const filePayload = await storeIncomingFile({
        documentId: doc._id,
        userId: req.userId,
        file: req.file,
      });

      req.body.file_url = filePayload.fileUrl;
      req.body.file_type = filePayload.fileType;
      req.body.original_filename = req.file.originalname;
      req.body.storage_file_id = filePayload.storageFileId;

      if (previousStorageFileId && previousStorageFileId !== filePayload.storageFileId) {
        await deleteStoredFileIfAny(previousStorageFileId);
      }
    }

    const extractionPayload = req.body.extraction;
    if (extractionPayload && typeof extractionPayload === "object") {
      const parsedDeadline = extractionPayload.selected_deadline
        ? new Date(extractionPayload.selected_deadline)
        : null;
      const safeSelectedDeadline =
        parsedDeadline && !Number.isNaN(parsedDeadline.getTime())
          ? parsedDeadline
          : null;

      const extractionDoc = {
        document_id: id,
        sender: extractionPayload.sender || {},
        document_type: extractionPayload.document_type || "",
        dates: {
          selected_deadline: safeSelectedDeadline,
        },
        urgency_indicators: Array.isArray(extractionPayload.urgency_indicators)
          ? extractionPayload.urgency_indicators
          : [],
        extraction_model_version:
          extractionPayload.extraction_model_version || "rule-v1",
        extraction_confidence:
          typeof extractionPayload.extraction_confidence === "number"
            ? extractionPayload.extraction_confidence
            : 0,
      };

      await DocumentExtraction.findOneAndUpdate(
        { document_id: id },
        { $set: extractionDoc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const priorityPayload = req.body.priority;
    if (priorityPayload && typeof priorityPayload === "object") {
      const priorityDoc = {
        document_id: id,
        priority_score:
          typeof priorityPayload.priority_score === "number"
            ? priorityPayload.priority_score
            : 0,
        priority_level: priorityPayload.priority_level || "Low",
        breakdown: priorityPayload.breakdown || {},
        escalation: priorityPayload.escalation || { applied: false, reason: "none" },
        engine_version: priorityPayload.engine_version || "rule-v1",
      };

      await DocumentPriority.findOneAndUpdate(
        { document_id: id },
        { $set: priorityDoc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      req.body.urgency = mapPriorityLevelToUrgency(priorityDoc.priority_level);
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

    if (!shouldSuppressNotification) {
      await sendNotification(
        doc.uploaded_by,
        `Your document "${doc.title}" was updated.`,
        "info"
      );
    }

    const updatedPriority = await DocumentPriority.findOne({ document_id: id }).lean();
    res.json({
      ...formatDocumentForClient(updated),
      priority: updatedPriority || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (doc.uploaded_by.toString() !== req.userId) return res.status(403).json({ message: "Not allowed" });

    if (doc.storage_file_id) {
      await deleteStoredFileIfAny(doc.storage_file_id);
    }

    await Document.deleteOne({ _id: id });
    await DocumentPermission.deleteMany({ document_id: id });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const uploadDocument = async (req, res) => {
  try {
    const payload = {
      title: req.body.title,
      content: req.body.content || "",
      uploaded_by: req.userId,
      file_url: null,
      file_type: req.file?.mimetype || null,
      original_filename: req.file?.originalname || null,
      storage_file_id: null,
    };

    const doc = await Document.create(payload);

    if (req.file) {
      const filePayload = await storeIncomingFile({
        documentId: doc._id,
        userId: req.userId,
        file: req.file,
      });

      await Document.findByIdAndUpdate(doc._id, {
        file_url: filePayload.fileUrl,
        file_type: filePayload.fileType,
        original_filename: req.file.originalname,
        storage_file_id: filePayload.storageFileId,
      });
    }

    const notification = await Notification.create({
      userId: req.userId,
      documentId: doc._id,
      message: "New document uploaded",
    });

    io.emit("new-notification", notification);

    const hydrated = await Document.findById(doc._id);
    res.json(hydrated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Upload failed" });
  }
};

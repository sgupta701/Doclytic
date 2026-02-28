import mongoose from "mongoose";
const DocumentSchema = new mongoose.Schema({
  title: String,
  summary: String,
  content: String,
  urgency: { type: String, enum: ["high", "medium", "low"], default: "medium" },
  department_id: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
  routed_department: String,
  uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  file_url: String,
  metadata: Object
}, { timestamps: true });

export default mongoose.model("Document", DocumentSchema);

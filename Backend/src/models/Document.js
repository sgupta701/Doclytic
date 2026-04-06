import mongoose from "mongoose";
const DocumentSchema = new mongoose.Schema({
  title: String,
  summary: String,
  content: String,
  urgency: { type: String, enum: ["high", "medium", "low"], default: "medium" },
  department_id: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
  routed_department: String,
  routed_departments: [String],
  uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  file_url: String,
  file_type: String,
  original_filename: String,
  storage_file_id: String,
  python_file_id: String,
  metadata: Object
}, { timestamps: true });

export default mongoose.model("Document", DocumentSchema);

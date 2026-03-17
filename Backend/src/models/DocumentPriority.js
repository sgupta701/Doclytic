import mongoose from "mongoose";

const BreakdownSchema = new mongoose.Schema({
  sender_weight: Number,
  deadline_score: Number,
  urgency_score: Number,
  doc_type_weight: Number
}, { _id: false });

const EscalationSchema = new mongoose.Schema({
  applied: Boolean,
  reason: String
}, { _id: false });

const DocumentPrioritySchema = new mongoose.Schema({
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Document",
    required: true
  },

  priority_score: Number,
  priority_level: {
    type: String,
    enum: ["Low", "Medium", "High", "Critical"]
  },

  breakdown: BreakdownSchema,

  escalation: EscalationSchema,

  engine_version: String

}, { timestamps: true });

export default mongoose.model("DocumentPriority", DocumentPrioritySchema);
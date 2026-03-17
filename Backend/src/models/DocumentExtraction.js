import mongoose from "mongoose";

const DeadlineSchema = new mongoose.Schema({
  original_text: String,
  normalized: Date,
  confidence: Number
}, { _id: false });

const DocumentExtractionSchema = new mongoose.Schema({
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Document",
    required: true
  },

  sender: {
    name: String,
    category: String
  },

  document_type: String,

  dates: {
    received_date: Date,
    all_detected_deadlines: [DeadlineSchema],
    selected_deadline: Date
  },

  urgency_indicators: [String],

  extraction_model_version: String,
  extraction_confidence: Number

}, { timestamps: true });

export default mongoose.model("DocumentExtraction", DocumentExtractionSchema);
import mongoose from "mongoose";

const PriorityOverrideSchema = new mongoose.Schema({
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Document",
    required: true
  },

  old_level: String,
  new_level: String,
  reason: String,

  overridden_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }

}, { timestamps: true });

export default mongoose.model("PriorityOverride", PriorityOverrideSchema);
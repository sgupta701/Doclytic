import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: "Notification" },
    message: { type: String, required: true },
    type: { type: String, default: "info" }, // info | success | warning
    document_id: { type: mongoose.Schema.Types.ObjectId, ref: "Document", default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;

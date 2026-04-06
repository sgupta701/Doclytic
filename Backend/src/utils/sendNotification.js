import Notification from "../models/Notification.js";
import { io } from "../server.js";

export const sendNotification = async (userId, message, type = "info", options = {}) => {
  try {
    const notification = await Notification.create({
      user: userId,
      title: options.title || "Notification",
      message,
      type,
      document_id: options.document_id || null,
    });

    io.to(`user:${String(userId)}`).emit("new-notification", notification);
    return notification;
  } catch (err) {
    console.error("Notification Error:", err);
    return null;
  }
};

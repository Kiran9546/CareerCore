import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["new_job", "low_prs", "skill_reminder", "application_status", "recommendation_update", "placement_update", "system"],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: String,
    isRead: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
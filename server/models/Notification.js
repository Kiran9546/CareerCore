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
      enum: ["new_job", "low_prs", "skill_reminder", "application_status", "recommendation_update", "placement_update", "drive_opportunity", "system"],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: String,
    isRead: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
    metadata: mongoose.Schema.Types.Mixed,
    /**
     * Idempotency key for workflow notifications ("this student was told
     * about this drive"). Unique where set, so a retried or concurrent
     * publish cannot notify the same student twice.
     */
    dedupeKey: String,
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);

export default mongoose.model("Notification", notificationSchema);
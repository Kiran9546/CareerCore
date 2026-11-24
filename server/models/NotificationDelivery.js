import mongoose from "mongoose";

/**
 * One outbound copy of a notification on one external channel (email or
 * WhatsApp) for one student, and everything that happened to it.
 *
 * The in-app notification itself stays in `notifications` — it is what the
 * bell and the website notification centre show, and it is created first,
 * inside the publish request. These rows are the durable outbox for the
 * slower channels: the publish request only inserts them, and the delivery
 * worker (jobs/deliveryWorker.js) sends them in the background. A restart
 * loses nothing, because the queue is this collection.
 *
 * `idempotencyKey` is unique ("drive:<id>:eligible:<studentId>:email"), so a
 * retried publish, a recalculation, two officers clicking at once or a
 * backfill can never create a second row — and therefore never a second
 * message — for the same student, drive and channel.
 *
 * The recipient's address is deliberately NOT stored: it is read from the
 * student's record at send time (so a corrected address is used), and only
 * a masked form is kept for the officer's delivery report.
 */

export const DELIVERY_CHANNELS = ["email", "whatsapp"];

export const DELIVERY_STATUS = {
  /** Waiting for the worker (first attempt or a scheduled retry). */
  PENDING: "pending",
  /** Claimed by a worker that is sending it now. */
  PROCESSING: "processing",
  /** Accepted by the provider (SMTP server / WhatsApp Cloud API). */
  SENT: "sent",
  /** WhatsApp only: the delivery webhook confirmed it reached the phone. */
  DELIVERED: "delivered",
  /** WhatsApp only: the delivery webhook reported it read. */
  READ: "read",
  /** Gave up: a permanent error, or every retry was used. */
  FAILED: "failed",
  /** Not sent on purpose: no consent, no valid address, no longer eligible. */
  SKIPPED: "skipped",
  /** Sandbox mode: rendered and recorded, never sent to anyone. */
  SIMULATED: "simulated",
};

export const SKIP_REASONS = {
  NO_EMAIL: "no_email",
  NO_PHONE: "no_phone",
  INVALID_PHONE: "invalid_phone",
  NO_CONSENT: "no_consent",
  ACCOUNT_INACTIVE: "account_inactive",
  NO_LONGER_ELIGIBLE: "no_longer_eligible",
  REGISTRATION_CLOSED: "registration_closed",
  STUDENT_REMOVED: "student_removed",
};

/** Statuses that mean a message reached (or was accepted for) the student. */
export const DELIVERED_STATUSES = [DELIVERY_STATUS.SENT, DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.READ];

const notificationDeliverySchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true },
    event: { type: String, enum: ["drive_opportunity"], required: true },
    channel: { type: String, enum: DELIVERY_CHANNELS, required: true },

    driveId: { type: mongoose.Schema.Types.ObjectId, ref: "Drive", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    /** The in-app notification this is a copy of. */
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: "Notification" },

    status: {
      type: String,
      enum: Object.values(DELIVERY_STATUS),
      default: DELIVERY_STATUS.PENDING,
      required: true,
    },
    skipReason: { type: String, enum: Object.values(SKIP_REASONS) },

    /** "ki•••@example.com" / "+91••••••3210", for the officer's report. */
    recipientMasked: String,

    attempts: { type: Number, default: 0, min: 0 },
    /** Officer-initiated retries, counted separately from automatic ones. */
    manualRetries: { type: Number, default: 0, min: 0 },
    nextAttemptAt: Date,
    lastAttemptAt: Date,
    lockedUntil: Date,
    lockedBy: String,

    provider: String,
    providerMessageId: String,
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
    failedAt: Date,

    /** Last error, with any address or number in the provider's message redacted. */
    lastError: {
      code: String,
      message: String,
      permanent: Boolean,
      at: Date,
    },
  },
  { timestamps: true },
);

notificationDeliverySchema.index({ idempotencyKey: 1 }, { unique: true });
// The worker's queue scan: one channel's due rows, oldest first. Also
// serves the stale-lease sweep, which filters on status alone.
notificationDeliverySchema.index({ status: 1, channel: 1, nextAttemptAt: 1 });
// Per-drive report and counts.
notificationDeliverySchema.index({ driveId: 1, channel: 1, status: 1 });
// Delivery-status webhooks look rows up by the provider's message id.
notificationDeliverySchema.index(
  { providerMessageId: 1 },
  { partialFilterExpression: { providerMessageId: { $type: "string" } } },
);

export default mongoose.model("NotificationDelivery", notificationDeliverySchema);

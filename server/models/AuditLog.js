import mongoose from "mongoose";

/**
 * Administrative audit trail for the recruitment workflow.
 *
 * Append-only by construction: there is no API that updates or deletes an
 * entry, and the hooks below refuse every update and delete issued through
 * Mongoose, so a future handler cannot quietly rewrite history either.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorName: String,
    actorRole: String,
    action: { type: String, required: true },

    driveId: { type: mongoose.Schema.Types.ObjectId, ref: "Drive" },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
    companyName: String,
    roundId: mongoose.Schema.Types.ObjectId,
    roundName: String,
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    studentUsn: String,
    /** Bulk operations record how many students they touched. */
    studentCount: Number,

    from: mongoose.Schema.Types.Mixed,
    to: mongoose.Schema.Types.Mixed,
    note: { type: String, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ driveId: 1, createdAt: -1 });
auditLogSchema.index({ studentId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const refuse = (next) =>
  next(Object.assign(new Error("Audit records cannot be modified or deleted"), { status: 403 }));

for (const op of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
  "findOneAndReplace",
]) {
  auditLogSchema.pre(op, function (next) {
    refuse(next);
  });
}
auditLogSchema.pre("save", function (next) {
  if (!this.isNew) return refuse(next);
  next();
});

export default mongoose.model("AuditLog", auditLogSchema);

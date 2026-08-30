import mongoose from "mongoose";
import { STAGE_STATUS, FINAL_STATUS } from "../config/constants.js";

/**
 * One student's official record in one drive.
 *
 * This collection is the entire evidence base for the placement profile.
 * Every summary number a student, faculty member or placement officer sees
 * — attempts, pass counts, interviews reached, offers, success rate — is
 * recomputed from these documents by buildPlacementProfile(). None of those
 * totals are stored anywhere, so a corrected stage result cannot leave a
 * stale total behind.
 *
 * ─── WHY `not_reached` IS A FIRST-CLASS STATUS ────────────────────────
 * A student knocked out at the aptitude round never sat the technical
 * round. Recording that as `failed` would be a lie, and it would make an
 * aptitude-blocked student statistically indistinguishable from a student
 * who repeatedly reaches the technical round and fails it — which are
 * completely different problems needing completely different advice.
 * `not_reached` is therefore the default for every stage, and the profile
 * service never counts it as an attempt.
 * ──────────────────────────────────────────────────────────────────────
 */

/** A pass/fail round: aptitude, technical, interview. */
const stageResultSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: Object.values(STAGE_STATUS),
      default: STAGE_STATUS.NOT_REACHED,
    },
    /** Optional raw mark, when the company shared one. Never required —
     *  many companies report pass/fail only. */
    score: { type: Number, min: 0, max: 100 },
    note: { type: String, maxlength: 500 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedAt: Date,
  },
  { _id: false },
);

/** The final selection decision, plus the offer it produced. */
const finalResultSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: Object.values(FINAL_STATUS),
      default: FINAL_STATUS.NOT_REACHED,
    },
    offer: {
      ctc: { type: Number, min: 0 },
      role: String,
      offerDate: Date,
      accepted: { type: Boolean, default: false },
    },
    note: { type: String, maxlength: 500 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedAt: Date,
  },
  { _id: false },
);

const driveParticipationSchema = new mongoose.Schema(
  {
    driveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Drive",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    registeredAt: { type: Date, default: Date.now },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    stages: {
      aptitude: { type: stageResultSchema, default: () => ({}) },
      technical: { type: stageResultSchema, default: () => ({}) },
      interview: { type: stageResultSchema, default: () => ({}) },
      final: { type: finalResultSchema, default: () => ({}) },
    },

    /** Append-only audit trail. Official results are staff-entered records
     *  about a student's career, so every change keeps its author. */
    history: [
      {
        stage: String,
        from: String,
        to: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: String,
        _id: false,
      },
    ],
  },
  { timestamps: true },
);

// One record per student per drive.
driveParticipationSchema.index({ driveId: 1, studentId: 1 }, { unique: true });
// Profile build reads every participation for one student, newest first.
driveParticipationSchema.index({ studentId: 1, createdAt: -1 });

/**
 * Record a stage change and log it. Returns false when nothing changed,
 * so callers can avoid writing an empty audit entry.
 */
driveParticipationSchema.methods.applyStageResult = function (
  stage,
  { status, score, note, offer },
  userId,
) {
  const current = this.stages[stage];
  const from = current?.status;

  if (status !== undefined) current.status = status;
  if (score !== undefined) current.score = score;
  if (note !== undefined) current.note = note;
  if (stage === "final" && offer) {
    current.offer = { ...(current.offer?.toObject?.() ?? current.offer), ...offer };
  }
  current.updatedBy = userId;
  current.updatedAt = new Date();

  this.history.push({
    stage,
    from,
    to: current.status,
    changedAt: new Date(),
    changedBy: userId,
    note,
  });

  return from !== current.status;
};

export default mongoose.model("DriveParticipation", driveParticipationSchema);

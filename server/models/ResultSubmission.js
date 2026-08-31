import mongoose from "mongoose";
import {
  DRIVE_STAGES,
  STAGE_STATUS,
  FINAL_STATUS,
  SUBMISSION_STATUS,
  RESULT_SOURCE,
} from "../config/constants.js";

/**
 * A set of stage results travelling toward the official record.
 *
 * ─── WHY A PIPELINE AND NOT A DIRECT WRITE ────────────────────────────
 *
 * Three people may know how a student did in a drive, and they find out at
 * different times: the student who sat the rounds, the faculty member who
 * debriefs them, and the placement officer the company reports to. The
 * pipeline lets each contribute without waiting on the others:
 *
 *   requested   faculty has asked a named student for their results.
 *               This IS the permission — a student can only fill in a
 *               submission that already exists in this state for them, so
 *               there is no way to self-report unasked.
 *   submitted   the student filled it in; their department's faculty sees it.
 *   forwarded   faculty accepted it and wrote it onto the participation.
 *   rejected    faculty declined it; the official record was not touched.
 *
 * The placement officer never has to enter this pipeline at all — they write
 * official results directly, and import spreadsheets directly. Equally,
 * faculty can create a submission already filled in and forward it in one
 * step without involving a student. The two paths are independent by design.
 *
 * `DriveParticipation.stages` remains the only thing any metric is computed
 * from. A submission that has not been forwarded has changed nothing.
 * ──────────────────────────────────────────────────────────────────────
 */

/** The proposed outcome for one pass/fail round. */
const proposedStageSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [...Object.values(STAGE_STATUS), ...Object.values(FINAL_STATUS)],
      default: STAGE_STATUS.NOT_REACHED,
    },
    score: { type: Number, min: 0, max: 100 },
    note: { type: String, maxlength: 500 },
  },
  { _id: false },
);

const resultSubmissionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    driveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Drive",
      required: true,
      index: true,
    },
    /** Resolved when the submission is forwarded; created on demand if the
     *  student was never registered for the drive. */
    participationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriveParticipation",
    },

    /**
     * Denormalized from the student at creation. Faculty scoping reads this
     * on every query, and copying it avoids a join per row — a student's
     * branch does not change mid-placement-season.
     */
    department: { type: String, required: true, uppercase: true, index: true },

    status: {
      type: String,
      enum: Object.values(SUBMISSION_STATUS),
      default: SUBMISSION_STATUS.REQUESTED,
      index: true,
    },

    /** Where the numbers came from, kept on the official record afterwards. */
    source: {
      type: String,
      enum: Object.values(RESULT_SOURCE),
      default: RESULT_SOURCE.STUDENT,
    },

    stages: {
      aptitude: { type: proposedStageSchema, default: () => ({}) },
      technical: { type: proposedStageSchema, default: () => ({}) },
      interview: { type: proposedStageSchema, default: () => ({}) },
      final: { type: proposedStageSchema, default: () => ({}) },
    },

    /** Offer terms, only meaningful when final is `selected`. */
    offer: {
      ctc: { type: Number, min: 0 },
      role: String,
      offerDate: Date,
    },

    /** Free text from whoever filled it in. */
    studentNote: { type: String, maxlength: 1000 },
    facultyNote: { type: String, maxlength: 1000 },

    // ── Who did what, and when ──
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    requestedAt: Date,
    requestNote: { type: String, maxlength: 500 },

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    submittedAt: Date,

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,

    /** Set when the officer imported a spreadsheet, for traceability. */
    importBatchId: { type: String, index: true },
    importFilename: String,
  },
  { timestamps: true },
);

// One live submission per student per drive. Sparse on status so a rejected
// one does not block a fresh request for the same drive.
resultSubmissionSchema.index(
  { studentId: 1, driveId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [SUBMISSION_STATUS.REQUESTED, SUBMISSION_STATUS.SUBMITTED] },
    },
  },
);
resultSubmissionSchema.index({ department: 1, status: 1, updatedAt: -1 });

/** True once a student can no longer edit it. */
resultSubmissionSchema.virtual("isLocked").get(function () {
  return (
    this.status === SUBMISSION_STATUS.FORWARDED ||
    this.status === SUBMISSION_STATUS.REJECTED
  );
});

/** The stages this submission actually proposes a change to. */
resultSubmissionSchema.methods.filledStages = function () {
  return DRIVE_STAGES.filter(
    (s) => this.stages?.[s]?.status && this.stages[s].status !== STAGE_STATUS.NOT_REACHED,
  );
};

resultSubmissionSchema.set("toJSON", { virtuals: true });
resultSubmissionSchema.set("toObject", { virtuals: true });

export default mongoose.model("ResultSubmission", resultSubmissionSchema);

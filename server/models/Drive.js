import mongoose from "mongoose";
import {
  DRIVE_STAGES,
  DRIVE_STATUS,
  DRIVE_WORKFLOW,
  MANAGED_DRIVE_STATUS,
  ROUND_TYPE_CODES,
  ROUND_STATUS,
  ROUND_MODES,
} from "../config/constants.js";

/**
 * A campus placement drive — the official record of one company visiting
 * for one role, owned by the placement cell.
 *
 * Deliberately NOT the same thing as a `Job`. A Job is posted by a
 * self-registered recruiter through the jobs module and students apply to
 * it themselves. A Drive is created by placement staff and is the source
 * of official, staff-verified outcomes. Most companies that run a campus
 * drive never create a recruiter account at all, which is why
 * `companyName` is a plain required string and `companyId` is an optional
 * link for the cases where a Company document does happen to exist.
 *
 * Modelling follows the existing project convention: embed what is bounded
 * and always read with the parent (eligibility, stage list), reference what
 * is shared (companyId, createdBy). Per-student results are NOT embedded —
 * they are unbounded and written independently, so they live in their own
 * `driveparticipations` collection.
 */

const eligibilitySchema = new mongoose.Schema(
  {
    minCgpa: { type: Number, default: 0, min: 0, max: 10 },
    maxBacklogs: { type: Number, default: 0, min: 0 },
    branches: { type: [String], default: [] }, // empty = all branches
    batches: { type: [String], default: [] },  // empty = all batches (graduation year)

    // Managed drives only: when the eligible list was last calculated and
    // against which version of the criteria. Editing a criterion bumps the
    // version, so a stale calculation is visible rather than silently reused.
    version: { type: Number, default: 1 },
    calculatedVersion: Number,
    calculatedAt: Date,
  },
  { _id: false },
);

/**
 * One configured round of a managed drive. Bounded (a handful per drive) and
 * always read with the drive, so embedded; the per-student attendance and
 * results are unbounded and live in `roundresults`.
 */
const roundSchema = new mongoose.Schema({
  type: { type: String, enum: ROUND_TYPE_CODES, required: true },
  order: { type: Number, required: true, min: 1 },
  schedule: {
    date: Date,
    startTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    mode: { type: String, enum: ROUND_MODES },
    venue: { type: String, maxlength: 200 },
    meetingLink: { type: String, maxlength: 500 },
    instructions: { type: String, maxlength: 2000 },
  },
  status: {
    type: String,
    enum: Object.values(ROUND_STATUS),
    default: ROUND_STATUS.PENDING,
  },
  /** Set once the participant list has been derived (round 1 from the
   *  registrations, later rounds from the previous round's passes). */
  participantsSeededAt: Date,
  finalizedAt: Date,
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reopenCount: { type: Number, default: 0 },
});

const driveSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },

    // Optional link to a registered recruiter's company, when one exists.
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },

    role: { type: String, required: true, trim: true },
    description: { type: String, maxlength: 2000 },
    location: String,
    ctc: { type: Number, min: 0 },

    driveDate: { type: Date, required: true },

    eligibility: { type: eligibilitySchema, default: () => ({}) },

    /**
     * Which rounds this drive actually runs, in order. Some companies skip
     * the technical round entirely; recording that is what lets the profile
     * distinguish "no technical round existed" from "never got that far".
     */
    stages: {
      type: [String],
      enum: DRIVE_STAGES,
      default: () => [...DRIVE_STAGES],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "A drive must run at least one stage",
      },
    },

    status: {
      type: String,
      // Recorded drives use DRIVE_STATUS; managed drives use the fuller
      // lifecycle. Both vocabularies share completed and cancelled.
      enum: [...new Set([...Object.values(DRIVE_STATUS), ...Object.values(MANAGED_DRIVE_STATUS)])],
      default: DRIVE_STATUS.PLANNED,
    },

    /**
     * How this drive is run. Absent on every drive created before the
     * recruitment workflow existed, which is read as `recorded`.
     */
    workflow: {
      type: String,
      enum: Object.values(DRIVE_WORKFLOW),
      default: DRIVE_WORKFLOW.RECORDED,
    },

    // ── Managed workflow ──
    registrationDeadline: Date,
    rounds: { type: [roundSchema], default: [] },
    publishedAt: Date,
    completedAt: Date,
    /** The drive this one was cloned from, when it was. Configuration only —
     *  nothing operational is copied. */
    clonedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Drive" },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /**
     * Stable identifier used only by the development seed so it can upsert
     * instead of duplicating on every run. Sparse — real drives created
     * through the UI never carry one.
     */
    seedKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

driveSchema.index({ driveDate: -1 });
driveSchema.index({ status: 1, driveDate: -1 });
driveSchema.index({ companyName: 1 });
driveSchema.index({ companyId: 1, driveDate: -1 });
driveSchema.index({ workflow: 1, status: 1, registrationDeadline: 1 });

/** Stages this drive runs, in canonical order (guards against bad input order). */
driveSchema.methods.orderedStages = function () {
  return DRIVE_STAGES.filter((s) => this.stages.includes(s));
};

driveSchema.methods.isManaged = function () {
  return this.workflow === DRIVE_WORKFLOW.MANAGED;
};

/** Configured rounds sorted by their order. */
driveSchema.methods.orderedRounds = function () {
  return [...(this.rounds || [])].sort((a, b) => a.order - b.order);
};

export default mongoose.model("Drive", driveSchema);

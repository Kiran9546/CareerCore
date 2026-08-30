import mongoose from "mongoose";
import { DRIVE_STAGES, DRIVE_STATUS } from "../config/constants.js";

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
    batches: { type: [String], default: [] },  // empty = all batches
  },
  { _id: false },
);

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
      enum: Object.values(DRIVE_STATUS),
      default: DRIVE_STATUS.PLANNED,
    },

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

/** Stages this drive runs, in canonical order (guards against bad input order). */
driveSchema.methods.orderedStages = function () {
  return DRIVE_STAGES.filter((s) => this.stages.includes(s));
};

export default mongoose.model("Drive", driveSchema);

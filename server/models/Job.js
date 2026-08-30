import mongoose from "mongoose";
import { JOB_SOURCE, COMPANY_LEVEL_VALUES } from "../config/constants.js";

/**
 * One job opening students can browse and apply to.
 *
 * Two kinds of posting share this schema:
 *
 *   source: "recruiter"       a self-registered recruiter posting against
 *                             their own Company document (the original path)
 *   source: "placement_cell"  the placement officer relaying an opening a
 *                             company sent to the college
 *
 * The second kind usually has no Company document behind it — the company
 * emailed a JD and never created an account — which is why `companyId` is
 * optional and `companyName` exists alongside it. Every read must therefore
 * fall back to `companyName` when `companyId` is absent.
 */

const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },   // on-disk name
    originalName: { type: String, required: true }, // what the officer uploaded
    url: { type: String, required: true },
    mimeType: String,
    sizeBytes: Number,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const jobSchema = new mongoose.Schema(
  {
    // A posting must identify its company one way or the other, so each of
    // these is required exactly when the other is missing. Expressed as
    // conditional `required` rather than a pre("validate") hook, because an
    // async hook is skipped by validateSync() and the rule would then hold
    // only on save.
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
      required: [
        function () { return !this.companyName?.trim(); },
        "A job needs either a company profile or a company name",
      ],
    },

    /** Used when there is no Company document. Read via `companyLabel`. */
    companyName: {
      type: String,
      trim: true,
      required: [
        function () { return !this.companyId; },
        "Company name is required for a placement cell posting",
      ],
    },

    source: {
      type: String,
      enum: Object.values(JOB_SOURCE),
      default: JOB_SOURCE.RECRUITER,
      index: true,
    },

    /** Who created the posting. Set for placement-cell postings. */
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    /** Campus tier — "dream", "mass recruiter" and so on. */
    companyLevel: { type: String, enum: COMPANY_LEVEL_VALUES },

    /** Free-text company blurb the officer types in. */
    companyAbout: { type: String, maxlength: 3000 },

    /** Free-text requirements, for anything the skill list cannot express. */
    requirements: { type: String, maxlength: 3000 },

    /** JD and any other material the company sent. */
    attachments: { type: [attachmentSchema], default: [] },
    title: { type: String, required: true, trim: true },
    description: { type: String, maxlength: 3000 },
    role: String,
    location: String,
    ctc: Number,

    requiredSkills: [
      {
        skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill" },
        name: String,
        isMandatory: { type: Boolean, default: false },
        _id: false,
      },
    ],

    minCgpa: { type: Number, default: 0, min: 0, max: 10 },
    maxBacklogs: { type: Number, default: 99, min: 0 },
    eligibleBranches: { type: [String], default: [] },
    eligibleBatches: { type: [String], default: [] },

    deadline: Date,
    isActive: { type: Boolean, default: true },
    openings: { type: Number, default: 1 },
  },
  { timestamps: true },
);

jobSchema.index({ isActive: 1, deadline: 1 });
jobSchema.index({ source: 1, createdAt: -1 }); // placement cell's own list

/**
 * The company name to display, whichever kind of posting this is.
 * Only resolves the populated form when companyId has actually been
 * populated — an unpopulated ObjectId would otherwise stringify into the UI.
 */
jobSchema.virtual("companyLabel").get(function () {
  if (this.companyId && typeof this.companyId === "object" && this.companyId.name) {
    return this.companyId.name;
  }
  return this.companyName || null;
});

jobSchema.set("toJSON", { virtuals: true });
jobSchema.set("toObject", { virtuals: true });

export default mongoose.model("Job", jobSchema);

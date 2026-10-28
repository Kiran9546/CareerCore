import mongoose from "mongoose";

/**
 * One student's eligibility for one managed drive, and what they were told.
 *
 * Kept apart from DriveParticipation on purpose. A participation means "this
 * student registered" — the placement profile, the export and every legacy
 * count read it that way — so an eligible student who never registered must
 * not have one. This collection answers the questions a participation
 * cannot: who was eligible, why the others were not, who was notified, and
 * who looked at the drive.
 *
 * Rewritten by every eligibility calculation (an upsert per student), so it
 * always reflects the current criteria. Notification and view timestamps are
 * never cleared by a recalculation.
 */
const driveCandidateSchema = new mongoose.Schema(
  {
    driveId: { type: mongoose.Schema.Types.ObjectId, ref: "Drive", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    eligible: { type: Boolean, required: true },
    /** Human-readable reasons when not eligible ("CGPA 7.2 is below 7.5"). */
    reasons: { type: [String], default: [] },
    /** True when a required academic field was missing or invalid. */
    missingData: { type: Boolean, default: false },

    /** Denormalised copy of the fields the criteria were evaluated on, so the
     *  eligible list can be filtered and paginated without a join. */
    academic: {
      name: String,
      usn: String,
      branch: String,
      batch: String,
      cgpa: Number,
      backlogs: Number,
    },

    criteriaVersion: Number,
    evaluatedAt: Date,

    notifiedAt: Date,
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: "Notification" },
    deadlineReminderAt: Date,
    viewedAt: Date,
  },
  { timestamps: true },
);

driveCandidateSchema.index({ driveId: 1, studentId: 1 }, { unique: true });
driveCandidateSchema.index({ driveId: 1, eligible: 1, "academic.branch": 1 });
driveCandidateSchema.index({ studentId: 1, eligible: 1 });

export default mongoose.model("DriveCandidate", driveCandidateSchema);

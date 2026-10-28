import mongoose from "mongoose";
import { ATTENDANCE, ROUND_RESULT } from "../config/constants.js";

/**
 * One student's place in one round of a managed drive.
 *
 * A document exists only for students who actually entered the round: round 1
 * from the drive's valid registrations, every later round from the passes of
 * the round before it. Nobody is ever typed in, and the unique index makes a
 * second entry for the same student in the same round impossible, however
 * many times progression runs.
 *
 * Attendance and result are separate fields — appearing is not passing.
 * Finalizing the round sets `locked` on every document, and every write
 * filters on `locked: false`, so a result cannot change once the round is
 * closed even if a request races the finalize.
 */
const roundResultSchema = new mongoose.Schema(
  {
    driveId: { type: mongoose.Schema.Types.ObjectId, ref: "Drive", required: true },
    roundId: { type: mongoose.Schema.Types.ObjectId, required: true },
    roundOrder: { type: Number, required: true },
    roundType: { type: String, required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    participationId: { type: mongoose.Schema.Types.ObjectId, ref: "DriveParticipation", required: true },

    attendance: {
      type: String,
      enum: Object.values(ATTENDANCE),
      default: ATTENDANCE.UNMARKED,
    },
    result: {
      type: String,
      enum: Object.values(ROUND_RESULT),
      default: ROUND_RESULT.PENDING,
    },
    remarks: { type: String, maxlength: 500 },

    locked: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    /** Denormalised for search and filtering inside a round. */
    student: { name: String, usn: String, branch: String, cgpa: Number, backlogs: Number },

    /** Append-only: every attendance and result change with its author. */
    history: [
      {
        field: String,
        from: String,
        to: String,
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: String,
        _id: false,
      },
    ],
  },
  { timestamps: true },
);

roundResultSchema.index({ roundId: 1, studentId: 1 }, { unique: true });
roundResultSchema.index({ driveId: 1, roundOrder: 1, result: 1 });
roundResultSchema.index({ roundId: 1, attendance: 1, result: 1 });
roundResultSchema.index({ studentId: 1, driveId: 1, roundOrder: 1 });

export default mongoose.model("RoundResult", roundResultSchema);

import mongoose from "mongoose";

/**
 * A student's aptitude test attempt.
 * totalScore feeds directly into the PRS formula as T (Blueprint 5.1).
 */
const aptitudeAttemptSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    sectionScores: {
      quantitative: { type: Number, default: 0, min: 0, max: 100 },
      logical:      { type: Number, default: 0, min: 0, max: 100 },
      verbal:       { type: Number, default: 0, min: 0, max: 100 },
      technical:    { type: Number, default: 0, min: 0, max: 100 },
    },

    // T = (Q + L + V + Tech) / 4
    totalScore: { type: Number, default: 0, min: 0, max: 100 },

    responses: [
      {
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: "AptitudeQuestion" },
        section: String,
        selected: String,
        isCorrect: Boolean,
        _id: false,
      },
    ],

    questionsServed: [{ type: mongoose.Schema.Types.ObjectId, ref: "AptitudeQuestion" }],

    status: {
      type: String,
      enum: ["in_progress", "submitted", "expired"],
      default: "in_progress",
    },

    startedAt: { type: Date, default: Date.now },
    submittedAt: Date,
    durationSeconds: Number,
    timeLimitSeconds: { type: Number, default: 1800 },  // 30 minutes
  },
  { timestamps: true }
);

// Latest attempt lookup for PRS computation
aptitudeAttemptSchema.index({ studentId: 1, submittedAt: -1 });

export default mongoose.model("AptitudeAttempt", aptitudeAttemptSchema);
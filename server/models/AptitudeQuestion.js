import mongoose from "mongoose";
import { APTITUDE_SECTIONS } from "../config/constants.js";

/**
 * Aptitude question bank — authored by admin, delivered to students.
 *
 * This module was absent from the Phase 1 report despite aptitude (T)
 * being a PRS input (Blueprint Correction 1.3).
 */
const aptitudeQuestionSchema = new mongoose.Schema(
  {
    section: {
      type: String,
      required: true,
      enum: APTITUDE_SECTIONS,
      index: true,
    },
    questionText: { type: String, required: true, trim: true },

    options: [
      {
        label: { type: String, required: true },   // "A", "B", "C", "D"
        text: { type: String, required: true },
        _id: false,
      },
    ],

    // select:false — never sent to students with the question
    correctOption: { type: String, required: true, select: false },
    explanation: { type: String, select: false },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

aptitudeQuestionSchema.index({ section: 1, isActive: 1 });

export default mongoose.model("AptitudeQuestion", aptitudeQuestionSchema);
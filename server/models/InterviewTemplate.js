import mongoose from "mongoose";
import { ROUND_TYPE_CODES } from "../config/constants.js";

/**
 * A reusable, editable interview process ("Software Recruitment: Aptitude →
 * Coding → Technical → HR"). Applying a template copies its rounds into the
 * drive, so editing a template later never changes a drive already set up.
 */
const interviewTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** Set only on the starter templates, so they are created once. */
    key: String,
    rounds: {
      type: [{ type: String, enum: ROUND_TYPE_CODES }],
      validate: [
        {
          validator: (v) => Array.isArray(v) && v.length > 0,
          message: "A template needs at least one round",
        },
        {
          validator: (v) => new Set(v).size === v.length,
          message: "A template cannot contain the same round twice",
        },
      ],
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

interviewTemplateSchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { key: { $type: "string" } } },
);

export default mongoose.model("InterviewTemplate", interviewTemplateSchema);

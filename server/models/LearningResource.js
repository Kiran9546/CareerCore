import mongoose from "mongoose";

const learningResourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    provider: { type: String, required: true },
    url: { type: String, required: true },
    type: {
      type: String,
      enum: ["course", "certification", "tutorial", "documentation", "video"],
      default: "course",
    },
    skillNames: { type: [String], default: [], index: true },
    skillIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Skill" }],
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    durationHours: Number,
    isFree: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

learningResourceSchema.index({ skillNames: 1, difficulty: 1 });

export default mongoose.model("LearningResource", learningResourceSchema);
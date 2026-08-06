import mongoose from "mongoose";

/**
 * Skill master taxonomy.
 * Every skill vector in the system indexes into this collection,
 * so normalization here is critical — "reactjs" and "React" must
 * resolve to the SAME document or all cosine similarity breaks.
 */
const skillSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    normalizedName: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    aliases: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Programming", "Frontend", "Backend", "Database",
        "Data Science", "DevOps", "Cloud", "Security",
        "Testing", "Mobile", "Fundamentals", "Soft Skills",
      ],
    },
  },
  { timestamps: true }
);

// Text index for search-as-you-type in the profile UI
skillSchema.index({ name: "text", aliases: "text" });

export default mongoose.model("Skill", skillSchema);
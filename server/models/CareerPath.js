import mongoose from "mongoose";

/**
 * Career path definitions with importance-weighted skill vectors.
 *
 * These weights are the TARGET VECTOR (V_t) in the cosine similarity
 * computation (Blueprint 5.4) and the label space for the Random Forest
 * classifier (Blueprint 5.5).
 *
 * WARNING: editing weights invalidates the trained model.
 * Any change requires regenerating the dataset and retraining.
 */
const careerPathSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    description: String,

    requiredSkills: [
      {
        skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill", required: true },
        name: { type: String, required: true },   // denormalized: avoids populate on every render
        weight: { type: Number, required: true, min: 0, max: 1 },
      },
    ],

    typicalCgpaRange: {
      min: { type: Number, default: 6.0 },
      max: { type: Number, default: 10.0 },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("CareerPath", careerPathSchema);
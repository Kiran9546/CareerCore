import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
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

export default mongoose.model("Job", jobSchema);

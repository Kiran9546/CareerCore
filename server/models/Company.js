import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    recruiterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    name: { type: String, required: true, trim: true },
    industry: String,
    website: String,
    description: { type: String, maxlength: 1000 },
    location: String,
    logoUrl: String,
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("Company", companySchema);

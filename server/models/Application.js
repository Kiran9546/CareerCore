import mongoose from "mongoose";
import { APPLICATION_STATUS } from "../config/constants.js";

const applicationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    matchPercent: Number,
    prsAtApplication: Number,

    status: {
      type: String,
      enum: Object.values(APPLICATION_STATUS),
      default: APPLICATION_STATUS.APPLIED,
    },
    statusHistory: [
      {
        status: String,
        changedAt: { type: Date, default: Date.now },
        note: String,
        _id: false,
      },
    ],

    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

applicationSchema.index({ studentId: 1, jobId: 1 }, { unique: true });

export default mongoose.model("Application", applicationSchema);

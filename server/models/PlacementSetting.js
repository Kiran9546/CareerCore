import mongoose from "mongoose";
import { PARTICIPATION_POLICY } from "../config/constants.js";

/**
 * College-wide placement settings, one document per `key`. Today that is the
 * participation policy; the shape leaves room for more without a new model.
 */
const placementSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    participationPolicy: {
      type: String,
      enum: Object.values(PARTICIPATION_POLICY),
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export default mongoose.model("PlacementSetting", placementSettingSchema);

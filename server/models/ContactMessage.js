import mongoose from "mongoose";

export const CONTACT_TOPICS = ["account", "placement", "privacy", "technical", "other"];
export const CONTACT_STATUS = ["new", "resolved"];

/** A message sent through the contact form, read by administrators. */
const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    topic: { type: String, enum: CONTACT_TOPICS, required: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    // Set when the sender was signed in, so an administrator can see who it is.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: CONTACT_STATUS, default: "new", index: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date,
    emailed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

contactMessageSchema.index({ createdAt: -1 });

export default mongoose.model("ContactMessage", contactMessageSchema);

import mongoose from "mongoose";

/**
 * Comparison key for a company name, so "ABC Technologies",
 * "abc technologies " and "ABC Technologies Pvt. Ltd." are recognised as the
 * same company and the placement cell cannot create it twice.
 */
const LEGAL_SUFFIXES = new Set([
  "pvt", "private", "ltd", "limited", "inc", "incorporated", "llp", "llc", "corp", "corporation", "co",
]);

export const companyNameKey = (name) => {
  const words = String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
};

const companySchema = new mongoose.Schema(
  {
    /**
     * The recruiter account that owned this profile, on records created
     * before the recruiter area was retired. Companies are now added by the
     * placement cell and have no owner. Uniqueness only applies where an
     * owner exists — see the partial index below and
     * migrations/placementWorkflow.js.
     */
    recruiterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: { type: String, required: true, trim: true },
    /** companyNameKey(name). Unique where set; records created before this
     *  field existed get it from the migration. */
    nameKey: { type: String },
    source: {
      type: String,
      enum: ["recruiter", "placement_cell"],
      default: "recruiter",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    industry: String,
    website: String,
    description: { type: String, maxlength: 1000 },
    location: String,
    logoUrl: String,
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

companySchema.index(
  { recruiterUserId: 1 },
  { unique: true, partialFilterExpression: { recruiterUserId: { $type: "objectId" } } },
);
companySchema.index(
  { nameKey: 1 },
  { unique: true, partialFilterExpression: { nameKey: { $type: "string" } } },
);

companySchema.pre("validate", function (next) {
  // Only on create or rename, so saving an older record for an unrelated
  // change never trips over the key.
  if (this.isNew || this.isModified("name")) {
    this.nameKey = companyNameKey(this.name) || undefined;
  }
  next();
});

export default mongoose.model("Company", companySchema);

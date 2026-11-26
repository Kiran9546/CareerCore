import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES } from "../config/constants.js";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by default queries
    },
    role: {
      type: String,
      required: true,
      enum: Object.values(ROLES),
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * The department a faculty member belongs to, matching Student.branch.
     *
     * Faculty only ever see their own department's students, so this is the
     * key their whole view is scoped by — a faculty account without one can
     * see nothing, which is deliberate: better an empty list than another
     * department's records. Ignored for every other role.
     */
    department: {
      type: String,
      uppercase: true,
      trim: true,
      required: [
        function () { return this.role === "faculty"; },
        "Faculty accounts must belong to a department",
      ],
    },

    // ── Contact details (collected at registration, kept by the user) ──
    // The account is where contact details live: they are known at sign-up,
    // before any academic profile exists, and they belong to the person.
    /** Mobile number in E.164 ("+919876543210"). Not trusted until verified. */
    phone: { type: String, trim: true },
    /** Set only after the user entered the code sent to `phone` on WhatsApp. */
    phoneVerifiedAt: Date,
    /** Set only after the user opened the link sent to `email`. */
    emailVerifiedAt: Date,
    /**
     * Placement drive emails. On by default (and for accounts created before
     * this setting existed); the student can turn them off in their profile.
     * In-app notifications are not affected.
     */
    emailAlerts: {
      optIn: { type: Boolean, default: true },
      changedAt: Date,
    },
    /**
     * WhatsApp alerts. Messages go only when optIn is true AND the phone is
     * verified: consent alone is not proof the number is theirs.
     */
    whatsapp: {
      optIn: { type: Boolean, default: false },
      consentAt: Date,
      /** Which consent wording they agreed to (contactService). */
      consentVersion: String,
      consentSource: { type: String, enum: ["registration", "profile", "whatsapp_reply", "migration"] },
      optOutAt: Date,
    },
    // Pending verifications. Only hashes are stored; never returned.
    emailVerification: {
      type: { tokenHash: String, expiresAt: Date, sentAt: Date },
      select: false,
    },
    phoneVerification: {
      type: {
        phone: String,
        codeHash: String,
        expiresAt: Date,
        attempts: Number,
        sentAt: Date,
        windowStart: Date,
        windowCount: Number,
        consentSource: String,
      },
      select: false,
    },

    isActive: { type: Boolean, default: true },

    // Recruiters need admin approval before posting jobs
    isVerified: { type: Boolean, default: false },

    lastLoginAt: Date,
  },
  { timestamps: true }
);

/** Hash the password before saving, but only when it changed */
userSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next();
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

/** Compare a plaintext password against the stored hash */
userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** Strip sensitive fields from any JSON response */
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  delete obj.emailVerification;
  delete obj.phoneVerification;
  return obj;
};

// WhatsApp "STOP" replies and opt-out find the account by number.
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ "emailVerification.tokenHash": 1 }, { sparse: true });

export default mongoose.model("User", userSchema);
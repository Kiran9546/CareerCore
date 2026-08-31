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
  return obj;
};

export default mongoose.model("User", userSchema);
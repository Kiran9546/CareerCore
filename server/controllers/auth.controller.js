import User from "../models/User.js";
import { signToken } from "../utils/jwt.js";
import { ROLES } from "../config/constants.js";

/** POST /api/auth/register */
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password and role are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${Object.values(ROLES).join(", ")}` });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const user = await User.create({
      name,
      email,
      passwordHash: password,          // hashed by the pre-save hook
      role,
      isVerified: role !== ROLES.RECRUITER, // recruiters await admin approval
    });

    res.status(201).json({ user, token: signToken(user) });
  } catch (err) {
    next(err);
  }
};

/** POST /api/auth/login */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // passwordHash has select:false, so request it explicitly
    const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");

    // Same message for both cases — don't reveal which emails exist
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: "Account has been deactivated" });
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    res.json({ user, token: signToken(user) });
  } catch (err) {
    next(err);
  }
};

/** GET /api/auth/me */
export const getMe = async (req, res) => {
  res.json({ user: req.user });
};
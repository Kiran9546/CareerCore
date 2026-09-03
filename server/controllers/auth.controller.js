import User from "../models/User.js";
import { signToken } from "../utils/jwt.js";
import { ROLES, DEPARTMENTS, DEPARTMENT_LABEL } from "../config/constants.js";

/**
 * Roles the public /register endpoint is allowed to create.
 *
 * Recruiter was removed when job posting moved to the placement cell:
 * openings now reach students through the placement officer, so there is
 * nothing for a new self-registered recruiter to do. Existing recruiter
 * accounts still sign in and keep their company and job records — the role
 * is retired from sign-up, not deleted.
 *
 * Placement officer IS self-registerable, by product decision. Note what
 * that grants: an officer can record official stage results and download
 * every student's contact details and academic record. The account is
 * created active, so there is no approval step between signing up and
 * holding that access. The `isVerified` flag and the `requireVerified`
 * middleware already exist and could gate the placement routes the way they
 * gate the recruiter routes, if that trade is ever revisited.
 *
 * Admin remains absent and is provisioned directly against the database.
 */
const SELF_REGISTERABLE_ROLES = [
  ROLES.STUDENT,
  ROLES.FACULTY,
  ROLES.PLACEMENT_OFFICER,
];

/** POST /api/auth/register */
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password and role are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${Object.values(ROLES).join(", ")}` });
    }
    // Admin accounts are provisioned directly against the database, never
    // self-served — otherwise anyone could POST role:"admin" and take over.
    if (!SELF_REGISTERABLE_ROLES.includes(role)) {
      return res.status(403).json({
        message: "This role cannot be self-registered — contact the placement cell",
      });
    }

    // Faculty are scoped to a department everywhere in the app, so an
    // account without one would be able to see nothing at all.
    if (role === ROLES.FACULTY) {
      if (!department) {
        return res.status(400).json({ message: "Select your department" });
      }
      if (!DEPARTMENTS.includes(String(department).toUpperCase())) {
        return res.status(400).json({
          message: `department must be one of: ${DEPARTMENTS.join(", ")}`,
        });
      }
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
      ...(role === ROLES.FACULTY
        ? { department: String(department).toUpperCase() }
        : {}),
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
/**
 * GET /api/auth/departments
 *
 * The department list the registration form offers.
 *
 * Public, because it is needed before anyone has an account. Served rather
 * than duplicated in the client because the two lists had already drifted
 * once — departments were added on the server and the sign-up form went on
 * offering the old five, so a mechanical faculty member simply could not
 * register.
 */
export const listDepartments = (req, res) => {
  res.json({
    departments: DEPARTMENTS.map((code) => ({
      code,
      label: DEPARTMENT_LABEL[code] ?? code,
    })),
  });
};

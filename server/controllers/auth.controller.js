import User from "../models/User.js";
import { signToken } from "../utils/jwt.js";
import { normalizePhone } from "../utils/phone.js";
import { asyncHandler as handle } from "../utils/asyncHandler.js";
import {
  sendEmailVerification,
  verifyEmailToken,
  sendPhoneCode,
  verifyPhoneCode,
  setWhatsAppOptIn,
  setEmailAlerts,
  updateContactPhone,
  contactView,
  WHATSAPP_CONSENT_VERSION,
} from "../services/contactService.js";
import { deliveryConfig } from "../config/notifications.js";
import { requestPasswordReset, checkResetToken, resetPassword } from "../services/passwordResetService.js";
import { ROLES, DEPARTMENTS, DEPARTMENT_LABEL, RECRUITER_RETIRED } from "../config/constants.js";

/**
 * Roles the public /register endpoint is allowed to create.
 *
 * Recruiter is retired entirely: the job-postings module it belonged to was
 * removed in favour of placement drives. Existing recruiter users and their
 * company records stay in the database, but cannot sign in (see login and
 * middleware/auth.js).
 *
 * Placement officer IS self-registerable, by product decision. Note what
 * that grants: an officer can record official stage results and download
 * every student's contact details and academic record. The account is
 * created active, so there is no approval step between signing up and
 * holding that access. The `isVerified` flag and the `requireVerified`
 * middleware already exist and could gate the placement routes if that trade
 * is ever revisited (docs/CLEANUP_PLAN.md, H1).
 *
 * Admin remains absent and is provisioned directly against the database.
 */
const SELF_REGISTERABLE_ROLES = [
  ROLES.STUDENT,
  ROLES.FACULTY,
  ROLES.PLACEMENT_OFFICER,
];

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST /api/auth/register
 *
 * Students may also send `phone` (with country code) and `whatsappConsent`.
 * The number is stored on the account, unverified. A verification link goes
 * to the email address, and — when they agreed to WhatsApp alerts — a code
 * goes to the number on WhatsApp. Delivery problems never block sign-up;
 * the student can resend from their profile.
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, department, phone, whatsappConsent } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password and role are required" });
    }
    if (typeof email !== "string" || !EMAIL_FORMAT.test(email.trim())) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }
    if (whatsappConsent !== undefined && typeof whatsappConsent !== "boolean") {
      return res.status(400).json({ message: "whatsappConsent must be true or false" });
    }
    let e164;
    if (phone !== undefined && phone !== null && String(phone).trim() !== "") {
      e164 = normalizePhone(phone);
      if (!e164) {
        return res.status(400).json({ message: "Enter a valid mobile number with country code, for example +91 98765 43210" });
      }
    }
    // With WhatsApp switched off, a consent sent by an older client is
    // ignored: nothing is recorded and no code is sent.
    const wantsWhatsApp = whatsappConsent === true && deliveryConfig().whatsapp.enabled;
    if (wantsWhatsApp && !e164) {
      return res.status(400).json({ message: "Enter your mobile number to receive WhatsApp alerts" });
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
        message: "This role cannot be self-registered. Contact the placement cell",
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
      // Stored unverified: it receives nothing until its code is entered.
      ...(e164 ? { phone: e164 } : {}),
      // Their consent is recorded as given; messages still wait for the code.
      ...(wantsWhatsApp
        ? { whatsapp: { optIn: true, consentAt: new Date(), consentVersion: WHATSAPP_CONSENT_VERSION, consentSource: "registration" } }
        : {}),
      isVerified: role !== ROLES.RECRUITER, // recruiters await admin approval
    });

    // Verification is started automatically; failures are reported, not fatal.
    const verification = { email: null, whatsapp: null };
    verification.email = await sendEmailVerification(user).catch((e) => ({ sent: false, reason: e.message }));
    if (wantsWhatsApp && e164) {
      verification.whatsapp = await sendPhoneCode(user, e164, { consent: true, source: "registration" })
        .catch((e) => ({ sent: false, reason: e.message }));
    }

    res.status(201).json({ user, token: signToken(user), verification });
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
    if (user.role === ROLES.RECRUITER) {
      return res.status(403).json({ message: RECRUITER_RETIRED });
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

// ─── Contact details and verification (any signed-in user) ───────────

/** GET /api/auth/contact */
export const getContact = handle(async (req, res) => {
  res.json(contactView(req.user));
});

/** POST /api/auth/email/resend */
export const resendEmailVerification = handle(async (req, res) => {
  const out = await sendEmailVerification(req.user);
  res.json(out);
});

/**
 * POST /api/auth/password/forgot { email } — public. Same answer whether or
 * not the account exists; the email is sent after the response.
 */
export const forgotPassword = handle(async (req, res) => {
  res.json(await requestPasswordReset(req.body?.email));
});

/** POST /api/auth/password/check { token } — public: is this reset link still usable? */
export const checkPasswordReset = handle(async (req, res) => {
  res.json(await checkResetToken(req.body?.token));
});

/** POST /api/auth/password/reset { token, password } — public: sets the new password. */
export const completePasswordReset = handle(async (req, res) => {
  const { email } = await resetPassword(req.body?.token, req.body?.password);
  res.json({ message: "Your password has been changed. Sign in with the new password.", email });
});

/** POST /api/auth/email/verify { token } — public: the link may be opened signed out. */
export const verifyEmail = handle(async (req, res) => {
  const user = await verifyEmailToken(req.body?.token);
  res.json({ verified: true, email: user.email });
});

/** POST /api/auth/phone/send-code { phone, consent: true } */
export const requestPhoneCode = handle(async (req, res) => {
  const out = await sendPhoneCode(req.user, req.body?.phone, { consent: req.body?.consent, source: "profile" });
  res.json(out);
});

/** POST /api/auth/phone/verify { code } */
export const confirmPhoneCode = handle(async (req, res) => {
  const { user, catchUp } = await verifyPhoneCode(req.user, req.body?.code);
  res.json({ ...contactView(user), catchUp });
});

/** PUT /api/auth/contact/whatsapp { optIn } */
export const updateWhatsAppOptIn = handle(async (req, res) => {
  const { user, catchUp } = await setWhatsAppOptIn(req.user, req.body?.optIn);
  res.json({ ...contactView(user), catchUp });
});

/** PUT /api/auth/contact/email { optIn } — placement drive emails on/off. */
export const updateEmailAlerts = handle(async (req, res) => {
  const { user, catchUp } = await setEmailAlerts(req.user, req.body?.optIn);
  res.json({ ...contactView(user), catchUp });
});

/** PUT /api/auth/contact/phone { phone } — the mobile number on the account. */
export const updateMobileNumber = handle(async (req, res) => {
  const user = await updateContactPhone(req.user, req.body?.phone);
  res.json(contactView(user));
});

/**
 * GET /api/auth/alert-channels — public: the sign-up form shows the
 * WhatsApp consent box only when WhatsApp alerts are in use.
 */
export const alertChannels = (req, res) => {
  const cfg = deliveryConfig();
  res.json({ inApp: true, email: cfg.email.enabled, whatsapp: cfg.whatsapp.enabled });
};

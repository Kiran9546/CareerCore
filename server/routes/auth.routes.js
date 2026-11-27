import express from "express";
import rateLimit from "express-rate-limit";
import {
  register,
  login,
  getMe,
  listDepartments,
  getContact,
  resendEmailVerification,
  verifyEmail,
  requestPhoneCode,
  confirmPhoneCode,
  updateWhatsAppOptIn,
  updateEmailAlerts,
  updateMobileNumber,
  alertChannels,
  forgotPassword,
  checkPasswordReset,
  completePasswordReset,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Brute-force protection on credential endpoints.
//
// Only failed attempts are counted. Guessing a password is a run of
// failures, so that is what the limit needs to catch; counting successes
// too locked people out of their own accounts for a quarter of an hour
// merely for signing in and out of several accounts in a row, which is
// exactly what demonstrating the three roles involves.
//
// Keyed on address AND account. A college network usually reaches us through
// a single NAT address, so a per-IP limit let twenty typos anywhere on campus
// lock every student out at once — typically in the middle of a drive's
// registration window. Per IP+email, guessing one account is still capped,
// and everyone else carries on.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${req.ip}|${String(req.body?.email || "").trim().toLowerCase()}`,
  message: { message: "Too many failed attempts. Please try again in 15 minutes" },
});

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
// Public: the sign-up form needs this before anyone has an account.
router.get("/departments", listDepartments);
router.get("/alert-channels", alertChannels);
router.get("/me", protect, getMe);

// ─── Contact details and verification ────────────────────────
// The services enforce their own per-account limits (one code a minute,
// five an hour, five wrong guesses per code); these limiters stop a script
// hammering the endpoints at all.
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `u:${req.user._id}` : `ip:${req.ip}`),
  message: { message: "Too many verification attempts. Please try again in 15 minutes" },
});
// Public link check: keyed by address, failures only.
const emailLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in 15 minutes" },
});

router.get("/contact", protect, getContact);
router.post("/email/verify", emailLinkLimiter, verifyEmail);

// ─── Forgot password ─────────────────────────────────────────
// Asking for a link: every request counts (successful or not), per address
// and per email, so nobody can flood one inbox or probe many addresses.
// The service also allows one email a minute per account.
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email || "").trim().toLowerCase()}`,
  message: { message: "Too many reset requests. Please try again in 15 minutes" },
});
const forgotPerAddress = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many reset requests. Please try again later" },
});
router.post("/password/forgot", forgotPerAddress, forgotLimiter, forgotPassword);
router.post("/password/check", emailLinkLimiter, checkPasswordReset);
router.post("/password/reset", emailLinkLimiter, completePasswordReset);
router.post("/email/resend", protect, verificationLimiter, resendEmailVerification);
router.post("/phone/send-code", protect, verificationLimiter, requestPhoneCode);
router.post("/phone/verify", protect, verificationLimiter, confirmPhoneCode);
router.put("/contact/whatsapp", protect, verificationLimiter, updateWhatsAppOptIn);
router.put("/contact/email", protect, verificationLimiter, updateEmailAlerts);
router.put("/contact/phone", protect, verificationLimiter, updateMobileNumber);

export default router;
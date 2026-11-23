import express from "express";
import rateLimit from "express-rate-limit";
import {
  register,
  login,
  getMe,
  listDepartments,
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
router.get("/me", protect, getMe);

export default router;
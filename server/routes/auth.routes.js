import express from "express";
import rateLimit from "express-rate-limit";
import { register, login, getMe } from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Brute-force protection on credential endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many attempts — please try again in 15 minutes" },
});

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.get("/me", protect, getMe);

export default router;
import express from "express";
import rateLimit from "express-rate-limit";
import { createContactMessage } from "../controllers/contact.controller.js";

const router = express.Router();

// Public form: cap how many messages one address can send.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "You have sent several messages in the last hour. Please wait before sending another." },
});

router.post("/", contactLimiter, createContactMessage);

export default router;

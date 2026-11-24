import crypto from "crypto";
import Student from "../models/Student.js";
import { asyncHandler as handle } from "../utils/asyncHandler.js";
import { httpError } from "../services/auditService.js";
import { loadManagedDrive } from "../services/recruitmentService.js";
import {
  driveDeliverySummary,
  listDriveDeliveries,
  retryDriveDeliveries,
  handleWhatsAppWebhook,
} from "../services/notificationDeliveryService.js";
import { deliveryConfig } from "../config/notifications.js";
import { normalizePhone, maskPhone } from "../utils/phone.js";

// ─── Placement officer: delivery report (routes in placement.routes.js) ──

export const deliverySummary = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json({ summary: await driveDeliverySummary(drive) });
});

export const deliveryList = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  res.json(await listDriveDeliveries(drive, req.query));
});

export const retryDeliveries = handle(async (req, res) => {
  const drive = await loadManagedDrive(req.params.id);
  const out = await retryDriveDeliveries(drive, { channel: req.body?.channel, ids: req.body?.ids }, req.user);
  res.json(out);
});

// ─── Student: WhatsApp consent (routes in student.routes.js) ─────────

/** Bump when the wording shown next to the checkbox changes. */
export const WHATSAPP_CONSENT_VERSION = "2026-11-placement-alerts-v1";
export const WHATSAPP_CONSENT_TEXT =
  "I agree to receive placement drive alerts from the CareerCore placement cell on WhatsApp at this number. " +
  "I can withdraw at any time here or by replying STOP.";

const preferencesView = (student, user) => {
  const cfg = deliveryConfig();
  const wa = student.whatsapp || {};
  return {
    email: { address: user.email, enabled: cfg.email.enabled },
    whatsapp: {
      available: cfg.whatsapp.enabled,
      number: wa.number || "",
      optIn: Boolean(wa.optIn),
      consentAt: wa.consentAt || null,
      optOutAt: wa.optOutAt || null,
      consentText: WHATSAPP_CONSENT_TEXT,
      consentVersion: WHATSAPP_CONSENT_VERSION,
    },
    phone: student.phone || "",
  };
};

export const getNotificationPreferences = handle(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id }).select("phone whatsapp");
  if (!student) throw httpError(404, "Profile not found");
  res.json(preferencesView(student, req.user));
});

/** PUT { whatsappNumber?, whatsappOptIn: boolean } */
export const updateNotificationPreferences = handle(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id }).select("phone whatsapp");
  if (!student) throw httpError(404, "Profile not found");

  const { whatsappNumber, whatsappOptIn } = req.body || {};
  if (typeof whatsappOptIn !== "boolean") throw httpError(400, "whatsappOptIn must be true or false");
  if (whatsappNumber !== undefined && whatsappNumber !== null && typeof whatsappNumber !== "string") {
    throw httpError(400, "whatsappNumber must be text");
  }

  const cfg = deliveryConfig();
  const raw = (whatsappNumber ?? "").trim() || student.whatsapp?.number || student.phone || "";
  const number = raw ? normalizePhone(raw, cfg.defaultCountryCode) : null;
  if ((whatsappNumber ?? "").trim() && !number) {
    throw httpError(400, "Enter a valid mobile number, for example +91 98765 43210");
  }
  if (whatsappOptIn && !number) {
    throw httpError(400, "Add a valid WhatsApp number before turning on WhatsApp alerts");
  }

  const wasOptedIn = Boolean(student.whatsapp?.optIn);
  const now = new Date();
  // Stored normalised, so a "STOP" reply can find the student by number.
  if (number) student.set("whatsapp.number", number);
  if (whatsappOptIn && !wasOptedIn) {
    student.set("whatsapp.optIn", true);
    student.set("whatsapp.consentAt", now);
    student.set("whatsapp.consentVersion", WHATSAPP_CONSENT_VERSION);
    student.set("whatsapp.consentSource", "profile");
    student.set("whatsapp.optOutAt", undefined);
  } else if (!whatsappOptIn && wasOptedIn) {
    student.set("whatsapp.optIn", false);
    student.set("whatsapp.optOutAt", now);
  }
  await student.save();
  res.json({ ...preferencesView(student, req.user), maskedNumber: maskPhone(student.whatsapp?.number) });
});

// ─── WhatsApp Cloud API webhook (routes in webhook.routes.js) ────────

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** GET: Meta's one-time subscription handshake. */
export const verifyWhatsAppWebhook = (req, res) => {
  const { verifyToken } = deliveryConfig().whatsapp;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (!verifyToken) return res.status(503).json({ message: "WhatsApp webhook is not configured" });
  if (mode === "subscribe" && typeof token === "string" && safeEqual(token, verifyToken) && typeof challenge === "string") {
    return res.status(200).type("text/plain").send(challenge);
  }
  return res.status(403).json({ message: "Verification failed" });
};

/**
 * POST: delivery statuses and inbound replies. The body is only trusted
 * after its X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app
 * secret) checks out; without an app secret configured nothing is accepted.
 */
export const receiveWhatsAppWebhook = async (req, res) => {
  const { appSecret } = deliveryConfig().whatsapp;
  if (!appSecret) return res.status(503).json({ message: "WhatsApp webhook is not configured" });

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const header = req.get("x-hub-signature-256") || "";
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(raw).digest("hex")}`;
  if (!header || !safeEqual(header, expected)) {
    return res.status(401).json({ message: "Invalid signature" });
  }

  let body;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid JSON" });
  }
  try {
    const out = await handleWhatsAppWebhook(body);
    res.status(200).json({ received: true, ...out });
  } catch (err) {
    // A non-200 makes Meta retry the callback later.
    console.error(`[delivery] webhook processing failed: ${err.message}`);
    res.status(500).json({ message: "Processing failed" });
  }
};

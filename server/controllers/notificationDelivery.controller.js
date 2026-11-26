import crypto from "crypto";
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
import { contactView, setContactPhone, savePhoneChange, setWhatsAppOptIn, setEmailAlerts } from "../services/contactService.js";

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

// ─── Student: alert settings (routes in student.routes.js) ──────────
//
// Kept for the profile screen; contact details live on the account and are
// managed by services/contactService.js (also exposed under /api/auth).

export { WHATSAPP_CONSENT_VERSION, WHATSAPP_CONSENT_TEXT } from "../services/contactService.js";

export const getNotificationPreferences = handle(async (req, res) => {
  res.json(contactView(req.user));
});

/**
 * PUT { emailOptIn?, whatsappOptIn?, whatsappNumber? }
 *
 * emailOptIn turns placement drive emails on or off (in-app notifications
 * always stay on). A new number is saved unverified (WhatsApp waits for its
 * code; see POST /api/auth/phone/send-code). whatsappOptIn turns alerts on
 * — only for a verified number — or off.
 */
export const updateNotificationPreferences = handle(async (req, res) => {
  const { emailOptIn, whatsappOptIn, whatsappNumber } = req.body || {};
  if (emailOptIn !== undefined && typeof emailOptIn !== "boolean") {
    throw httpError(400, "emailOptIn must be true or false");
  }
  if (whatsappNumber !== undefined && whatsappNumber !== null && typeof whatsappNumber !== "string") {
    throw httpError(400, "whatsappNumber must be text");
  }
  if (whatsappOptIn !== undefined && typeof whatsappOptIn !== "boolean") {
    throw httpError(400, "whatsappOptIn must be true or false");
  }
  if (emailOptIn === undefined && whatsappOptIn === undefined && !whatsappNumber) throw httpError(400, "Nothing to change");

  const user = req.user;
  if (whatsappNumber && (await setContactPhone(user, whatsappNumber))) await savePhoneChange(user);
  const catchUp = { queued: 0, drives: 0 };
  const add = (c) => {
    catchUp.queued += c.queued;
    catchUp.drives = Math.max(catchUp.drives, c.drives);
  };
  if (emailOptIn !== undefined) add((await setEmailAlerts(user, emailOptIn)).catchUp);
  if (whatsappOptIn !== undefined) add((await setWhatsAppOptIn(user, whatsappOptIn)).catchUp);
  res.json({ ...contactView(user), catchUp });
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

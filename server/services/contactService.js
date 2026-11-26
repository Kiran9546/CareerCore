import crypto from "crypto";
import User from "../models/User.js";
import Student from "../models/Student.js";
import { deliveryConfig, appBaseUrl } from "../config/notifications.js";
import { normalizePhone, maskPhone } from "../utils/phone.js";
import { httpError } from "./auditService.js";
import { mailFrom } from "./notificationService.js";
import { escapeHtml } from "./delivery/driveOpportunityMessages.js";
import { DeliveryError, redact } from "./delivery/providers.js";
import { providerFor, catchUpForStudent } from "./notificationDeliveryService.js";

/**
 * CareerCore — student contact details
 * ====================================
 *
 * Every student's contact details come from the student, once, and are kept
 * on their account (User): the email they registered with, the mobile number
 * they give, whether each is verified, and their WhatsApp consent. Drive
 * announcements read them from there; nobody else ever types a recipient.
 *
 *   email     verified by a single-use link (48 h), sent through the same
 *             email provider as drive announcements
 *   WhatsApp  verified by a 6-digit code sent to that number through an
 *             approved WhatsApp AUTHENTICATION template. Receiving it proves
 *             the number is theirs and on WhatsApp; entering it records their
 *             consent. Only then are drive alerts sent there.
 *
 * Tokens and codes are stored only as hashes. In sandbox mode nothing is
 * sent: outside production the code or link is returned to the caller so
 * the flow can be exercised, and is clearly labelled as simulated.
 */

/** Shown wherever a student turns WhatsApp alerts on. Bump the version when it changes. */
export const WHATSAPP_CONSENT_VERSION = "2026-11-placement-alerts-v3";
export const WHATSAPP_CONSENT_TEXT =
  "I agree to receive placement drive alerts from the CareerCore placement cell on WhatsApp at this number. " +
  "I can stop at any time in my profile or by replying STOP.";

const EMAIL_TOKEN_TTL_MS = 48 * 3600 * 1000;
const EMAIL_RESEND_GAP_MS = 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_RESEND_GAP_MS = 60 * 1000;
const CODE_SENDS_PER_HOUR = 5;
const CODE_MAX_ATTEMPTS = 5;

const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
const codeHash = (userId, phone, code) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET || "careercore").update(`${userId}:${phone}:${code}`).digest("hex");
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Sandbox outside production: the caller may see the simulated code/link. */
const exposeSimulated = (cfg) => cfg.mode === "sandbox" && process.env.NODE_ENV !== "production";

/** Keep the academic record's copy of the phone equal to the account's. */
const mirrorStudentPhone = (userId, phone) => Student.updateOne({ userId }, { $set: { phone } });

const studentIdOf = async (userId) => (await Student.findOne({ userId }).select("_id").lean())?._id;

// ─── Phone ───────────────────────────────────────────────────────────

/**
 * Set the account's mobile number (registration, profile). A changed number
 * is unverified until its code is entered; WhatsApp stops until then.
 * Returns true when the number changed.
 */
export const setContactPhone = async (user, raw, cfg = deliveryConfig()) => {
  const text = String(raw ?? "").trim();
  if (!text) return false;
  const e164 = normalizePhone(text, cfg.defaultCountryCode);
  if (!e164) throw httpError(400, "Enter a valid mobile number with country code, for example +91 98765 43210");
  if (e164 === user.phone) return false;
  user.phone = e164;
  user.phoneVerifiedAt = undefined;
  return true;
};

/** Persist a phone change made through setContactPhone, and mirror it. */
export const savePhoneChange = async (user) => {
  await user.save({ validateBeforeSave: false });
  await mirrorStudentPhone(user._id, user.phone);
};

// ─── WhatsApp verification code ──────────────────────────────────────

const otpPayload = (to, code, cfg) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: to.replace(/^\+/, ""),
  type: "template",
  template: {
    name: cfg.whatsapp.otpTemplateName || "careercore_verification",
    language: { code: cfg.whatsapp.otpTemplateLanguage },
    // Meta's authentication template: the code in the body and in the
    // "copy code" button.
    components: [
      { type: "body", parameters: [{ type: "text", text: code }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
    ],
  },
});

const WA_SEND_ERRORS = {
  WA_131026: "WhatsApp could not deliver to this number. Check it is your WhatsApp number.",
  WA_131030: "This number is not an allowed recipient of the WhatsApp test sender yet. Ask the placement cell to add it.",
  WA_131047: "WhatsApp could not deliver the code. Try again in a moment.",
};

/**
 * Send a 6-digit code to `raw` on WhatsApp. `consent` must be true: asking
 * for the code is how the student asks for WhatsApp alerts.
 */
export const sendPhoneCode = async (user, raw, { consent, source = "profile" } = {}) => {
  const cfg = deliveryConfig();
  if (consent !== true) throw httpError(400, "Agree to receive WhatsApp alerts to verify your number");
  const phone = normalizePhone(String(raw ?? "").trim() || user.phone, cfg.defaultCountryCode);
  if (!phone) throw httpError(400, "Enter a valid mobile number with country code, for example +91 98765 43210");

  if (cfg.mode === "off") throw httpError(503, "WhatsApp alerts are turned off on this server");
  // In every mode, sandbox included: with WhatsApp switched off nothing
  // WhatsApp-related happens, not even a simulated code.
  if (!cfg.whatsapp.enabled) throw httpError(503, "WhatsApp alerts are not used by the placement cell");
  if (cfg.mode === "live") {
    if (!cfg.whatsapp.configured || !cfg.whatsapp.otpTemplateName) {
      throw httpError(503, "WhatsApp verification is not set up on the server yet. Please try again later");
    }
  }

  const full = await User.findById(user._id).select("+phoneVerification");
  const pv = full.phoneVerification || {};
  const now = Date.now();
  if (pv.sentAt && now - new Date(pv.sentAt).getTime() < CODE_RESEND_GAP_MS) {
    throw httpError(429, "A code was just sent. Wait a minute before asking for another");
  }
  const windowFresh = pv.windowStart && now - new Date(pv.windowStart).getTime() < 3600 * 1000;
  const windowCount = windowFresh ? (pv.windowCount || 0) : 0;
  if (windowCount >= CODE_SENDS_PER_HOUR) throw httpError(429, "Too many codes requested. Try again in an hour");

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  let simulated = false;
  try {
    const sent = await providerFor("whatsapp", cfg).send(otpPayload(phone, code, cfg), cfg);
    simulated = Boolean(sent.simulated);
  } catch (raw2) {
    const err = raw2 instanceof DeliveryError ? raw2 : new DeliveryError("UNEXPECTED", redact(raw2?.message));
    console.error(`[contact] WhatsApp code to user ${user._id} failed: ${err.code}`);
    if (err.credential) throw httpError(503, "WhatsApp is temporarily unavailable. Please try again later");
    throw httpError(502, WA_SEND_ERRORS[err.code] || "The code could not be sent on WhatsApp. Check the number and try again");
  }

  full.phoneVerification = {
    phone,
    codeHash: codeHash(user._id, phone, code),
    expiresAt: new Date(now + CODE_TTL_MS),
    attempts: 0,
    sentAt: new Date(now),
    windowStart: windowFresh ? pv.windowStart : new Date(now),
    windowCount: windowCount + 1,
    consentSource: source,
  };
  // Asking for the code is agreeing to WhatsApp alerts: record it now, so
  // the officer sees "number not verified" rather than "no consent". No
  // alert is sent until the code is entered (evaluateRecipient).
  if (!full.whatsapp?.optIn) {
    full.set("whatsapp", { optIn: true, consentAt: new Date(now), consentVersion: WHATSAPP_CONSENT_VERSION, consentSource: source });
  }
  await full.save({ validateBeforeSave: false });

  return {
    sentTo: maskPhone(phone),
    expiresInMinutes: CODE_TTL_MS / 60000,
    simulated,
    ...(simulated && exposeSimulated(cfg) ? { devCode: code } : {}),
  };
};

/**
 * Check the code. Success verifies the number, makes it the account's
 * phone, records consent and turns WhatsApp alerts on — and sends the
 * alerts of open drives the student is eligible for straight away.
 */
export const verifyPhoneCode = async (user, code) => {
  const full = await User.findById(user._id).select("+phoneVerification");
  const pv = full.phoneVerification;
  if (!pv?.codeHash) throw httpError(400, "Ask for a verification code first");
  if (new Date(pv.expiresAt) < new Date()) throw httpError(400, "This code has expired. Ask for a new one");
  if ((pv.attempts || 0) >= CODE_MAX_ATTEMPTS) throw httpError(429, "Too many wrong codes. Ask for a new one");

  const typed = String(code ?? "").replace(/\D/g, "");
  if (typed.length !== 6 || !safeEqual(codeHash(user._id, pv.phone, typed), pv.codeHash)) {
    full.phoneVerification = { ...(pv.toObject ? pv.toObject() : pv), attempts: (pv.attempts || 0) + 1 };
    await full.save({ validateBeforeSave: false });
    const left = CODE_MAX_ATTEMPTS - (pv.attempts || 0) - 1;
    throw httpError(400, left > 0 ? `That code is not right. ${left} attempt${left === 1 ? "" : "s"} left` : "Too many wrong codes. Ask for a new one");
  }

  const now = new Date();
  full.phone = pv.phone;
  full.phoneVerifiedAt = now;
  full.set("whatsapp", {
    optIn: true,
    consentAt: now,
    consentVersion: WHATSAPP_CONSENT_VERSION,
    consentSource: pv.consentSource || "profile",
  });
  full.phoneVerification = undefined;
  await full.save({ validateBeforeSave: false });
  await mirrorStudentPhone(full._id, full.phone);

  const studentId = await studentIdOf(full._id);
  const catchUp = studentId ? await catchUpForStudent(studentId, ["whatsapp"]).catch(() => ({ queued: 0, drives: 0 })) : { queued: 0, drives: 0 };
  return { user: await User.findById(full._id), catchUp };
};

/** Turn WhatsApp alerts on (verified number only) or off. */
export const setWhatsAppOptIn = async (user, optIn) => {
  if (typeof optIn !== "boolean") throw httpError(400, "whatsappOptIn must be true or false");
  const now = new Date();
  if (!optIn) {
    if (user.whatsapp?.optIn) {
      user.set("whatsapp.optIn", false);
      user.set("whatsapp.optOutAt", now);
      await user.save({ validateBeforeSave: false });
    }
    return { user, catchUp: { queued: 0, drives: 0 } };
  }
  if (!user.phone || !user.phoneVerifiedAt) {
    throw httpError(409, "Verify your WhatsApp number with the code first");
  }
  if (!user.whatsapp?.optIn) {
    user.set("whatsapp", {
      optIn: true,
      consentAt: now,
      consentVersion: WHATSAPP_CONSENT_VERSION,
      consentSource: "profile",
    });
    await user.save({ validateBeforeSave: false });
  }
  const studentId = await studentIdOf(user._id);
  const catchUp = studentId ? await catchUpForStudent(studentId, ["whatsapp"]) : { queued: 0, drives: 0 };
  return { user, catchUp };
};

// ─── Email verification ──────────────────────────────────────────────

const verificationEmail = (name, url) => {
  const e = escapeHtml;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify your email</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0"><p style="margin:0;font-size:20px;font-weight:700;color:#0f172a">CareerCore</p></td></tr>
<tr><td style="padding:24px 28px"><p style="margin:0 0 12px;font-size:15px;color:#0f172a">Hello ${e(name || "there")},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">Confirm this is your email address so CareerCore can send you placement drive alerts here.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#0f172a" style="border-radius:8px">
<a href="${e(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">VERIFY EMAIL</a></td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#64748b">Or open: <a href="${e(url)}" style="color:#4338ca;word-break:break-all">${e(url)}</a><br>The link works once and expires in 48 hours. If you did not create a CareerCore account, ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `Hello ${name || "there"},\n\nConfirm this is your email address so CareerCore can send you placement drive alerts here:\n${url}\n\nThe link works once and expires in 48 hours. If you did not create a CareerCore account, ignore this email.`;
  return { subject: "Verify your email for CareerCore", html, text };
};

/** Send (or resend) the verification link. Never throws for delivery problems. */
export const sendEmailVerification = async (user) => {
  const cfg = deliveryConfig();
  if (user.emailVerifiedAt) return { sent: false, alreadyVerified: true };
  const full = await User.findById(user._id).select("+emailVerification");
  const ev = full.emailVerification || {};
  if (ev.sentAt && Date.now() - new Date(ev.sentAt).getTime() < EMAIL_RESEND_GAP_MS) {
    throw httpError(429, "A verification email was just sent. Wait a minute before asking again");
  }
  const base = appBaseUrl();
  if (!base || cfg.mode === "off") return { sent: false, reason: "Email is not available on this server" };

  const token = crypto.randomBytes(32).toString("hex");
  const url = `${base}/verify-email?token=${token}`;
  const previous = ev.tokenHash ? { tokenHash: ev.tokenHash, expiresAt: ev.expiresAt, sentAt: ev.sentAt } : undefined;
  full.emailVerification = { tokenHash: sha256(token), expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS), sentAt: new Date() };
  await full.save({ validateBeforeSave: false });

  try {
    const { subject, html, text } = verificationEmail(full.name, url);
    const sent = await providerFor("email", cfg).send(
      {
        to: full.email,
        subject,
        html,
        text,
        from: { name: cfg.email.fromName, address: cfg.email.fromAddress || mailFrom().address },
        replyTo: cfg.email.replyTo,
        reference: `verify-${full._id}-${Date.now()}`,
      },
      cfg,
    );
    return {
      sent: !sent.simulated,
      simulated: Boolean(sent.simulated),
      ...(sent.simulated && exposeSimulated(cfg) ? { devLink: url } : {}),
    };
  } catch (err) {
    console.error(`[contact] verification email for user ${full._id} failed: ${err.code || "error"} ${redact(err.message || "")}`);
    // Nothing was sent: the link they may already hold keeps working, and
    // they can try again at once.
    await User.updateOne({ _id: full._id }, previous ? { $set: { emailVerification: previous } } : { $unset: { emailVerification: "" } });
    return { sent: false, code: err.code || "SEND_FAILED", reason: verificationFailureReason(err) };
  }
};

/** What the student is told when the verification email could not be sent. No credentials. */
const verificationFailureReason = (err) => {
  if (err.code === "CHANNEL_NOT_CONFIGURED") return "Email sending is not set up on this server yet. Please contact the placement cell";
  if (err.credential) return "The placement cell's email account refused to log in, so no email was sent. Please contact the placement cell";
  if (err.quota) return "The placement cell's email account has reached its daily sending limit. Please try again tomorrow";
  if (err.permanent) return "The mail server would not accept your email address. Check that it is typed correctly";
  return "The mail server could not be reached, so no email was sent. Please try again in a few minutes";
};

/** Consume a verification link. Public: the link may be opened signed out. */
export const verifyEmailToken = async (token) => {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw httpError(400, "This verification link is not valid");
  const user = await User.findOne({ "emailVerification.tokenHash": sha256(token) }).select("+emailVerification");
  if (!user) throw httpError(400, "This verification link is not valid or was already used");
  if (new Date(user.emailVerification.expiresAt) < new Date()) {
    throw httpError(400, "This verification link has expired. Sign in and ask for a new one");
  }
  user.emailVerifiedAt = new Date();
  user.emailVerification = undefined;
  await user.save({ validateBeforeSave: false });

  // Where drive emails require a verified address, open drives go out now.
  if (deliveryConfig().email.requireVerified) {
    const studentId = await studentIdOf(user._id);
    if (studentId) await catchUpForStudent(studentId, ["email"]).catch(() => {});
  }
  return user;
};

// ─── Email alerts preference ─────────────────────────────────────────

/**
 * Turn placement drive emails on or off for this account. In-app
 * notifications are unaffected. Turning them back on sends the open drives
 * the student is eligible for and was not emailed about while they were off
 * (each at most once, through the usual duplicate guards).
 */
export const setEmailAlerts = async (user, optIn) => {
  if (typeof optIn !== "boolean") throw httpError(400, "optIn must be true or false");
  const current = user.emailAlerts?.optIn !== false;
  if (current === optIn) return { user, catchUp: { queued: 0, drives: 0 } };
  user.set("emailAlerts", { optIn, changedAt: new Date() });
  await user.save({ validateBeforeSave: false });
  if (!optIn) return { user, catchUp: { queued: 0, drives: 0 } };
  const studentId = await studentIdOf(user._id);
  const catchUp = studentId ? await catchUpForStudent(studentId, ["email"]) : { queued: 0, drives: 0 };
  return { user, catchUp };
};

/** Change the account's mobile number without WhatsApp (contact details only). */
export const updateContactPhone = async (user, raw) => {
  if (!String(raw ?? "").trim()) throw httpError(400, "Enter your mobile number");
  if (await setContactPhone(user, raw)) await savePhoneChange(user);
  return user;
};

/** What a student's contact settings screen needs. No secrets. */
export const contactView = (user) => {
  const cfg = deliveryConfig();
  return {
    sandbox: cfg.mode === "sandbox",
    email: {
      address: user.email,
      verified: Boolean(user.emailVerifiedAt),
      verifiedAt: user.emailVerifiedAt || null,
      enabled: cfg.email.enabled,
      // The student's own choice; placement emails go only while this is true.
      optIn: user.emailAlerts?.optIn !== false,
      changedAt: user.emailAlerts?.changedAt || null,
      requireVerified: cfg.email.requireVerified,
    },
    phone: { number: user.phone || "", verified: Boolean(user.phoneVerifiedAt), verifiedAt: user.phoneVerifiedAt || null },
    whatsapp: {
      // Only when the placement cell switched WhatsApp on (NOTIFY_WHATSAPP_ENABLED=true).
      available: cfg.whatsapp.enabled,
      sandbox: cfg.mode === "sandbox",
      optIn: Boolean(user.whatsapp?.optIn),
      active: Boolean(user.whatsapp?.optIn && user.phoneVerifiedAt),
      consentAt: user.whatsapp?.consentAt || null,
      optOutAt: user.whatsapp?.optOutAt || null,
      consentText: WHATSAPP_CONSENT_TEXT,
      consentVersion: WHATSAPP_CONSENT_VERSION,
    },
  };
};

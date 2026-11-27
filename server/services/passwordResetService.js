import crypto from "crypto";
import User from "../models/User.js";
import { deliveryConfig, appBaseUrl } from "../config/notifications.js";
import { httpError } from "./auditService.js";
import { mailFrom } from "./notificationService.js";
import { escapeHtml } from "./delivery/driveOpportunityMessages.js";
import { redact } from "./delivery/providers.js";
import { providerFor } from "./notificationDeliveryService.js";
import { ROLES } from "../config/constants.js";

/**
 * "Forgot password": a one-time link sent to the account's email address.
 *
 * - The answer to a request is the same whether or not an account exists,
 *   and the email goes out after the answer, so neither the message nor the
 *   response time tells anyone which addresses are registered.
 * - Only a hash of the link's token is stored. A link works once and for
 *   RESET_TTL_MS; asking again replaces the previous link.
 * - Setting the new password signs out every session that was signed in
 *   before (User.passwordChangedAt, checked in middleware/auth.js).
 * - In sandbox mode outside production nothing is emailed; the link is
 *   written to the server log for the developer. It is never returned by the
 *   API, which would let anyone reset any account on a test server.
 */

export const RESET_TTL_MS = 30 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
const minutes = Math.round(RESET_TTL_MS / 60000);

export const GENERIC_ANSWER = `If an account exists for that email, a link to reset the password is on its way. It works once and expires in ${minutes} minutes.`;

const resetEmail = (name, url) => {
  const e = escapeHtml;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset your password</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0"><p style="margin:0;font-size:20px;font-weight:700;color:#0f172a">CareerCore</p></td></tr>
<tr><td style="padding:24px 28px"><p style="margin:0 0 12px;font-size:15px;color:#0f172a">Hello ${e(name || "there")},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">Someone asked to reset the password for your CareerCore account. Choose a new password with the button below.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#4f46e5" style="border-radius:8px">
<a href="${e(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">RESET PASSWORD</a></td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#64748b">Or open: <a href="${e(url)}" style="color:#4338ca;word-break:break-all">${e(url)}</a><br>The link works once and expires in ${minutes} minutes. Resetting signs you out on every device.</p>
<p style="margin:16px 0 0;font-size:12px;color:#64748b">If you did not ask for this, ignore this email. Your password stays the same.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `Hello ${name || "there"},\n\nSomeone asked to reset the password for your CareerCore account. Choose a new password here:\n${url}\n\nThe link works once and expires in ${minutes} minutes. Resetting signs you out on every device.\n\nIf you did not ask for this, ignore this email. Your password stays the same.`;
  return { subject: "Reset your CareerCore password", html, text };
};

/** Whether this server can send reset emails at all (independent of any account). */
export const resetAvailable = (cfg = deliveryConfig()) =>
  Boolean(appBaseUrl()) && cfg.mode !== "off" && (cfg.mode === "sandbox" || cfg.email.configured);

/**
 * Create the link and send it. Never throws: it runs after the response has
 * gone, so problems are logged and the previous link (if any) is restored.
 */
const sendLink = async (userId, cfg) => {
  const user = await User.findById(userId).select("+passwordReset");
  if (!user) return;
  const pr = user.passwordReset || {};
  if (pr.sentAt && Date.now() - new Date(pr.sentAt).getTime() < RESEND_GAP_MS) return;

  const token = crypto.randomBytes(32).toString("hex");
  const url = `${appBaseUrl()}/reset-password?token=${token}`;
  const previous = pr.tokenHash ? { tokenHash: pr.tokenHash, expiresAt: pr.expiresAt, sentAt: pr.sentAt } : undefined;
  user.passwordReset = { tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS), sentAt: new Date() };
  await user.save({ validateBeforeSave: false });

  try {
    const { subject, html, text } = resetEmail(user.name, url);
    const sent = await providerFor("email", cfg).send(
      {
        to: user.email,
        subject,
        html,
        text,
        from: { name: cfg.email.fromName, address: cfg.email.fromAddress || mailFrom().address },
        replyTo: cfg.email.replyTo,
        reference: `reset-${user._id}-${Date.now()}`,
      },
      cfg,
    );
    if (sent.simulated && process.env.NODE_ENV !== "production") {
      console.log(`[password-reset] sandbox: link for user ${user._id} (not emailed): ${url}`);
    }
  } catch (err) {
    console.error(`[password-reset] email for user ${user._id} failed: ${err.code || "error"} ${redact(err.message || "")}`);
    await User.updateOne(
      { _id: user._id },
      previous ? { $set: { passwordReset: previous } } : { $unset: { passwordReset: "" } },
    );
  }
};

/**
 * Ask for a reset link. Resolves with the generic answer; the email itself is
 * sent in the background. Rejects only when the server cannot send email at
 * all, which says nothing about any account.
 */
export const requestPasswordReset = async (rawEmail, { background = true } = {}) => {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw httpError(400, "Enter a valid email address");
  const cfg = deliveryConfig();
  if (!resetAvailable(cfg)) {
    throw httpError(503, "Password reset by email is not available on this server. Please contact the placement cell");
  }

  const user = await User.findOne({ email }).select("_id isActive role").lean();
  const eligible = user && user.isActive && user.role !== ROLES.RECRUITER;
  if (eligible) {
    const job = sendLink(user._id, cfg).catch((err) =>
      console.error(`[password-reset] could not prepare a link: ${redact(err.message || "")}`),
    );
    if (!background) await job;
  }
  return { message: GENERIC_ANSWER };
};

/** Check a link without using it, so the page can say "expired" before anyone types. */
export const checkResetToken = async (token) => {
  await findByToken(token);
  return { valid: true };
};

const findByToken = async (token) => {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    throw httpError(400, "This reset link is not valid. Ask for a new one");
  }
  const user = await User.findOne({ "passwordReset.tokenHash": sha256(token) }).select("+passwordReset +passwordHash");
  if (!user) throw httpError(400, "This reset link is not valid or was already used. Ask for a new one");
  if (new Date(user.passwordReset.expiresAt) < new Date()) {
    throw httpError(400, "This reset link has expired. Ask for a new one");
  }
  if (!user.isActive) throw httpError(403, "Account has been deactivated");
  return user;
};

/** Use a link: set the new password and sign out every existing session. */
export const resetPassword = async (token, password) => {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Use at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > 128) throw httpError(400, "Use at most 128 characters");
  const user = await findByToken(token);
  user.passwordHash = password; // hashed, and passwordChangedAt set, by the pre-save hook
  user.passwordReset = undefined;
  await user.save({ validateBeforeSave: false });
  return { email: user.email };
};

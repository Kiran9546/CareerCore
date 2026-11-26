import crypto from "crypto";
import axios from "axios";
import { getTransporter } from "../notificationService.js";

/**
 * Channel providers. Each has one method:
 *
 *   send(message, cfg) -> { provider, providerMessageId, simulated? }
 *
 * and throws a DeliveryError on failure, already classified as permanent
 * (do not retry: bad number, rejected address, template misconfigured) or
 * transient (retry with backoff: network, 5xx, rate limit). The worker never
 * inspects provider-specific errors itself.
 */

export class DeliveryError extends Error {
  constructor(code, message, { permanent = false, rateLimited = false, retryAfterMs, credential = false, quota = false } = {}) {
    super(message);
    this.name = "DeliveryError";
    this.code = code;
    this.permanent = permanent;
    this.rateLimited = rateLimited;
    this.retryAfterMs = retryAfterMs;
    /**
     * The provider refused our credentials (expired WhatsApp token, wrong
     * SMTP password). Every message on the channel would fail the same way,
     * so the worker pauses the channel and keeps the messages queued for
     * when an administrator fixes the setting, instead of using up their
     * retries.
     */
    this.credential = credential;
    /**
     * The account hit its sending quota (Gmail: about 500 messages a day
     * for a personal account, 2,000 for Google Workspace). Like a
     * credential error it is not this message's fault: the channel pauses
     * and the message stays queued, without using up a retry, until the
     * quota frees up.
     */
    this.quota = quota;
  }
}

/**
 * Remove anything that identifies a person from a provider's error text
 * before it is stored or logged: SMTP servers quote the rejected address,
 * WhatsApp quotes the number.
 */
export const redact = (text) =>
  String(text ?? "")
    .replace(/[^\s<>()"',;:@]+@[^\s<>()"',;:@]+/g, "[address]")
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[number]")
    .slice(0, 500);

// ─── Email (SMTP, through the existing nodemailer transport) ──────────

const TRANSIENT_SMTP_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET", "ECONNREFUSED", "ETLS", "EPROTOCOL"]);

/** How long a channel waits after a credential error before trying again. */
export const CREDENTIAL_PAUSE_MS = 10 * 60 * 1000;
/** How long a channel waits after the provider reports its sending quota is used up. */
export const QUOTA_PAUSE_MS = 60 * 60 * 1000;

/**
 * Gmail's "Daily user sending limit exceeded" (550 5.4.5) and similar
 * replies from other providers. They arrive as 4xx or 5xx, but they are
 * about the sending account, not the recipient, so they must not mark the
 * student's email as permanently failed.
 */
const SMTP_QUOTA_PATTERN = /\b5\.4\.5\b|\b4\.7\.28\b|sending (limit|quota)|quota exceeded|daily (user )?sending|too many (messages|emails)/i;

export const classifySmtpError = (err) => {
  const response = Number(err.responseCode);
  const code = err.code || (response ? `SMTP_${response}` : "SMTP_ERROR");
  const message = redact(err.response || err.message);
  // 5xx on the envelope is the server refusing this recipient for good
  // (no such mailbox, domain does not exist). Authentication (535) is a
  // configuration problem and is retried with backoff until fixed.
  if (err.code === "EAUTH" || response === 535 || response === 534) {
    return new DeliveryError(code, message, { credential: true, retryAfterMs: CREDENTIAL_PAUSE_MS });
  }
  if (response >= 400 && SMTP_QUOTA_PATTERN.test(`${err.response || ""} ${err.message || ""}`)) {
    return new DeliveryError("SMTP_QUOTA", message, { quota: true, rateLimited: true, retryAfterMs: QUOTA_PAUSE_MS });
  }
  if (response >= 500 && response < 600) {
    return new DeliveryError(code, message, { permanent: true });
  }
  if (response >= 400 && response < 500) {
    return new DeliveryError(code, message, { rateLimited: response === 421 || response === 450 || response === 451 });
  }
  if (TRANSIENT_SMTP_CODES.has(err.code)) return new DeliveryError(code, message);
  return new DeliveryError(code, message);
};

export const smtpEmailProvider = {
  name: "smtp",
  async send({ to, subject, html, text, from, replyTo, reference }) {
    const tx = getTransporter();
    if (!tx) {
      throw new DeliveryError("CHANNEL_NOT_CONFIGURED", "Email is not configured on the server (SMTP_USER / SMTP_PASS).", { permanent: true });
    }
    let info;
    try {
      info = await tx.sendMail({
        from,
        to,
        subject,
        html,
        text,
        replyTo: replyTo || undefined,
        // A unique reference stops Gmail folding every drive announcement
        // into one thread, and ties a bounce back to the delivery row.
        headers: { "X-Entity-Ref-ID": reference },
      });
    } catch (err) {
      throw classifySmtpError(err);
    }
    if (info?.rejected?.length) {
      throw new DeliveryError("RECIPIENT_REJECTED", "The mail server rejected the recipient address.", { permanent: true });
    }
    return { provider: "smtp", providerMessageId: info?.messageId || null };
  },
};

// ─── WhatsApp (Meta WhatsApp Cloud API) ──────────────────────────────

/**
 * Cloud API error codes, from Meta's "Error codes" reference. Anything not
 * listed falls back on the HTTP status: 4xx permanent, 5xx transient.
 */
const WA_RATE_LIMIT = new Set([4, 80007, 130429, 131048, 131056]);
const WA_TRANSIENT = new Set([1, 2, 131000, 131016, 133004]);
/** Token expired/invalid (190) or lacking permission (10, 200): credentials. */
const WA_CREDENTIAL = new Set([190, 10, 200]);
const WA_PERMANENT = new Set([
  100, 131008, 131009, 131021, 131026, 131030, 131031, 131045, 131047, 131051, 131052, 131053,
  132000, 132001, 132005, 132007, 132012, 132015, 132016, 132068, 132069, 368,
]);

export const classifyWhatsAppError = (err) => {
  if (err instanceof DeliveryError) return err;
  const status = err.response?.status;
  const apiError = err.response?.data?.error;
  if (!status) {
    // Timeout, DNS, connection refused: we never reached Meta.
    return new DeliveryError(err.code || "NETWORK_ERROR", redact(err.message));
  }
  const code = Number(apiError?.code);
  const label = `WA_${Number.isFinite(code) ? code : status}`;
  const detail = apiError?.error_data?.details || apiError?.message || `HTTP ${status}`;
  const message = redact(detail);
  const retryAfterSec = Number(err.response?.headers?.["retry-after"]);
  const retryAfterMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : undefined;

  if (status === 429 || WA_RATE_LIMIT.has(code)) {
    return new DeliveryError(label, message, { rateLimited: true, retryAfterMs: retryAfterMs ?? 60000 });
  }
  if (WA_CREDENTIAL.has(code) || status === 401) {
    return new DeliveryError(label, message, { credential: true, retryAfterMs: CREDENTIAL_PAUSE_MS });
  }
  if (WA_PERMANENT.has(code)) return new DeliveryError(label, message, { permanent: true });
  if (WA_TRANSIENT.has(code) || status >= 500) return new DeliveryError(label, message);
  return new DeliveryError(label, message, { permanent: status >= 400 && status < 500 });
};

export const whatsappCloudProvider = {
  name: "whatsapp_cloud",
  async send(payload, cfg) {
    const wa = cfg.whatsapp;
    if (!wa.configured) {
      throw new DeliveryError(
        "CHANNEL_NOT_CONFIGURED",
        "WhatsApp is not configured on the server (access token, phone number ID or template name missing).",
        { permanent: true },
      );
    }
    const url = `${wa.apiBaseUrl}/${encodeURIComponent(wa.apiVersion)}/${encodeURIComponent(wa.phoneNumberId)}/messages`;
    let res;
    try {
      res = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${wa.accessToken}`, "Content-Type": "application/json" },
        timeout: wa.requestTimeoutMs,
        // Never follow a redirect with the bearer token attached.
        maxRedirects: 0,
      });
    } catch (err) {
      throw classifyWhatsAppError(err);
    }
    const id = res.data?.messages?.[0]?.id;
    if (!id) {
      throw new DeliveryError("WA_NO_MESSAGE_ID", "WhatsApp accepted the request but returned no message id.");
    }
    return { provider: "whatsapp_cloud", providerMessageId: id };
  },
};

// ─── Sandbox (development and testing) ───────────────────────────────

/** Renders and accepts everything, sends nothing, and says so. */
const sandbox = (channel) => ({
  name: `sandbox_${channel}`,
  async send() {
    return { provider: "sandbox", providerMessageId: `sandbox-${crypto.randomUUID()}`, simulated: true };
  },
});

export const liveProviders = { email: smtpEmailProvider, whatsapp: whatsappCloudProvider };
export const sandboxProviders = { email: sandbox("email"), whatsapp: sandbox("whatsapp") };

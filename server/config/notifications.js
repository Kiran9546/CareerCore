/**
 * CareerCore — external notification delivery settings
 * =====================================================
 *
 * Read from the environment on every call (not cached at import), so a test
 * or an operator changing a variable sees the change without a restart of
 * the module graph. Nothing here is ever sent to the browser except the
 * booleans returned by publicDeliveryStatus().
 *
 * NOTIFICATION_DELIVERY_MODE
 *   live     messages really go out through SMTP and the WhatsApp Cloud API
 *   sandbox  nothing leaves the server; each message is rendered, recorded as
 *            "simulated" and never reported as sent. The default everywhere
 *            except NODE_ENV=production, so development and testing can
 *            never reach a real student.
 *   off      no email or WhatsApp delivery is queued at all (in-app only)
 */

const int = (v, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

const DELIVERY_MODES = ["live", "sandbox", "off"];

/** The public website's address, used to build every link a student receives. */
export const appBaseUrl = (env = process.env) => {
  const explicit = (env.PUBLIC_APP_URL || "").trim();
  const first = (env.CLIENT_URL || "").split(",").map((o) => o.trim()).find(Boolean) || "";
  const base = explicit || first || (env.NODE_ENV === "production" ? "" : "http://localhost:5173");
  return base.replace(/\/+$/, "");
};

/** The student-facing page for one drive: details and the Register button. */
export const driveRegistrationUrl = (driveId, env = process.env) => {
  const base = appBaseUrl(env);
  return base ? `${base}/student/drives/${driveId}` : "";
};

export const deliveryConfig = (env = process.env) => {
  const production = env.NODE_ENV === "production";
  const requested = (env.NOTIFICATION_DELIVERY_MODE || "").trim().toLowerCase();
  const mode = DELIVERY_MODES.includes(requested) ? requested : production ? "live" : "sandbox";

  const smtpConfigured = Boolean(env.SMTP_USER && env.SMTP_PASS);
  const waToken = env.WHATSAPP_ACCESS_TOKEN || "";
  const waPhoneId = env.WHATSAPP_PHONE_NUMBER_ID || "";
  const waTemplate = env.WHATSAPP_TEMPLATE_NAME || "";

  // Parallel sends per channel, per worker process. WhatsApp Cloud API
  // accepts up to 80 messages/s per number; SMTP services publish their own
  // limits, so email defaults to the SMTP pool size.
  const concurrency = int(env.DELIVERY_CONCURRENCY, 4, { min: 1, max: 64 });
  const smtpConnections = int(env.SMTP_MAX_CONNECTIONS, 5, { min: 1, max: 50 });

  return {
    mode,
    /** What NOTIFICATION_DELIVERY_MODE says (normalised), for the start-up warnings. */
    requestedMode: requested,
    appUrl: appBaseUrl(env),
    timeZone: env.APP_TIMEZONE || "Asia/Kolkata",
    defaultCountryCode: env.DEFAULT_PHONE_COUNTRY_CODE || "91",

    email: {
      // On unless explicitly turned off. Without SMTP settings a live send
      // fails with "not configured" rather than pretending to succeed.
      enabled: mode !== "off" && env.NOTIFY_EMAIL_ENABLED !== "false",
      configured: smtpConfigured,
      fromAddress: env.EMAIL_FROM_ADDRESS || env.SMTP_USER || "",
      fromName: env.EMAIL_FROM_NAME || "CareerCore Placement Cell",
      replyTo: env.EMAIL_REPLY_TO || "",
      // Off by default: every registered address receives drive emails, and
      // verification is offered. On: only verified addresses receive them.
      requireVerified: env.NOTIFY_EMAIL_REQUIRE_VERIFIED === "true",
    },

    whatsapp: {
      // Off unless explicitly turned on: business-initiated WhatsApp needs
      // an approved template, which only the operator can confirm exists.
      enabled: mode !== "off" && env.NOTIFY_WHATSAPP_ENABLED === "true",
      configured: Boolean(waToken && waPhoneId && waTemplate),
      accessToken: waToken,
      phoneNumberId: waPhoneId,
      businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
      apiVersion: env.WHATSAPP_API_VERSION || "v21.0",
      apiBaseUrl: (env.WHATSAPP_API_BASE_URL || "https://graph.facebook.com").replace(/\/+$/, ""),
      templateName: waTemplate,
      templateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
      // The approved template has a "Visit website" URL button whose URL
      // ends in {{1}}; we pass the drive id as that suffix.
      urlButton: env.WHATSAPP_TEMPLATE_URL_BUTTON !== "false",
      // Approved AUTHENTICATION template carrying the 6-digit code that
      // proves a student owns their WhatsApp number (body {{1}} = code,
      // with Meta's "copy code" button).
      otpTemplateName: env.WHATSAPP_OTP_TEMPLATE_NAME || "",
      otpTemplateLanguage: env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
      appSecret: env.WHATSAPP_APP_SECRET || "",
      verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
      requestTimeoutMs: int(env.WHATSAPP_TIMEOUT_MS, 15000, { min: 1000 }),
    },

    worker: {
      enabled: env.DELIVERY_WORKER !== "off",
      pollMs: int(env.DELIVERY_POLL_INTERVAL_MS, 30000, { min: 1000 }),
      concurrency,
      channelConcurrency: {
        email: int(env.DELIVERY_EMAIL_CONCURRENCY, Math.max(concurrency, smtpConnections), { min: 1, max: 64 }),
        whatsapp: int(env.DELIVERY_WHATSAPP_CONCURRENCY, concurrency, { min: 1, max: 64 }),
      },
      maxPerRun: int(env.DELIVERY_MAX_PER_RUN, 500, { min: 1 }),
      maxAttempts: int(env.DELIVERY_MAX_ATTEMPTS, 5, { min: 1, max: 20 }),
      baseBackoffMs: int(env.DELIVERY_BACKOFF_BASE_MS, 60000, { min: 0 }),
      maxBackoffMs: int(env.DELIVERY_BACKOFF_MAX_MS, 3600000, { min: 0 }),
      // A row "processing" for longer than this belongs to a worker that
      // stopped mid-send. Must comfortably exceed a batch's send time (two
      // sends per lane, each bounded by the provider timeouts).
      leaseMs: int(env.DELIVERY_LEASE_MS, 300000, { min: 5000 }),
    },
  };
};

/** What the officer's dashboard may know about the configuration: no secrets. */
export const publicDeliveryStatus = (cfg = deliveryConfig()) => ({
  mode: cfg.mode,
  email: {
    enabled: cfg.email.enabled,
    configured: cfg.mode === "sandbox" || cfg.email.configured,
    requireVerified: cfg.email.requireVerified,
  },
  whatsapp: {
    enabled: cfg.whatsapp.enabled,
    configured: cfg.mode === "sandbox" || cfg.whatsapp.configured,
    verificationConfigured: cfg.mode === "sandbox" || Boolean(cfg.whatsapp.configured && cfg.whatsapp.otpTemplateName),
  },
});

/**
 * Plain-language warnings about the provider setup, for the start-up log and
 * the officer's dashboard. Empty when everything that is switched on works.
 */
export const deliveryWarnings = (cfg = deliveryConfig()) => {
  const w = [];
  if (cfg.requestedMode && !DELIVERY_MODES.includes(cfg.requestedMode)) {
    w.push(`NOTIFICATION_DELIVERY_MODE="${cfg.requestedMode}" is not one of ${DELIVERY_MODES.join(", ")}; using "${cfg.mode}" instead.`);
  }
  if (cfg.mode === "sandbox") {
    w.push(
      cfg.requestedMode === "sandbox"
        ? "Sandbox mode (NOTIFICATION_DELIVERY_MODE=sandbox): emails are only simulated; nothing reaches students. Set it to live and restart to send."
        : "Sandbox mode (NOTIFICATION_DELIVERY_MODE is not set, the default outside production): emails are only simulated; nothing reaches students. Set NOTIFICATION_DELIVERY_MODE=live and restart to send.",
    );
    return w;
  }
  if (cfg.mode === "off") return ["External delivery is off: students are notified in CareerCore only."];
  if (!cfg.email.configured) {
    w.push("Email is not configured (SMTP_USER / SMTP_PASS): drive emails and email verification links cannot be sent.");
  }
  // WhatsApp switched off is a supported setup (in-app + email only), not
  // a problem to warn about.
  if (cfg.whatsapp.enabled) {
    if (!cfg.whatsapp.configured) w.push("WhatsApp is on but WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TEMPLATE_NAME are missing.");
    if (!cfg.whatsapp.otpTemplateName) w.push("WHATSAPP_OTP_TEMPLATE_NAME is not set: students cannot verify their WhatsApp numbers, so no one can receive WhatsApp alerts.");
    if (!cfg.whatsapp.appSecret) w.push("WHATSAPP_APP_SECRET is not set: delivery-status webhooks and STOP replies are refused.");
  }
  if (!cfg.appUrl) w.push("PUBLIC_APP_URL (or CLIENT_URL) is not set: no registration or verification links can be built.");
  return w;
};

/**
 * Problems that must stop a production start. Only explicit choices are
 * checked: WhatsApp switched on without its credentials, or a webhook that
 * could not be verified.
 */
export const deliveryEnvProblems = (env) => {
  const problems = [];
  const requested = (env.NOTIFICATION_DELIVERY_MODE || "").trim().toLowerCase();
  if (requested && !DELIVERY_MODES.includes(requested)) {
    problems.push(`NOTIFICATION_DELIVERY_MODE must be one of: ${DELIVERY_MODES.join(", ")}.`);
  }
  const url = (env.PUBLIC_APP_URL || "").trim();
  if (url && !/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(url)) {
    problems.push(`PUBLIC_APP_URL "${url}" is not an https origin.`);
  }
  if (env.NOTIFY_WHATSAPP_ENABLED === "true") {
    for (const key of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE_NAME", "WHATSAPP_OTP_TEMPLATE_NAME", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]) {
      if (!env[key]) problems.push(`NOTIFY_WHATSAPP_ENABLED is true but ${key} is not set.`);
    }
  }
  return problems;
};

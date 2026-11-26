import nodemailer from "nodemailer";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

let transporter = null;
let transporterKey = "";

/**
 * The one SMTP transport every email in CareerCore goes through — the
 * existing per-notification copies, contact-form forwarding and the drive
 * announcement worker. Null when SMTP is not configured. Rebuilt if the
 * settings change (a test, or an operator rotating the password).
 */
export const getTransporter = () => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 587;
  // Port 465 is implicit TLS; 587/25 upgrade with STARTTLS.
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  const maxConnections = Math.min(Math.max(parseInt(process.env.SMTP_MAX_CONNECTIONS, 10) || 5, 1), 50);
  const rateLimit = parseInt(process.env.SMTP_RATE_LIMIT_PER_SECOND, 10) || 0;
  const key = [host, port, secure, process.env.SMTP_USER, process.env.SMTP_PASS, maxConnections, rateLimit].join("|");
  if (transporter && transporterKey === key) return transporter;
  transporter?.close?.();

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    // On the submission port the password must never cross in plain text:
    // refuse to log in if the server does not upgrade to TLS (Gmail always does).
    requireTLS: !secure && port === 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // A pool of reused, authenticated connections: a drive announcement to
    // thousands of students does not open a new TLS session per message.
    pool: true,
    maxConnections,
    maxMessages: 100,
    // Optional cap for providers with a per-second sending limit.
    ...(rateLimit > 0 ? { rateDelta: 1000, rateLimit } : {}),
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  transporterKey = key;
  return transporter;
};

/** The From header: EMAIL_FROM_* when set, otherwise the SMTP account. */
export const mailFrom = (name = process.env.EMAIL_FROM_NAME || "CareerCore") => ({
  name,
  address: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER,
});

const sendEmail = async (to, subject, html) => {
  const tx = getTransporter();
  if (!tx) return false;

  try {
    await tx.sendMail({ from: mailFrom(), to, subject, html });
    return true;
  } catch (err) {
    // The recipient's address is personal data; it is not written to logs.
    console.error(`Email failed (${err.code || err.responseCode || "error"}): ${err.message}`.replace(/[^\s<>@]+@[^\s<>@]+/g, "[address]"));
    return false;
  }
};

const emailTemplate = (title, body, link) => `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a;margin:0 0 4px">CareerCore</h2>
    <p style="color:#64748b;font-size:13px;margin:0 0 24px">Placement Intelligence Platform</p>
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px">
      <h3 style="color:#0f172a;margin:0 0 8px;font-size:16px">${title}</h3>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0">${body}</p>
      ${link ? `<a href="${process.env.CLIENT_URL || "http://localhost:5173"}${link}"
        style="display:inline-block;margin-top:16px;padding:8px 16px;background:#0f172a;color:#fff;
        text-decoration:none;border-radius:8px;font-size:14px">View in CareerCore</a>` : ""}
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">
      Mangalore Institute of Technology &amp; Engineering
    </p>
  </div>
`;

export const notify = async ({ userId, type, title, body, link, metadata, email = false }) => {
  const notification = await Notification.create({ userId, type, title, body, link, metadata });

  if (email) {
    const user = await User.findById(userId).select("email name");
    if (user?.email) {
      const sent = await sendEmail(user.email, `CareerCore: ${title}`, emailTemplate(title, body, link));
      if (sent) {
        notification.emailSent = true;
        await notification.save();
      }
    }
  }

  return notification;
};

/**
 * Idempotent bulk notify for workflow events. Each item carries a
 * `dedupeKey`; an item whose key already exists is skipped, so a retried
 * publish, a recalculation or two concurrent requests can never notify the
 * same student about the same event twice.
 *
 * In-app only — a drive announcement can reach hundreds of students and is
 * not worth hundreds of SMTP round trips inside a request.
 *
 * Returns { created, ids } where ids maps dedupeKey -> notification _id for
 * the notifications this call created.
 */
/** True when a bulk write failed only because some upserts lost a race. */
export const onlyDuplicateKeyErrors = (err) => {
  const errors = err.writeErrors ?? (err.code === 11000 ? [err] : null);
  return Array.isArray(errors) && errors.length > 0 && errors.every((e) => (e.code ?? e.err?.code) === 11000);
};

/**
 * A dedupeKey condition the partial unique index can serve. `match` is a
 * key, a list of keys, or a RegExp prefix.
 */
export const dedupeKeyFilter = (match) => ({
  dedupeKey: {
    ...(Array.isArray(match) ? { $in: match } : match instanceof RegExp ? { $regex: match } : { $eq: match }),
    $type: "string",
  },
});

const NOTIFY_CHUNK = 1000;
const NOTIFY_PARALLEL_CHUNKS = 4;

/**
 * Large announcements are written in independent chunks, a few at a time,
 * so a cohort of thousands is not one long sequential write.
 */
export const notifyOnceMany = async (items) => {
  if (items.length <= NOTIFY_CHUNK) return notifyOnceChunk(items);
  const chunks = [];
  for (let i = 0; i < items.length; i += NOTIFY_CHUNK) chunks.push(items.slice(i, i + NOTIFY_CHUNK));
  const ids = new Map();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(NOTIFY_PARALLEL_CHUNKS, chunks.length) }, async () => {
      while (next < chunks.length) {
        const r = await notifyOnceChunk(chunks[next++]);
        for (const [k, v] of r.ids) ids.set(k, v);
      }
    }),
  );
  return { created: ids.size, ids };
};

const notifyOnceChunk = async (items) => {
  if (!items.length) return { created: 0, ids: new Map() };

  const ops = items.map(({ dedupeKey, userId, type, title, body, link, metadata }) => ({
    updateOne: {
      // The `$type` clause is what lets MongoDB use the partial unique index
      // on dedupeKey (its filter is `$type: "string"`). A bare equality falls
      // back to a collection scan per notification, which made a drive
      // announcement to thousands of students quadratic.
      filter: dedupeKeyFilter(dedupeKey),
      update: {
        // Timestamps are added by Mongoose's bulkWrite casting.
        $setOnInsert: { dedupeKey, userId, type, title, body, link, metadata, isRead: false, emailSent: false },
      },
      upsert: true,
    },
  }));

  let result;
  try {
    result = await Notification.bulkWrite(ops, { ordered: false });
  } catch (err) {
    // Two requests racing on the same key: one wins, the other gets a
    // duplicate-key error for that op. The remaining ops still ran.
    if (!onlyDuplicateKeyErrors(err)) throw err;
    result = err.result;
  }

  const ids = new Map();
  const upserted = result?.upsertedIds || result?.result?.upsertedIds || {};
  for (const [index, id] of Object.entries(upserted)) {
    ids.set(items[Number(index)].dedupeKey, id);
  }
  return { created: ids.size, ids };
};

export const getUnreadCount = (userId) =>
  Notification.countDocuments({ userId, isRead: false });

export const listNotifications = (userId, limit = 30) =>
  Notification.find({ userId }).sort("-createdAt").limit(limit);

export const markRead = (userId, ids) =>
  Notification.updateMany(
    { userId, ...(ids?.length ? { _id: { $in: ids } } : {}) },
    { isRead: true }
  );
/**
 * Plain-text email, for content written by users (contact messages): text
 * rather than HTML, so nothing a visitor types is ever rendered as markup.
 * Returns false when no mail server is configured or sending fails.
 */
export const sendTextEmail = async ({ to, subject, text, replyTo }) => {
  const tx = getTransporter();
  if (!tx || !to) return false;
  try {
    await tx.sendMail({ from: mailFrom(), to, subject, text, replyTo });
    return true;
  } catch (err) {
    console.error(`Email failed (${err.code || err.responseCode || "error"}): ${err.message}`.replace(/[^\s<>@]+@[^\s<>@]+/g, "[address]"));
    return false;
  }
};

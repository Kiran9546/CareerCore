import crypto from "crypto";
import mongoose from "mongoose";
import NotificationDelivery, {
  DELIVERY_CHANNELS,
  DELIVERY_STATUS,
  SKIP_REASONS,
  DELIVERED_STATUSES,
} from "../models/NotificationDelivery.js";
import Notification from "../models/Notification.js";
import Drive from "../models/Drive.js";
import DriveCandidate from "../models/DriveCandidate.js";
import Student from "../models/Student.js";
import User from "../models/User.js";
import { MANAGED_DRIVE_STATUS, MAX_PAGE_SIZE } from "../config/constants.js";
import { deliveryConfig, driveRegistrationUrl, publicDeliveryStatus } from "../config/notifications.js";
import { INSTANCE_ID } from "../jobs/jobLock.js";
import { normalizePhone, maskEmail, maskPhone } from "../utils/phone.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { audit, httpError } from "./auditService.js";
import { onlyDuplicateKeyErrors, mailFrom, dedupeKeyFilter } from "./notificationService.js";
// eligibilityService imports this module too. The cycle is safe: neither
// side uses the other's exports until a function is called at runtime.
import { describeEligibility } from "./eligibilityService.js";
import {
  opportunityFacts,
  renderOpportunityEmail,
  whatsappTemplateParams,
  buildWhatsAppTemplatePayload,
} from "./delivery/driveOpportunityMessages.js";
import { DeliveryError, liveProviders, sandboxProviders, redact } from "./delivery/providers.js";

/**
 * CareerCore — external notification delivery (email and WhatsApp)
 * ================================================================
 *
 *   publish ─► eligibility ─► in-app notifications ─► queueDriveOpportunityDeliveries
 *                                                         │ (rows in notificationdeliveries)
 *                                                         ▼
 *                                   processDueDeliveries (background worker)
 *                                     claim ─► re-check ─► render ─► provider ─► record
 *
 * Guarantees:
 *   - one row, so at most one message, per drive × student × channel
 *     (unique idempotency key; inserts are $setOnInsert upserts)
 *   - a row is claimed atomically, so two workers or two instances never
 *     send the same row
 *   - channels are independent: an email failure never touches a WhatsApp
 *     row and vice versa; neither can affect the in-app notification, which
 *     already exists before anything is queued
 *   - a message is only reported sent when the provider accepted it;
 *     sandbox mode reports "simulated", never "sent"
 *   - a row whose worker died mid-send is NOT resent automatically (the
 *     provider may already have accepted it); it is surfaced as failed with
 *     code INTERRUPTED so an officer can decide
 */

/** Test hook: replace providers (mocks never touch the network). */
let providerOverrides = {};
export const setDeliveryProviders = (overrides) => {
  providerOverrides = overrides || {};
};

const providerFor = (channel, cfg) =>
  providerOverrides[channel] || (cfg.mode === "sandbox" ? sandboxProviders[channel] : liveProviders[channel]);

export const deliveryKey = (driveId, studentId, channel) => `drive:${driveId}:eligible:${studentId}:${channel}`;

const CHUNK = 500;
const QUEUE_PARALLEL_CHUNKS = 4;

/** Run `fn` over `items` with at most `limit` in flight. */
const runPool = async (items, limit, fn) => {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
};

// ─── Recipient checks ────────────────────────────────────────────────

/**
 * Can this student be reached on this channel right now? Evaluated when the
 * row is queued (so the report shows skips immediately) and again just
 * before sending (so a revoked consent or a removed account is respected).
 */
export const evaluateRecipient = (channel, user, student, cfg = deliveryConfig()) => {
  if (!user || user.isActive === false) return { ok: false, skipReason: SKIP_REASONS.ACCOUNT_INACTIVE };
  if (channel === "email") {
    if (!user.email) return { ok: false, skipReason: SKIP_REASONS.NO_EMAIL };
    return { ok: true, address: user.email, masked: maskEmail(user.email) };
  }
  // WhatsApp: explicit consent first, then a usable number.
  if (!student?.whatsapp?.optIn) return { ok: false, skipReason: SKIP_REASONS.NO_CONSENT };
  const raw = student.whatsapp.number || student.phone;
  if (!raw) return { ok: false, skipReason: SKIP_REASONS.NO_PHONE };
  const e164 = normalizePhone(raw, cfg.defaultCountryCode);
  if (!e164) return { ok: false, skipReason: SKIP_REASONS.INVALID_PHONE };
  return { ok: true, address: e164, masked: maskPhone(e164) };
};

// ─── Queueing ────────────────────────────────────────────────────────

/**
 * Queue the email and WhatsApp copies of a drive announcement for the given
 * candidates ({ studentId, userId, notificationId }). Idempotent: a row that
 * already exists for a key is left exactly as it is.
 *
 * Returns { queued, skipped, channels } for the rows this call created.
 */
export const queueDriveOpportunityDeliveries = async (drive, candidates) => {
  const cfg = deliveryConfig();
  const channels = DELIVERY_CHANNELS.filter((c) => cfg[c].enabled);
  const out = { queued: 0, skipped: 0, channels };
  if (!channels.length || !candidates.length) return out;

  const now = new Date();
  const chunks = [];
  for (let i = 0; i < candidates.length; i += CHUNK) chunks.push(candidates.slice(i, i + CHUNK));
  // Chunks are independent, so a few run at once: a large cohort costs
  // roughly a quarter of the sequential time without flooding the pool.
  await runPool(chunks, QUEUE_PARALLEL_CHUNKS, async (slice) => {
    const [users, students] = await Promise.all([
      User.find({ _id: { $in: slice.map((c) => c.userId) } }).select("email isActive").lean(),
      Student.find({ _id: { $in: slice.map((c) => c.studentId) } }).select("phone whatsapp").lean(),
    ]);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const studentById = new Map(students.map((s) => [String(s._id), s]));

    const ops = [];
    const statusOf = [];
    for (const c of slice) {
      for (const channel of channels) {
        const r = evaluateRecipient(channel, userById.get(String(c.userId)), studentById.get(String(c.studentId)), cfg);
        statusOf.push(r.ok ? DELIVERY_STATUS.PENDING : DELIVERY_STATUS.SKIPPED);
        ops.push({
          insertOne: {
            document: {
              idempotencyKey: deliveryKey(drive._id, c.studentId, channel),
              event: "drive_opportunity",
              channel,
              driveId: drive._id,
              studentId: c.studentId,
              userId: c.userId,
              notificationId: c.notificationId,
              status: r.ok ? DELIVERY_STATUS.PENDING : DELIVERY_STATUS.SKIPPED,
              ...(r.ok ? { nextAttemptAt: now, recipientMasked: r.masked } : { skipReason: r.skipReason }),
              attempts: 0,
              manualRetries: 0,
            },
          },
        });
      }
    }

    // Plain unordered inserts; the unique idempotencyKey index rejects any
    // row that already exists (an earlier publish, a concurrent request),
    // which is the duplicate guarantee. Cheaper than an upsert per row.
    let rejected = new Set();
    try {
      await NotificationDelivery.bulkWrite(ops, { ordered: false });
    } catch (err) {
      if (!onlyDuplicateKeyErrors(err)) throw err;
      rejected = new Set((err.writeErrors ?? [err]).map((e) => e.index ?? e.err?.index));
    }
    statusOf.forEach((status, index) => {
      if (rejected.has(index)) return;
      if (status === DELIVERY_STATUS.PENDING) out.queued++;
      else out.skipped++;
    });
  });

  if (out.queued) kickDeliveryWorker();
  return out;
};

// ─── Worker ──────────────────────────────────────────────────────────

const backoffMs = (attempt, cfg) => {
  const base = cfg.worker.baseBackoffMs * 2 ** Math.max(attempt - 1, 0);
  const capped = Math.min(base, cfg.worker.maxBackoffMs);
  return Math.round(capped * (0.8 + Math.random() * 0.4)); // ±20% jitter
};

/** Channels paused by a provider rate limit, in this process. */
const pausedUntil = new Map();
const isPaused = (channel, now = new Date()) => (pausedUntil.get(channel) || 0) > now;

/**
 * Claim up to `size` due rows of one channel for this worker.
 *
 * Two steps, both safe under any number of competing workers: read the ids
 * of the oldest due rows, then flip only those still pending to processing
 * under a fresh claim token. MongoDB applies the conditional update per
 * document, so a row another worker flipped first is simply not ours. We
 * then read back exactly the rows carrying our token.
 *
 * Returns { rows, contended } — contended means rows were due but another
 * worker won all of them, so the caller should look again, not stop.
 */
const claimBatch = async (channel, now, cfg, size) => {
  const due = await NotificationDelivery.find({
    status: DELIVERY_STATUS.PENDING,
    channel,
    nextAttemptAt: { $lte: now },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(size)
    .select("_id")
    .lean();
  if (!due.length) return { rows: [], contended: false };

  const ids = due.map((d) => d._id);
  const token = `${INSTANCE_ID}:${crypto.randomUUID()}`;
  await NotificationDelivery.updateMany(
    { _id: { $in: ids }, status: DELIVERY_STATUS.PENDING },
    {
      $set: {
        status: DELIVERY_STATUS.PROCESSING,
        lockedUntil: new Date(now.getTime() + cfg.worker.leaseMs),
        lockedBy: token,
        lastAttemptAt: now,
      },
      $inc: { attempts: 1 },
    },
  );
  const rows = await NotificationDelivery.find({ _id: { $in: ids }, lockedBy: token }).lean();
  return { rows, contended: rows.length === 0 };
};

/**
 * Everything the batch needs to decide and render, in four queries instead
 * of three per message. Drives are cached for the whole run.
 */
const prefetch = async (rows, cache) => {
  const uniq = (xs) => [...new Map(xs.map((x) => [String(x), x])).values()];
  const studentIds = uniq(rows.map((r) => r.studentId));
  const missingDrives = uniq(rows.map((r) => r.driveId)).filter((id) => !cache.drives.has(String(id)));
  const [students, users, candidates, drives] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }).select("phone whatsapp").lean(),
    User.find({ _id: { $in: uniq(rows.map((r) => r.userId)) } }).select("name email isActive").lean(),
    DriveCandidate.find({ driveId: { $in: uniq(rows.map((r) => r.driveId)) }, studentId: { $in: studentIds } })
      .select("driveId studentId eligible")
      .lean(),
    missingDrives.length ? Drive.find({ _id: { $in: missingDrives } }).lean() : [],
  ]);
  for (const d of drives) cache.drives.set(String(d._id), d);
  return {
    students: new Map(students.map((s) => [String(s._id), s])),
    users: new Map(users.map((u) => [String(u._id), u])),
    candidates: new Map(candidates.map((c) => [`${c.driveId}|${c.studentId}`, c])),
    drives: cache.drives,
  };
};

/** Give a claimed row back untouched (its channel was paused mid-batch). */
const release = (row) =>
  NotificationDelivery.updateOne(
    { _id: row._id, status: DELIVERY_STATUS.PROCESSING, lockedBy: row.lockedBy },
    {
      $set: { status: DELIVERY_STATUS.PENDING, nextAttemptAt: pausedUntil.get(row.channel) || new Date() },
      $inc: { attempts: -1 },
      $unset: { lockedUntil: "", lockedBy: "" },
    },
  );

/**
 * Rows still "processing" after their lease belong to a worker that stopped
 * mid-send. Whether the provider accepted the message is unknown, so they
 * are not resent automatically — that is the one case that could otherwise
 * produce a duplicate.
 */
export const recoverInterruptedDeliveries = (now = new Date()) =>
  NotificationDelivery.updateMany(
    { status: DELIVERY_STATUS.PROCESSING, lockedUntil: { $lt: now } },
    {
      $set: {
        status: DELIVERY_STATUS.FAILED,
        failedAt: now,
        lastError: {
          code: "INTERRUPTED",
          message:
            "The server stopped while this message was being sent, so whether it went out is unknown. " +
            "It was not resent automatically to avoid a duplicate; retry it if the student did not receive it.",
          permanent: true,
          at: now,
        },
      },
      $unset: { lockedUntil: "", lockedBy: "" },
    },
  );

const registrationOpen = (drive, now) =>
  drive?.status === MANAGED_DRIVE_STATUS.OPEN && drive.registrationDeadline && new Date(drive.registrationDeadline) > now;

/** Build the provider message for one row. */
const buildMessage = (row, { drive, user, address }, cfg) => {
  const facts = opportunityFacts({
    drive,
    criteria: describeEligibility(drive.eligibility),
    registrationUrl: driveRegistrationUrl(drive._id),
    timeZone: cfg.timeZone,
  });
  if (!facts.registrationUrl) {
    throw new DeliveryError("NO_APP_URL", "PUBLIC_APP_URL (or CLIENT_URL) is not set, so no registration link can be built.", { permanent: true });
  }
  if (row.channel === "email") {
    const { subject, html, text } = renderOpportunityEmail({ studentName: user.name, facts });
    return {
      to: address,
      subject,
      html,
      text,
      from: { name: cfg.email.fromName, address: cfg.email.fromAddress || mailFrom().address },
      replyTo: cfg.email.replyTo,
      reference: String(row._id),
    };
  }
  return buildWhatsAppTemplatePayload({
    to: address,
    templateName: cfg.whatsapp.templateName || "placement_drive_alert",
    language: cfg.whatsapp.templateLanguage,
    params: whatsappTemplateParams({ studentName: user.name, facts }),
    urlButtonSuffix: cfg.whatsapp.urlButton ? String(drive._id) : null,
  });
};

/** Send one claimed row and record the outcome. Never throws. */
const deliverOne = async (row, cfg, ctx) => {
  const now = new Date();
  // Only the claim that took this row may finish it.
  const finish = (set, extraUnset = {}) =>
    NotificationDelivery.updateOne(
      { _id: row._id, status: DELIVERY_STATUS.PROCESSING, lockedBy: row.lockedBy },
      { $set: set, $unset: { lockedUntil: "", lockedBy: "", ...extraUnset } },
    );
  const skip = async (skipReason) => {
    await finish({ status: DELIVERY_STATUS.SKIPPED, skipReason });
    return { result: "skipped" };
  };

  // The provider call and the recording of its result are kept apart: an
  // error AFTER the provider accepted a message (say, the database write
  // that records it) must never reach the retry path below, or the
  // student would get it twice.
  let sent;
  let masked;
  try {
    const drive = ctx.drives.get(String(row.driveId));
    const candidate = ctx.candidates.get(`${row.driveId}|${row.studentId}`);
    const student = ctx.students.get(String(row.studentId));
    const user = ctx.users.get(String(row.userId));

    // The situation may have changed since the row was queued.
    if (!student) return skip(SKIP_REASONS.STUDENT_REMOVED);
    if (!candidate?.eligible) return skip(SKIP_REASONS.NO_LONGER_ELIGIBLE);
    if (!registrationOpen(drive, now)) return skip(SKIP_REASONS.REGISTRATION_CLOSED);
    const recipient = evaluateRecipient(row.channel, user, student, cfg);
    if (!recipient.ok) return skip(recipient.skipReason);

    const message = buildMessage(row, { drive, user, address: recipient.address }, cfg);
    sent = await providerFor(row.channel, cfg).send(message, cfg);
    masked = recipient.masked;
  } catch (raw) {
    const err = raw instanceof DeliveryError ? raw : new DeliveryError("UNEXPECTED", redact(raw?.message || "Unexpected error"));
    const lastError = { code: err.code, message: redact(err.message), permanent: err.permanent, at: now };
    const maxAttempts = cfg.worker.maxAttempts;
    if (!err.permanent && row.attempts < maxAttempts) {
      const wait = Math.max(err.retryAfterMs || 0, backoffMs(row.attempts, cfg));
      const retryAt = new Date(now.getTime() + wait);
      await finish({ status: DELIVERY_STATUS.PENDING, nextAttemptAt: retryAt, lastError });
      return { result: "retrying", rateLimited: err.rateLimited, retryAt };
    }
    await finish({ status: DELIVERY_STATUS.FAILED, failedAt: now, lastError });
    // Codes and ids only: never the address or the message content.
    console.error(`[delivery] ${row.channel} ${row._id} failed: ${err.code}`);
    return { result: "failed", rateLimited: err.rateLimited, retryAt: err.retryAfterMs ? new Date(now.getTime() + err.retryAfterMs) : undefined };
  }

  // From here the provider has the message.
  row.handedOver = true;
  const success = {
    status: sent.simulated ? DELIVERY_STATUS.SIMULATED : DELIVERY_STATUS.SENT,
    provider: sent.provider,
    providerMessageId: sent.providerMessageId || undefined,
    recipientMasked: masked,
    ...(sent.simulated ? {} : { sentAt: new Date() }),
  };
  for (let attempt = 1; ; attempt++) {
    try {
      await finish(success, { lastError: "", nextAttemptAt: "" });
      return { result: sent.simulated ? "simulated" : "sent" };
    } catch (err) {
      if (attempt >= 3) {
        // Left "processing": after the lease it surfaces as INTERRUPTED for
        // an officer to judge. It is never re-sent automatically.
        console.error(`[delivery] ${row.channel} ${row._id} sent but not recorded: ${err.message}`);
        return { result: "unrecorded" };
      }
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
};

/**
 * Drain one channel: claim a batch, prefetch its data, send with the
 * channel's own concurrency, repeat. Each channel runs its own loop, so a
 * slow, failing or rate-limited provider never takes capacity from the
 * other channel.
 */
const processChannel = async (channel, cfg, counts, cache) => {
  const concurrency = cfg.worker.channelConcurrency[channel];
  // Small batches keep a batch's total send time far inside the lease.
  const batchSize = concurrency * 2;
  let processed = 0;
  while (processed < cfg.worker.maxPerRun) {
    if (isPaused(channel) || stopping) break;
    const { rows, contended } = await claimBatch(channel, new Date(), cfg, batchSize);
    if (!rows.length) {
      if (contended) continue;
      break;
    }
    try {
      const ctx = await prefetch(rows, cache);
      await runPool(rows, concurrency, async (row) => {
        if (isPaused(channel)) {
          await release(row);
          row.done = true;
          return;
        }
        processed++;
        counts.processed++;
        try {
          const outcome = await deliverOne(row, cfg, ctx);
          counts[outcome.result] = (counts[outcome.result] || 0) + 1;
          if (outcome.rateLimited && outcome.retryAt) pausedUntil.set(channel, outcome.retryAt);
          row.done = true;
        } catch (err) {
          // A database error while recording a failure or a skip. Nothing
          // was handed to the provider, so the row goes back to the queue.
          console.error(`[delivery] ${channel} ${row._id} could not be recorded: ${err.message}`);
        }
      });
    } finally {
      // Whatever went wrong in this batch, no row we still hold may wait
      // out the lease: any row not finished and never handed to the
      // provider is released for the next pass.
      const stranded = rows.filter((r) => !r.done && !r.handedOver);
      if (stranded.length) await Promise.allSettled(stranded.map(release));
    }
  }
  if (processed >= cfg.worker.maxPerRun) counts.capped = true;
};

/**
 * Process due rows on every channel in parallel, up to DELIVERY_MAX_PER_RUN
 * per channel. Safe to run on any number of processes at once. Returns
 * counts of what happened; `capped` means more work is waiting.
 */
export const processDueDeliveries = async ({ channels = DELIVERY_CHANNELS } = {}) => {
  const cfg = deliveryConfig();
  await recoverInterruptedDeliveries(new Date());

  const counts = { processed: 0, sent: 0, simulated: 0, retrying: 0, failed: 0, skipped: 0, errors: 0, capped: false };
  const cache = { drives: new Map() };
  // Settled, not all: a database error in one channel's batch (whose rows
  // were already released) must not abort the other channel's run.
  const results = await Promise.allSettled(channels.map((c) => processChannel(c, cfg, counts, cache)));
  for (const [i, r] of results.entries()) {
    if (r.status === "rejected") {
      counts.errors++;
      console.error(`[delivery] ${channels[i]} batch failed: ${r.reason?.message}`);
    }
  }
  return counts;
};

/** Clear rate-limit pauses (tests, or after an operator raises a limit). */
export const resetDeliveryPauses = () => {
  pausedUntil.clear();
  stopping = false;
};

/** One background loop per channel, so channels never wait for each other. */
const loops = Object.fromEntries(DELIVERY_CHANNELS.map((c) => [c, { running: null, again: false }]));
/** Set on shutdown: loops finish their current batch and stop claiming. */
let stopping = false;

/**
 * Graceful shutdown: stop claiming new work and wait for in-flight sends,
 * so a deploy does not leave rows "processing" (which would surface as
 * INTERRUPTED). Unclaimed rows simply wait in the queue for the next start.
 */
export const stopDeliveryLoops = async () => {
  stopping = true;
  await deliveryWorkerIdle();
};

const kickChannel = (channel) => {
  const loop = loops[channel];
  if (stopping) return;
  if (loop.running) {
    loop.again = true;
    return;
  }
  loop.running = new Promise((resolve) => setImmediate(resolve))
    .then(async () => {
      // Keep going while a run hit its cap: a large backlog drains
      // continuously instead of one batch per poll interval.
      let capped;
      do {
        loop.again = false;
        ({ capped } = await processDueDeliveries({ channels: [channel] }));
      } while (loop.again || capped);
    })
    .catch((err) => {
      console.error(`[delivery] ${channel} worker run failed: ${err.message}`);
      // Try again shortly rather than waiting for the next poll.
      setTimeout(() => deliveryConfig().worker.enabled && kickChannel(channel), 5000).unref();
    })
    .finally(() => {
      loop.running = null;
    });
};

/**
 * Start processing in the background without delaying the caller — the
 * publish request returns as soon as the rows exist. Overlapping kicks
 * coalesce into one more pass per channel.
 */
export const kickDeliveryWorker = () => {
  if (!deliveryConfig().worker.enabled) return;
  for (const c of DELIVERY_CHANNELS) kickChannel(c);
};

/** Resolves once this process's background loops are idle (tests, shutdown). */
export const deliveryWorkerIdle = async () => {
  while (DELIVERY_CHANNELS.some((c) => loops[c].running)) {
    await Promise.all(DELIVERY_CHANNELS.map((c) => loops[c].running));
  }
};

// ─── Officer actions and reports ─────────────────────────────────────

/**
 * Put failed rows back in the queue. Only rows whose status is `failed` are
 * touched, so nothing already sent, delivered, read or simulated can be sent
 * again. Also queues rows for eligible, already-notified students who have
 * none for an enabled channel (for example a channel switched on after
 * publishing); existing keys are untouched.
 */
export const retryDriveDeliveries = async (drive, { channel, ids } = {}, actor) => {
  if (!registrationOpen(drive, new Date())) {
    throw httpError(409, "Notifications can only be retried while registration for the drive is open");
  }
  if (channel !== undefined && !DELIVERY_CHANNELS.includes(channel)) {
    throw httpError(400, `Channel must be one of: ${DELIVERY_CHANNELS.join(", ")}`);
  }
  let idFilter = {};
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length > 1000 || !ids.every((id) => mongoose.isValidObjectId(id))) {
      throw httpError(400, "ids must be a list of delivery ids");
    }
    idFilter = { _id: { $in: ids } };
  }

  const now = new Date();
  const { modifiedCount } = await NotificationDelivery.updateMany(
    { driveId: drive._id, status: DELIVERY_STATUS.FAILED, ...(channel ? { channel } : {}), ...idFilter },
    {
      $set: { status: DELIVERY_STATUS.PENDING, attempts: 0, nextAttemptAt: now },
      $inc: { manualRetries: 1 },
      $unset: { failedAt: "" },
    },
  );

  let backfilled = 0;
  if (!ids) {
    const notified = await DriveCandidate.find({
      driveId: drive._id,
      eligible: true,
      notifiedAt: { $exists: true },
      userId: { $exists: true },
    })
      .select("studentId userId notificationId")
      .lean();
    const q = await queueDriveOpportunityDeliveries(
      drive,
      notified.map((c) => ({ studentId: c.studentId, userId: c.userId, notificationId: c.notificationId })),
    );
    backfilled = q.queued + q.skipped;
  }

  await audit(actor, "notification.retry", { drive, to: { channel: channel || "all", retried: modifiedCount, backfilled } });
  if (modifiedCount) kickDeliveryWorker();
  return { retried: modifiedCount, backfilled };
};

const inAppKeyPrefix = (driveId) => new RegExp(`^${escapeRegex(`drive:${driveId}:eligible:`)}`);

/** Every figure is counted from stored rows; nothing is estimated. */
export const driveDeliverySummary = async (drive) => {
  const driveId = drive._id;
  const [eligible, notified, inApp, inAppRead, rows] = await Promise.all([
    DriveCandidate.countDocuments({ driveId, eligible: true }),
    DriveCandidate.countDocuments({ driveId, eligible: true, notifiedAt: { $exists: true } }),
    Notification.countDocuments(dedupeKeyFilter(inAppKeyPrefix(driveId))),
    Notification.countDocuments({ ...dedupeKeyFilter(inAppKeyPrefix(driveId)), isRead: true }),
    NotificationDelivery.aggregate([
      { $match: { driveId } },
      { $group: { _id: { channel: "$channel", status: "$status", skipReason: "$skipReason" }, n: { $sum: 1 } } },
    ]),
  ]);

  const blank = () => ({
    total: 0, pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, simulated: 0, skippedBy: {},
  });
  const channels = { email: blank(), whatsapp: blank() };
  for (const { _id, n } of rows) {
    const c = channels[_id.channel];
    if (!c) continue;
    c.total += n;
    if (_id.status === DELIVERY_STATUS.PENDING || _id.status === DELIVERY_STATUS.PROCESSING) c.pending += n;
    else c[_id.status] += n;
    if (_id.status === DELIVERY_STATUS.SKIPPED && _id.skipReason) {
      c.skippedBy[_id.skipReason] = (c.skippedBy[_id.skipReason] || 0) + n;
    }
  }
  for (const c of Object.values(channels)) {
    // "Sent successfully" counts every row the provider accepted, whatever
    // the webhook has reported since.
    c.succeeded = c.sent + c.delivered + c.read;
  }
  const w = channels.whatsapp.skippedBy;
  return {
    config: publicDeliveryStatus(),
    eligible,
    notified,
    // The bell and the notification centre read the same stored record, so
    // one count describes both.
    inApp: { created: inApp, read: inAppRead },
    email: channels.email,
    whatsapp: {
      ...channels.whatsapp,
      unreachable: (w.no_consent || 0) + (w.no_phone || 0) + (w.invalid_phone || 0),
    },
  };
};

const STATUS_FILTERS = {
  pending: [DELIVERY_STATUS.PENDING, DELIVERY_STATUS.PROCESSING],
  sent: DELIVERED_STATUSES,
  failed: [DELIVERY_STATUS.FAILED],
  skipped: [DELIVERY_STATUS.SKIPPED],
  simulated: [DELIVERY_STATUS.SIMULATED],
};

/** Paginated channel-wise rows for the officer's report. Addresses are masked. */
export const listDriveDeliveries = async (drive, query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), MAX_PAGE_SIZE);
  const filter = { driveId: drive._id };
  if (query.channel) {
    if (!DELIVERY_CHANNELS.includes(query.channel)) throw httpError(400, "Unknown channel");
    filter.channel = query.channel;
  }
  if (query.status) {
    if (!STATUS_FILTERS[query.status]) throw httpError(400, "Unknown status filter");
    filter.status = { $in: STATUS_FILTERS[query.status] };
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(String(query.q).slice(0, 100)), "i");
    const matches = await DriveCandidate.find({
      driveId: drive._id,
      $or: [{ "academic.name": rx }, { "academic.usn": rx }],
    }).distinct("studentId");
    filter.studentId = { $in: matches };
  }

  const [total, rows] = await Promise.all([
    NotificationDelivery.countDocuments(filter),
    NotificationDelivery.find(filter)
      .sort({ updatedAt: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("channel status skipReason recipientMasked attempts manualRetries nextAttemptAt lastAttemptAt sentAt deliveredAt readAt failedAt lastError studentId createdAt updatedAt")
      .lean(),
  ]);
  const academic = await DriveCandidate.find({ driveId: drive._id, studentId: { $in: rows.map((r) => r.studentId) } })
    .select("studentId academic.name academic.usn academic.branch")
    .lean();
  const byStudent = new Map(academic.map((a) => [String(a.studentId), a.academic || {}]));

  return {
    page,
    limit,
    total,
    deliveries: rows.map((r) => {
      const a = byStudent.get(String(r.studentId)) || {};
      return { ...r, student: { name: a.name, usn: a.usn, branch: a.branch } };
    }),
  };
};

// ─── WhatsApp webhooks ───────────────────────────────────────────────

const tsDate = (ts) => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

/**
 * Apply delivery-status callbacks. Status only moves forward
 * (sent → delivered → read); a late "delivered" never overwrites "read",
 * and "failed" is only accepted for a message not yet delivered.
 */
export const applyWhatsAppStatuses = async (statuses = []) => {
  let updated = 0;
  for (const s of statuses) {
    if (!s?.id || typeof s.id !== "string") continue;
    const at = tsDate(s.timestamp);
    const base = { providerMessageId: s.id, channel: "whatsapp" };
    let r;
    if (s.status === "delivered") {
      r = await NotificationDelivery.updateOne(
        { ...base, status: DELIVERY_STATUS.SENT },
        { $set: { status: DELIVERY_STATUS.DELIVERED, deliveredAt: at } },
      );
    } else if (s.status === "read") {
      r = await NotificationDelivery.updateOne(
        { ...base, status: { $in: [DELIVERY_STATUS.SENT, DELIVERY_STATUS.DELIVERED] } },
        { $set: { status: DELIVERY_STATUS.READ, readAt: at } },
      );
      await NotificationDelivery.updateOne({ ...base, deliveredAt: { $exists: false } }, { $set: { deliveredAt: at } });
    } else if (s.status === "failed") {
      const e = Array.isArray(s.errors) ? s.errors[0] : null;
      r = await NotificationDelivery.updateOne(
        { ...base, status: DELIVERY_STATUS.SENT },
        {
          $set: {
            status: DELIVERY_STATUS.FAILED,
            failedAt: at,
            lastError: {
              code: `WA_${e?.code ?? "FAILED"}`,
              message: redact(e?.error_data?.details || e?.title || e?.message || "WhatsApp reported the message as failed"),
              permanent: true,
              at,
            },
          },
        },
      );
    }
    updated += r?.modifiedCount || 0;
  }
  return updated;
};

const OPT_OUT = /^\s*(stop|unsubscribe|stop all|opt out|optout)\s*[.!]?\s*$/i;

/**
 * Inbound messages: a "STOP" reply withdraws WhatsApp consent for every
 * student registered with that number. Nothing else in an inbound message
 * is stored.
 */
export const applyWhatsAppInbound = async (messages = []) => {
  let optedOut = 0;
  for (const m of messages) {
    const body = m?.text?.body ?? m?.button?.text ?? "";
    if (!m?.from || !OPT_OUT.test(String(body))) continue;
    const number = `+${String(m.from).replace(/\D/g, "")}`;
    const r = await Student.updateMany(
      { "whatsapp.number": number, "whatsapp.optIn": true },
      { $set: { "whatsapp.optIn": false, "whatsapp.optOutAt": new Date(), "whatsapp.consentSource": "whatsapp_reply" } },
    );
    optedOut += r.modifiedCount;
  }
  return optedOut;
};

/** Walk a webhook body ({ object, entry[].changes[].value }) and apply it. */
export const handleWhatsAppWebhook = async (body) => {
  const out = { statuses: 0, optedOut: 0 };
  if (body?.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      if (Array.isArray(value.statuses)) out.statuses += await applyWhatsAppStatuses(value.statuses);
      if (Array.isArray(value.messages)) out.optedOut += await applyWhatsAppInbound(value.messages);
    }
  }
  return out;
};

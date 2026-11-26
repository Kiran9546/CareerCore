import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import net from "node:net";
import mongoose from "mongoose";
import { setup, teardown, reset, createUser, createStudent, api, days } from "./helpers.js";
import Notification from "../models/Notification.js";
import NotificationDelivery, { DELIVERY_CHANNELS } from "../models/NotificationDelivery.js";
import DriveCandidate from "../models/DriveCandidate.js";
import Drive from "../models/Drive.js";
import User from "../models/User.js";
import {
  setDeliveryProviders,
  processDueDeliveries,
  resetDeliveryPauses,
  catchUpForStudent,
  checkEmailLogin,
  currentProviderAlerts,
} from "../services/notificationDeliveryService.js";
import { notifyEligibleStudents, evaluateStudentForOpenDrives } from "../services/eligibilityService.js";
import { DeliveryError, classifySmtpError } from "../services/delivery/providers.js";
import { getTransporter, mailFrom } from "../services/notificationService.js";
import { deliveryConfig, deliveryWarnings } from "../config/notifications.js";
import { productionEnvProblems } from "../config/env.js";

/**
 * The configuration CareerCore runs with today: in-app notifications plus
 * email through Gmail SMTP. WhatsApp is switched off (NOTIFY_WHATSAPP_ENABLED
 * unset) and must neither send nor get in the way.
 *
 * Email goes through a mock provider; nothing here can reach a mail server
 * (test/env.js removes the SMTP credentials, and the transport checks below
 * only build the transport, they never connect).
 */

const APP_URL = "https://careercore.example.edu";

const EMAIL_ONLY_ENV = {
  NOTIFICATION_DELIVERY_MODE: "live",
  NOTIFY_EMAIL_ENABLED: "true",
  NOTIFY_WHATSAPP_ENABLED: undefined,
  PUBLIC_APP_URL: APP_URL,
  DELIVERY_BACKOFF_BASE_MS: "60000",
  DELIVERY_MAX_ATTEMPTS: "5",
  DELIVERY_CONCURRENCY: "4",
  DELIVERY_WORKER: "off",
};
const configure = (overrides = {}) => {
  for (const [k, v] of Object.entries({ ...EMAIL_ONLY_ENV, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

const mockProvider = (behave = () => ({})) => {
  const calls = [];
  const provider = {
    calls,
    behave,
    async send(message) {
      calls.push(message);
      const r = await provider.behave(message, calls.length);
      return { provider: "mock", providerMessageId: `mock-${crypto.randomUUID()}`, ...r };
    },
  };
  return provider;
};

before(setup);
after(async () => {
  setDeliveryProviders({});
  await teardown();
});

let email;
let whatsapp;
beforeEach(async () => {
  await reset();
  configure();
  resetDeliveryPauses();
  email = mockProvider();
  // WhatsApp is off: any call to this provider is a bug.
  whatsapp = mockProvider(() => {
    throw new Error("WhatsApp must not be used");
  });
  setDeliveryProviders({ email, whatsapp });
});

const draftDrive = async (extra = {}) => {
  const officer = await createUser("placement_officer", { name: "Officer E" });
  const O = api(officer.token);
  const company = await O.post("/placement/companies", { name: extra.companyName || "Acme Systems" });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  const created = await O.post("/placement/drives", {
    workflow: "managed",
    companyId: company.body.company._id,
    role: "Graduate Engineer",
    driveDate: days(14).toISOString(),
    registrationDeadline: days(7).toISOString(),
    ctc: 8.5,
    location: "Mangaluru",
    minCgpa: 7,
    maxBacklogs: 0,
    branches: ["CSE", "ISE"],
    ...extra,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return { O, driveId: created.body.drive._id };
};
const publish = (O, driveId) => O.patch(`/placement/drives/${driveId}/status`, { status: "open" });
const recalc = (O, driveId) => O.post(`/placement/drives/${driveId}/eligibility/calculate`);

/**
 * Eligible and ineligible students. `a` also carries WhatsApp details that
 * would qualify if WhatsApp were on (verified number, consent).
 */
const cohort = async () => ({
  a: await createStudent({ branch: "CSE", cgpa: 8.2 }, { name: "Asha Rao", phone: "+919876543210", phoneVerifiedAt: new Date(), whatsapp: { optIn: true, consentAt: new Date() } }),
  b: await createStudent({ branch: "ISE", cgpa: 7.5 }, { name: "Bilal K" }),
  c: await createStudent({ branch: "CSE", cgpa: 9.1 }, { name: "Chen L" }),
  lowCgpa: await createStudent({ branch: "CSE", cgpa: 6.5 }),
  backlog: await createStudent({ branch: "CSE", cgpa: 8.5, backlogs: 2 }),
  mech: await createStudent({ branch: "ME", cgpa: 9.5 }),
});
const ELIGIBLE = ["a", "b", "c"];
const INELIGIBLE = ["lowCgpa", "backlog", "mech"];

const drain = async () => {
  await processDueDeliveries();
  await processDueDeliveries();
};
/** Drive emails only (verification emails have a different subject). */
const driveEmails = () => email.calls.filter((m) => m.subject.startsWith("New Placement Opportunity"));
const opportunityCount = (userId) =>
  Notification.countDocuments({ userId, type: "drive_opportunity", "metadata.kind": "opportunity" });

// ─── 1. Gmail SMTP configuration ─────────────────────────────────────

test("Gmail settings: the variables documented in .env.example are the ones the transport reads", () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, {
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "587",
      SMTP_USER: "placements@gmail.com",
      SMTP_PASS: "abcd efgh ijkl mnop",
    });
    delete process.env.SMTP_SECURE;
    delete process.env.EMAIL_FROM_ADDRESS;
    const tx = getTransporter();
    assert.ok(tx, "a transport is built when SMTP_USER and SMTP_PASS are set");
    assert.equal(tx.options.host, "smtp.gmail.com");
    assert.equal(tx.options.port, 587);
    assert.equal(tx.options.secure, false, "587 is STARTTLS, not implicit TLS");
    assert.equal(tx.options.requireTLS, true, "the password never crosses unencrypted");
    assert.deepEqual(tx.options.auth, { user: "placements@gmail.com", pass: "abcd efgh ijkl mnop" });
    assert.equal(tx.options.pool, true);
    assert.equal(mailFrom().address, "placements@gmail.com", "From defaults to the Gmail account");
    assert.equal(deliveryConfig().email.configured, true);
    tx.close();

    process.env.SMTP_PORT = "465";
    const tls = getTransporter();
    assert.equal(tls.options.secure, true, "465 is implicit TLS");
    tls.close();

    delete process.env.SMTP_PASS;
    assert.equal(getTransporter(), null, "no transport without a password");
    assert.equal(deliveryConfig().email.configured, false);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }

  // An email-only production setup starts cleanly, without WhatsApp warnings.
  const good = { JWT_SECRET: "x".repeat(40), MONGO_URI: "mongodb+srv://u:p@c.mongodb.net/db", CLIENT_URL: APP_URL };
  assert.deepEqual(productionEnvProblems({ ...good, NOTIFICATION_DELIVERY_MODE: "live", SMTP_USER: "u@gmail.com", SMTP_PASS: "p" }), []);
  const warnings = deliveryWarnings(deliveryConfig({ ...good, NODE_ENV: "production", SMTP_USER: "u@gmail.com", SMTP_PASS: "p" }));
  assert.deepEqual(warnings, []);
});

test("Gmail errors: a wrong App Password pauses email, a bad address fails that one email, the daily limit holds the queue", () => {
  const auth = classifySmtpError({ code: "EAUTH", responseCode: 535, response: "535-5.7.8 Username and Password not accepted." });
  assert.equal(auth.credential, true);
  assert.equal(auth.permanent, false);

  const mailbox = classifySmtpError({ code: "EENVELOPE", responseCode: 550, response: "550-5.1.1 The email account that you tried to reach does not exist." });
  assert.equal(mailbox.permanent, true);
  assert.equal(mailbox.quota, false);

  for (const response of [
    "550-5.4.5 Daily user sending limit exceeded.",
    "550 5.4.5 Daily sending quota exceeded.",
    "421-4.7.28 Our system has detected an unusual rate of unsolicited mail.",
  ]) {
    const quota = classifySmtpError({ code: "EENVELOPE", responseCode: Number(response.slice(0, 3)), response });
    assert.equal(quota.quota, true, response);
    assert.equal(quota.permanent, false, `${response} must not fail the student's email for good`);
    assert.equal(quota.code, "SMTP_QUOTA");
  }

  const busy = classifySmtpError({ code: "EENVELOPE", responseCode: 421, response: "421 4.7.0 Try again later, closing connection." });
  assert.equal(busy.rateLimited, true);
  assert.equal(busy.permanent, false);
  assert.equal(classifySmtpError({ code: "ETIMEDOUT", message: "Connection timeout" }).permanent, false);
});

// ─── 2. Email verification ───────────────────────────────────────────

test("email verification in the email-only setup; WhatsApp is not offered, recorded or sent", async () => {
  const channels = await api().get("/auth/alert-channels");
  assert.deepEqual(channels.body, { inApp: true, email: true, whatsapp: false });

  const r = await api().post("/auth/register", {
    name: "Asha Rao",
    email: "asha.rao@gmail.com",
    password: "Password123!",
    role: "student",
    phone: "+91 98765 43210",
    whatsappConsent: true, // an older client ticking a box WhatsApp-off servers no longer show
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.verification.whatsapp, null, "no WhatsApp code with WhatsApp off");
  assert.equal(r.body.verification.email.sent, true);
  assert.equal(whatsapp.calls.length, 0);

  const user = await User.findOne({ email: "asha.rao@gmail.com" }).lean();
  assert.equal(user.phone, "+919876543210", "the mobile number is still kept on the account");
  assert.ok(!user.whatsapp?.optIn, "no WhatsApp consent recorded");
  assert.ok(!user.emailVerifiedAt);

  const [mail] = email.calls;
  assert.equal(mail.to, "asha.rao@gmail.com");
  assert.equal(mail.subject, "Verify your email for CareerCore");
  const token = mail.text.match(/verify-email\?token=([a-f0-9]{64})/)?.[1];
  assert.ok(token && mail.text.includes(`${APP_URL}/verify-email?token=`));
  assert.ok(mail.html.includes(token));

  const ok = await api().post("/auth/email/verify", { token });
  assert.equal(ok.status, 200);
  assert.ok((await User.findById(user._id).lean()).emailVerifiedAt);
  assert.equal((await api().post("/auth/email/verify", { token })).status, 400, "single use");

  // The WhatsApp code endpoint is closed, in live and in sandbox mode alike.
  const S = api(r.body.token);
  assert.equal((await S.post("/auth/phone/send-code", { phone: "+919876543210", consent: true })).status, 503);
  configure({ NOTIFICATION_DELIVERY_MODE: "sandbox" });
  const sandboxed = await S.post("/auth/phone/send-code", { phone: "+919876543210", consent: true });
  assert.equal(sandboxed.status, 503);
  assert.equal(sandboxed.body.devCode, undefined);
  assert.equal(whatsapp.calls.length, 0);
  const view = (await S.get("/auth/contact")).body;
  assert.equal(view.whatsapp.available, false);
  assert.equal(view.email.optIn, true);
});

// ─── 3, 4, 5, 8, 10. Publish: eligible only, both channels, once ──────

test("publishing: each eligible student gets one in-app notification and one email; ineligible students get nothing", async () => {
  const s = await cohort();
  const { O, driveId } = await draftDrive();
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity" }), 0, "a draft notifies nobody");

  const res = await publish(O, driveId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.notified, 3);

  // In-app: created in the request, before any email is sent.
  for (const k of ELIGIBLE) assert.equal(await opportunityCount(s[k].user._id), 1, k);
  for (const k of INELIGIBLE) {
    assert.equal(await Notification.countDocuments({ userId: s[k].user._id }), 0, `${k} hears nothing in the app`);
    assert.equal(await NotificationDelivery.countDocuments({ studentId: s[k].student._id }), 0, `${k} has no email queued`);
  }
  assert.equal(email.calls.length, 0, "email waits for the background worker");
  assert.equal(await NotificationDelivery.countDocuments({ channel: "whatsapp" }), 0, "WhatsApp off: nothing queued");

  await drain();
  const to = driveEmails().map((m) => m.to).sort();
  assert.deepEqual(to, ELIGIBLE.map((k) => s[k].user.email).sort());
  const msg = driveEmails().find((m) => m.to === s.a.user.email);
  assert.ok(msg.subject.includes("Acme Systems"));
  assert.ok(msg.html.includes(`${APP_URL}/student/drives/${driveId}`), "Register link");
  assert.ok(msg.text.includes(`${APP_URL}/student/profile#contact`), "Manage email alerts link");
  assert.equal(whatsapp.calls.length, 0);

  // The student sees it in the notification centre.
  const inbox = await api(s.b.token).get("/notifications");
  assert.equal(inbox.body.notifications.filter((n) => n.type === "drive_opportunity").length, 1);

  // Repeats of every kind: recalculations, concurrent workers, close and
  // reopen, and an interrupted run (notifiedAt cleared).
  await recalc(O, driveId);
  await recalc(O, driveId);
  await Promise.all([processDueDeliveries(), processDueDeliveries(), processDueDeliveries()]);
  assert.equal((await O.patch(`/placement/drives/${driveId}/status`, { status: "registration_closed" })).status, 200);
  assert.equal((await publish(O, driveId)).status, 200);
  await DriveCandidate.updateMany({ driveId }, { $unset: { notifiedAt: "" } });
  await notifyEligibleStudents(await Drive.findById(driveId));
  await drain();

  assert.equal(driveEmails().length, 3, "exactly one email per eligible student");
  for (const k of ELIGIBLE) assert.equal(await opportunityCount(s[k].user._id), 1, `${k}: one in-app notification`);
  assert.equal(await NotificationDelivery.countDocuments(), 3);
  assert.equal(await NotificationDelivery.countDocuments({ status: "sent" }), 3);

  const summary = (await O.get(`/placement/drives/${driveId}/notifications/summary`)).body.summary;
  assert.equal(summary.inApp.created, 3);
  assert.equal(summary.email.succeeded, 3);
  assert.equal(summary.whatsapp.total, 0);
  assert.equal(summary.config.whatsapp.enabled, false);
  assert.deepEqual(summary.config.warnings, []);
});

test("WhatsApp cannot block email or in-app: no rows, no calls, and the email channel runs alone", async () => {
  assert.deepEqual(DELIVERY_CHANNELS, ["email", "whatsapp"], "no SMS or push channel exists");
  const s = await cohort();
  const { O, driveId } = await draftDrive();
  // Even a WhatsApp provider that never answers cannot hold anything up.
  whatsapp.behave = () => new Promise(() => {});
  await publish(O, driveId);
  await drain();
  assert.equal(driveEmails().length, 3);
  assert.equal(whatsapp.calls.length, 0);
  assert.equal(await NotificationDelivery.countDocuments({ channel: "whatsapp" }), 0);
  // A student with consent and a verified number (from before WhatsApp was
  // switched off) gets nothing on WhatsApp from a catch-up either.
  assert.deepEqual(await catchUpForStudent(s.a.student._id, ["whatsapp"]), { queued: 0, drives: 0 });
  assert.equal(whatsapp.calls.length, 0);
});

test("email and in-app are independent: email down leaves in-app intact; email off still notifies in the app", async () => {
  const s = await cohort();
  const { O, driveId } = await draftDrive();
  email.behave = () => {
    throw new DeliveryError("ECONNECTION", "Connection refused");
  };
  await publish(O, driveId);
  await drain();
  for (const k of ELIGIBLE) assert.equal(await opportunityCount(s[k].user._id), 1);
  assert.equal(await NotificationDelivery.countDocuments({ status: "pending", "lastError.code": "ECONNECTION" }), 3);

  // Email switched off entirely: in-app still goes out.
  const second = await draftDrive({ companyName: "Beta Labs" });
  configure({ NOTIFY_EMAIL_ENABLED: "false" });
  email.calls.length = 0;
  const r = await publish(second.O, second.driveId);
  assert.equal(r.body.notified, 3);
  assert.equal(await NotificationDelivery.countDocuments({ driveId: second.driveId }), 0);
  await drain();
  assert.equal(email.calls.length, 0);
  for (const k of ELIGIBLE) {
    assert.equal(
      await Notification.countDocuments({ userId: s[k].user._id, "metadata.driveId": new mongoose.Types.ObjectId(second.driveId) }),
      1,
    );
  }
});

// ─── 9. Draft, expired and closed drives ─────────────────────────────

test("draft, expired and closed drives never announce anything new", async () => {
  await cohort();
  const { O, driveId } = await draftDrive();

  // Draft: recalculation evaluates but tells no one.
  assert.equal((await recalc(O, driveId)).status, 200);
  assert.equal(await notifyEligibleStudents(await Drive.findById(driveId)), 0);
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity" }), 0);

  // A deadline in the past cannot be published.
  const expired = await draftDrive({ companyName: "Late Corp" });
  await Drive.updateOne({ _id: expired.driveId }, { $set: { registrationDeadline: days(-1) } });
  assert.equal((await publish(expired.O, expired.driveId)).status, 400);
  assert.equal((await Drive.findById(expired.driveId).lean()).status, "draft");

  // Open drive whose deadline passed before the scheduled job closed it:
  // a student who joins now, a recalculation and a direct call announce nothing.
  await publish(O, driveId);
  await drain();
  const before = { inApp: await Notification.countDocuments({ type: "drive_opportunity" }), email: driveEmails().length };
  await Drive.updateOne({ _id: driveId }, { $set: { registrationDeadline: days(-0.01) } });
  const late = await createStudent({ branch: "CSE", cgpa: 9.9 });
  await evaluateStudentForOpenDrives(late.student._id);
  await recalc(O, driveId);
  await DriveCandidate.updateMany({ driveId }, { $unset: { notifiedAt: "" } });
  assert.equal(await notifyEligibleStudents(await Drive.findById(driveId)), 0);
  await drain();
  assert.equal(await Notification.countDocuments({ userId: late.user._id }), 0);
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity" }), before.inApp);
  assert.equal(driveEmails().length, before.email);

  // Closed drive: same.
  const closed = await draftDrive({ companyName: "Gamma Works" });
  await publish(closed.O, closed.driveId);
  assert.equal((await closed.O.patch(`/placement/drives/${closed.driveId}/status`, { status: "registration_closed" })).status, 200);
  const later = await createStudent({ branch: "ISE", cgpa: 9.0 });
  await evaluateStudentForOpenDrives(later.student._id);
  assert.equal((await recalc(closed.O, closed.driveId)).status, 200);
  assert.equal(await notifyEligibleStudents(await Drive.findById(closed.driveId)), 0);
  assert.equal(await Notification.countDocuments({ userId: later.user._id }), 0);

  // Emails queued while open but not yet sent when registration closes are
  // skipped at send time, never sent late.
  const quick = await draftDrive({ companyName: "Delta Inc" });
  await publish(quick.O, quick.driveId);
  await quick.O.patch(`/placement/drives/${quick.driveId}/status`, { status: "registration_closed" });
  const sentBefore = driveEmails().length;
  await drain();
  assert.equal(driveEmails().length, sentBefore);
  const rows = await NotificationDelivery.find({ driveId: quick.driveId }).lean();
  assert.ok(rows.length > 0 && rows.every((r) => r.status === "skipped" && r.skipReason === "registration_closed"));
});

// ─── 6. Failures: logged and retried safely ──────────────────────────

test("email failures: transient errors retry with backoff, permanent ones fail and are logged without the address, officer retry resends once", async () => {
  const s = await cohort();
  const { O, driveId } = await draftDrive();
  const errors = [];
  const realError = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    const fail = new Map([
      [s.a.user.email, () => new DeliveryError("ECONNECTION", "Connection refused")],
      [s.b.user.email, () => new DeliveryError("SMTP_550", `550 5.1.1 <${s.b.user.email}> does not exist`, { permanent: true })],
    ]);
    email.behave = (m) => {
      const f = fail.get(m.to);
      if (f) throw f();
      return {};
    };
    await publish(O, driveId);
    await drain();

    const rowA = await NotificationDelivery.findOne({ studentId: s.a.student._id }).lean();
    assert.equal(rowA.status, "pending", "transient: queued again");
    assert.equal(rowA.attempts, 1);
    assert.equal(rowA.lastError.code, "ECONNECTION");
    assert.ok(rowA.nextAttemptAt > new Date(Date.now() + 30000), "with a backoff, not immediately");

    const rowB = await NotificationDelivery.findOne({ studentId: s.b.student._id }).lean();
    assert.equal(rowB.status, "failed", "permanent: not retried automatically");
    assert.equal(rowB.attempts, 1);
    assert.ok(!rowB.lastError.message.includes(s.b.user.email), "the stored error has no address");
    assert.ok(errors.some((e) => e.includes("[delivery] email") && e.includes("SMTP_550")), "the failure is logged");
    assert.ok(errors.every((e) => !e.includes(s.b.user.email)), "logs never contain the address");

    // The connection recovers: the pending row goes out on its next turn.
    fail.delete(s.a.user.email);
    await NotificationDelivery.updateOne({ _id: rowA._id }, { $set: { nextAttemptAt: new Date() } });
    await drain();
    assert.equal((await NotificationDelivery.findById(rowA._id).lean()).status, "sent");

    // The address is corrected; the officer resends the failed one.
    fail.delete(s.b.user.email);
    const retry = await O.post(`/placement/drives/${driveId}/notifications/retry`, { channel: "email" });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    await drain();

    const delivered = driveEmails().filter((m) => !fail.has(m.to));
    const per = delivered.reduce((m, x) => m.set(x.to, (m.get(x.to) || 0) + 1), new Map());
    // a: 1 failed attempt + 1 success; b: 1 failed + 1 success; c: 1 success.
    assert.equal(await NotificationDelivery.countDocuments({ status: "sent" }), 3);
    assert.equal(per.get(s.c.user.email), 1, "c was never sent twice");
    assert.equal(await NotificationDelivery.countDocuments({ status: { $in: ["pending", "failed"] } }), 0);
  } finally {
    console.error = realError;
  }
});

test("Gmail's daily limit holds the remaining emails without using retries, alerts the officer, and resumes", async () => {
  const s = await cohort();
  const { O, driveId } = await draftDrive();
  let quotaUsed = false;
  email.behave = () => {
    if (quotaUsed) throw classifySmtpError({ code: "EENVELOPE", responseCode: 550, response: "550-5.4.5 Daily user sending limit exceeded." });
    quotaUsed = true; // the first email uses up the last of the quota
    return {};
  };
  const realError = console.error;
  console.error = () => {};
  try {
    await publish(O, driveId);
    await drain();
  } finally {
    console.error = realError;
  }
  assert.equal(await NotificationDelivery.countDocuments({ status: "sent" }), 1);
  const held = await NotificationDelivery.find({ status: "pending" }).lean();
  assert.equal(held.length, 2, "the rest stay queued");
  assert.ok(held.every((r) => r.attempts === 0 && r.lastError.code === "SMTP_QUOTA"), "no retry was spent");
  assert.equal(await NotificationDelivery.countDocuments({ status: "failed" }), 0, "no student is marked failed");
  assert.ok(held.every((r) => r.nextAttemptAt > new Date(Date.now() + 30 * 60000)), "the channel waits about an hour");

  const calls = email.calls.length;
  await processDueDeliveries();
  assert.equal(email.calls.length, calls, "paused: no hammering the mail server");

  const summary = (await O.get(`/placement/drives/${driveId}/notifications/summary`)).body.summary;
  assert.match(summary.config.alerts.email.message, /sending limit/);
  assert.equal(summary.email.failed, 0);

  // A day later the quota is back.
  email.behave = () => ({});
  resetDeliveryPauses();
  await NotificationDelivery.updateMany({ status: "pending" }, { $set: { nextAttemptAt: new Date() } });
  await drain();
  assert.equal(await NotificationDelivery.countDocuments({ status: "sent" }), 3);
  const sentTo = driveEmails().slice(-2).map((m) => m.to).sort();
  assert.equal(new Set(sentTo).size, 2);
  for (const k of ELIGIBLE) assert.equal(await opportunityCount(s[k].user._id), 1);
});

// ─── 7. Students manage their email preference ───────────────────────

test("a student can turn placement emails off and on; in-app always continues; turning on catches up once", async () => {
  const s = await cohort();
  const A = api(s.a.token);
  assert.equal((await A.put("/auth/contact/email", { optIn: "no" })).status, 400);
  const off = await A.put("/auth/contact/email", { optIn: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.email.optIn, false);

  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  await drain();
  assert.equal(await opportunityCount(s.a.user._id), 1, "still notified in the app");
  assert.ok(!driveEmails().some((m) => m.to === s.a.user.email), "no email while off");
  const row = await NotificationDelivery.findOne({ studentId: s.a.student._id }).lean();
  assert.equal(row.status, "skipped");
  assert.equal(row.skipReason, "email_opt_out");
  assert.equal(driveEmails().length, 2, "everyone else is emailed");

  // Back on: the open drive they missed is emailed, once.
  const on = await A.put("/auth/contact/email", { optIn: true });
  assert.equal(on.body.email.optIn, true);
  assert.equal(on.body.catchUp.queued, 1);
  await drain();
  assert.equal(driveEmails().filter((m) => m.to === s.a.user.email).length, 1);
  // Toggling again never re-sends what was sent.
  await A.put("/auth/contact/email", { optIn: false });
  await A.put("/auth/contact/email", { optIn: true });
  await drain();
  assert.equal(driveEmails().filter((m) => m.to === s.a.user.email).length, 1);

  // Turned off after an email was queued but before it was sent: not sent.
  const B = api(s.b.token);
  const second = await draftDrive({ companyName: "Beta Labs" });
  await publish(second.O, second.driveId);
  const viaPreferences = await B.put("/student/notification-preferences", { emailOptIn: false });
  assert.equal(viaPreferences.status, 200, JSON.stringify(viaPreferences.body));
  await drain();
  const rowB = await NotificationDelivery.findOne({ driveId: second.driveId, studentId: s.b.student._id }).lean();
  assert.equal(rowB.status, "skipped");
  assert.equal(rowB.skipReason, "email_opt_out");
  assert.equal(await Notification.countDocuments({ userId: s.b.user._id, type: "drive_opportunity" }), 2);
});

test("a student can change their mobile number without WhatsApp", async () => {
  const { token, user } = await createStudent({}, { phone: "+919876543210" });
  const S = api(token);
  assert.equal((await S.put("/auth/contact/phone", { phone: "12" })).status, 400);
  const r = await S.put("/auth/contact/phone", { phone: "+91 91234 56789" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.phone.number, "+919123456789");
  assert.equal((await User.findById(user._id).lean()).phone, "+919123456789");
  assert.equal(whatsapp.calls.length, 0);
});

// ─── Live vs sandbox, through the real SMTP transport ────────────────

/**
 * A minimal SMTP server on localhost: enough of the protocol for
 * nodemailer to log in and hand over a message. `acceptLogin` decides the
 * AUTH answer. Every accepted message is kept in `messages`.
 */
const fakeSmtp = async ({ acceptLogin = true } = {}) => {
  const messages = [];
  const logins = [];
  const server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    let current = null;
    socket.write("220 fake.smtp ESMTP ready\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          current.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          messages.push(current);
          socket.write("250 2.0.0 OK queued\r\n");
          continue;
        }
        const nl = buffer.indexOf("\r\n");
        if (nl < 0) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const cmd = line.split(" ")[0].toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") socket.write("250-fake.smtp\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
        else if (cmd === "AUTH") {
          logins.push(Buffer.from(line.split(" ")[2] || "", "base64").toString("utf8").split(String.fromCharCode(0)));
          socket.write(acceptLogin ? "235 2.7.0 Accepted\r\n" : "535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 BadCredentials\r\n");
        } else if (cmd === "MAIL") {
          current = { from: line, to: [] };
          socket.write("250 2.1.0 OK\r\n");
        } else if (cmd === "RCPT") {
          current.to.push(line.replace(/^RCPT TO:\s*/i, "").replace(/[<>]/g, ""));
          socket.write("250 2.1.5 OK\r\n");
        } else if (cmd === "DATA") {
          inData = true;
          socket.write("354 Go ahead\r\n");
        } else if (cmd === "QUIT") {
          socket.end("221 2.0.0 Bye\r\n");
          return;
        } else socket.write("250 OK\r\n");
      }
    });
    socket.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { port: server.address().port, messages, logins, close: () => new Promise((r) => server.close(r)) };
};

/** Point the real transport at a fake server (no TLS on localhost). */
const useSmtp = (port) =>
  configure({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_SECURE: "false", SMTP_USER: "team@gmail.com", SMTP_PASS: "app password 16ch" });
const dropSmtp = () => {
  getTransporter()?.close();
  configure({ SMTP_HOST: undefined, SMTP_PORT: undefined, SMTP_SECURE: undefined, SMTP_USER: undefined, SMTP_PASS: undefined });
};
/** The decoded text of a message as it crossed the wire (quoted-printable undone). */
const wireText = (m) => m.data.replace(/=\r\n/g, "").replace(/=3D/g, "=");

test("delivery mode: unset means sandbox outside production and live in production; a typo is reported, not silently used", () => {
  assert.equal(deliveryConfig({}).mode, "sandbox");
  assert.match(deliveryWarnings(deliveryConfig({})).join(" "), /NOTIFICATION_DELIVERY_MODE is not set/);
  assert.equal(deliveryConfig({ NODE_ENV: "production" }).mode, "live");
  assert.equal(deliveryConfig({ NOTIFICATION_DELIVERY_MODE: " LIVE " }).mode, "live");
  const typo = deliveryConfig({ NOTIFICATION_DELIVERY_MODE: "real" });
  assert.equal(typo.mode, "sandbox");
  assert.match(deliveryWarnings(typo)[0], /"real" is not one of live, sandbox, off/);
  const prod = { JWT_SECRET: "x".repeat(40), MONGO_URI: "mongodb+srv://u:p@c/db", CLIENT_URL: APP_URL };
  assert.equal(productionEnvProblems({ ...prod, NOTIFICATION_DELIVERY_MODE: "real" }).length, 1, "production refuses to start on a typo");

  // Links: localhost only outside production; production uses the deployed address.
  assert.equal(deliveryConfig({ CLIENT_URL: "http://localhost:5173" }).appUrl, "http://localhost:5173");
  assert.equal(deliveryConfig({ CLIENT_URL: "http://localhost:5173", PUBLIC_APP_URL: "http://localhost:5174/" }).appUrl, "http://localhost:5174");
  assert.equal(deliveryConfig({ NODE_ENV: "production" }).appUrl, "", "no localhost fallback in production");
  assert.equal(deliveryConfig({ NODE_ENV: "production", CLIENT_URL: `${APP_URL},https://staging.example.edu` }).appUrl, APP_URL);
  assert.ok(productionEnvProblems({ ...prod, CLIENT_URL: "http://localhost:5173" }).length > 0, "production refuses a localhost website address");
});

test("live mode: the verification email really goes out over SMTP, with the website link and no simulated link", async () => {
  const smtp = await fakeSmtp();
  setDeliveryProviders({}); // the real SMTP provider, not a mock
  useSmtp(smtp.port);
  try {
    const { token: jwt, user } = await createStudent({ usn: "4MT23IS039" }, { email: "own.account@gmail.com" });
    const S = api(jwt);
    const r = await S.post("/auth/email/resend");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { sent: true, simulated: false });
    assert.equal(smtp.messages.length, 1);
    const [m] = smtp.messages;
    assert.deepEqual(m.to, ["own.account@gmail.com"]);
    assert.ok(m.from.includes("team@gmail.com"), "sent from the SMTP account");
    assert.deepEqual(smtp.logins[0].slice(1), ["team@gmail.com", "app password 16ch"], "SMTP_USER / SMTP_PASS are used to log in");
    assert.ok(!JSON.stringify(r.body).includes("app password"), "no credential in the response");

    // The link in the real message verifies the account, once.
    const body = wireText(m);
    const token = body.match(/verify-email\?token=([a-f0-9]{64})/)?.[1];
    assert.ok(token, "the email carries the link");
    assert.ok(body.includes(`${APP_URL}/verify-email?token=${token}`), "pointing at PUBLIC_APP_URL");
    const stored = await User.findById(user._id).select("+emailVerification").lean();
    assert.equal(stored.emailVerification.tokenHash, crypto.createHash("sha256").update(token).digest("hex"), "only the hash is stored");
    assert.ok(!JSON.stringify(stored).includes(token));
    assert.equal((await api().post("/auth/email/verify", { token })).status, 200);
    assert.equal((await S.get("/auth/contact")).body.email.verified, true, "the profile shows the real status");
    assert.equal((await api().post("/auth/email/verify", { token })).status, 400, "already used");
    assert.equal((await S.post("/auth/email/resend")).body.alreadyVerified, true);
    assert.equal(smtp.messages.length, 1);
  } finally {
    dropSmtp();
    await smtp.close();
  }
});

test("live mode: a refused Gmail login is reported clearly, nothing is simulated, the student can retry at once, and the start-up check flags it", async () => {
  const smtp = await fakeSmtp({ acceptLogin: false });
  setDeliveryProviders({});
  useSmtp(smtp.port);
  const realError = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(" "));
  try {
    const { token: jwt, user } = await createStudent({}, { email: "own.account@gmail.com" });
    const S = api(jwt);
    const r = await S.post("/auth/email/resend");
    assert.equal(r.body.sent, false);
    assert.equal(r.body.simulated, undefined, "never falls back to a simulated send");
    assert.equal(r.body.devLink, undefined);
    assert.match(r.body.reason, /refused to log in/);
    assert.ok(!JSON.stringify(r.body).includes("app password"));
    assert.equal(smtp.messages.length, 0);
    assert.ok(logged.some((l) => l.includes("verification email") && /EAUTH|535/.test(l)), "logged for the operator");
    assert.ok(logged.every((l) => !l.includes("app password")), "logs carry no password");
    const stored = await User.findById(user._id).select("+emailVerification").lean();
    assert.equal(stored.emailVerification, undefined, "no unsent link is left behind");
    assert.equal((await S.post("/auth/email/resend")).status, 200, "no one-minute wait after a failed send");

    const check = await checkEmailLogin();
    assert.equal(check.ok, false);
    assert.equal(check.credential, true);
    assert.match(currentProviderAlerts().email.message, /refused the login/);
  } finally {
    console.error = realError;
    dropSmtp();
    await smtp.close();
  }

  // With the login accepted the check passes; it never sends a message.
  const good = await fakeSmtp();
  useSmtp(good.port);
  try {
    resetDeliveryPauses();
    const ok = await checkEmailLogin();
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(good.logins.length, 1);
    assert.equal(good.messages.length, 0);
  } finally {
    dropSmtp();
    await good.close();
  }
});

test("sandbox mode: nothing reaches the mail server; the simulated link is shown only outside production", async () => {
  const smtp = await fakeSmtp();
  setDeliveryProviders({});
  useSmtp(smtp.port);
  configure({ NOTIFICATION_DELIVERY_MODE: "sandbox", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.port), SMTP_SECURE: "false", SMTP_USER: "team@gmail.com", SMTP_PASS: "app password 16ch" });
  try {
    const { token: jwt } = await createStudent({}, { email: "own.account@gmail.com" });
    const S = api(jwt);
    const r = await S.post("/auth/email/resend");
    assert.equal(r.body.sent, false);
    assert.equal(r.body.simulated, true);
    assert.ok(r.body.devLink.startsWith(`${APP_URL}/verify-email?token=`));
    assert.equal((await S.get("/auth/contact")).body.sandbox, true, "the profile banner is driven by this");
    assert.equal(smtp.messages.length, 0);
    assert.equal(smtp.logins.length, 0, "the mail server is never contacted");

    const second = await createStudent({}, { email: "second@gmail.com" });
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const p = await api(second.token).post("/auth/email/resend");
      assert.equal(p.body.simulated, true);
      assert.equal(p.body.devLink, undefined, "never a usable link in a production build");
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
  } finally {
    dropSmtp();
    await smtp.close();
  }
});

test("live mode: a published drive's emails go through the real SMTP transport to eligible students only, once", async () => {
  const smtp = await fakeSmtp();
  setDeliveryProviders({});
  useSmtp(smtp.port);
  try {
    const s = await cohort();
    const { O, driveId } = await draftDrive();
    await publish(O, driveId);
    await drain();
    await recalc(O, driveId);
    await drain();
    const to = smtp.messages.flatMap((m) => m.to).sort();
    assert.deepEqual(to, ELIGIBLE.map((k) => s[k].user.email).sort());
    assert.ok(smtp.messages.every((m) => /New Placement Opportunity/.test(wireText(m))));
    const rows = await NotificationDelivery.find({ driveId }).lean();
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.status === "sent" && r.provider === "smtp" && r.providerMessageId && r.sentAt));
  } finally {
    dropSmtp();
    await smtp.close();
  }
});

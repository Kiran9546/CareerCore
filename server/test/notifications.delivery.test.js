import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { setup, teardown, reset, createUser, createStudent, api, days, baseUrlForTests } from "./helpers.js";
import Notification from "../models/Notification.js";
import NotificationDelivery from "../models/NotificationDelivery.js";
import DriveCandidate from "../models/DriveCandidate.js";
import Drive from "../models/Drive.js";
import Student from "../models/Student.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import {
  setDeliveryProviders,
  processDueDeliveries,
  resetDeliveryPauses,
  deliveryWorkerIdle,
} from "../services/notificationDeliveryService.js";
import { notifyEligibleStudents } from "../services/eligibilityService.js";
import { DeliveryError, redact } from "../services/delivery/providers.js";
import { renderOpportunityEmail, opportunityFacts } from "../services/delivery/driveOpportunityMessages.js";
import { productionEnvProblems } from "../config/env.js";
import { normalizePhone } from "../utils/phone.js";

/**
 * Multi-channel drive notifications: publish → eligibility → in-app →
 * email and WhatsApp queued → background delivery → report and retry.
 *
 * Providers are mocks, or (for WhatsApp) the real Cloud API client pointed
 * at a fake Graph API on localhost. Nothing here can reach a real inbox or
 * phone: test/env.js removes every credential.
 */

const APP_URL = "https://careercore.example.edu";
const WA_SECRET = "test-app-secret";
const WA_VERIFY = "test-verify-token";

const BASE_ENV = {
  NOTIFICATION_DELIVERY_MODE: "live",
  NOTIFY_EMAIL_ENABLED: "true",
  NOTIFY_WHATSAPP_ENABLED: "true",
  PUBLIC_APP_URL: APP_URL,
  WHATSAPP_ACCESS_TOKEN: "test-token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_TEMPLATE_NAME: "placement_drive_alert",
  WHATSAPP_API_VERSION: "v21.0",
  WHATSAPP_APP_SECRET: WA_SECRET,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: WA_VERIFY,
  DELIVERY_BACKOFF_BASE_MS: "60000",
  DELIVERY_MAX_ATTEMPTS: "5",
  DELIVERY_CONCURRENCY: "4",
  DELIVERY_WORKER: "off",
};
const configure = (overrides = {}) => {
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

/** A provider that records every message and does what `behave` says. */
const mockProvider = (behave = () => ({})) => {
  const calls = [];
  return {
    calls,
    async send(message) {
      calls.push(message);
      const r = await behave(message, calls.length);
      return { provider: "mock", providerMessageId: `mock-${crypto.randomUUID()}`, ...r };
    },
  };
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
  whatsapp = mockProvider();
  setDeliveryProviders({ email, whatsapp });
});

/** Officer, company and a managed draft drive; returns ids and the officer api. */
const draftDrive = async (extra = {}) => {
  const officer = await createUser("placement_officer", { name: "Officer N" });
  const O = api(officer.token);
  const company = await O.post("/placement/companies", { name: extra.companyName || "Acme Systems" });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  const created = await O.post("/placement/drives", {
    workflow: "managed",
    companyId: company.body.company._id,
    role: "Graduate Engineer",
    description: "Build and run services.",
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
  return { officer, O, driveId: created.body.drive._id };
};

const publish = (O, driveId) => O.patch(`/placement/drives/${driveId}/status`, { status: "open" });

/** A small cohort covering every eligibility and reachability case. */
const cohort = async () => {
  const optIn = (number) => ({ whatsapp: { optIn: true, number, consentAt: new Date() } });
  return {
    // Eligible, reachable on every channel.
    a: await createStudent({ branch: "CSE", cgpa: 8.2, phone: "98765 43210", ...optIn("+919876543210") }, { name: "Asha Rao" }),
    // Eligible; opted in with only a profile phone, typed loosely.
    b: await createStudent({ branch: "ISE", cgpa: 7.5, phone: "091234-56789", whatsapp: { optIn: true } }, { name: "Bilal K" }),
    // Eligible; no WhatsApp consent.
    c: await createStudent({ branch: "CSE", cgpa: 9.1, phone: "9988776655" }, { name: "Chen L" }),
    // Eligible; opted in but the number is not a number.
    d: await createStudent({ branch: "ISE", cgpa: 8.0, phone: "call me", whatsapp: { optIn: true } }, { name: "Divya S" }),
    // Eligible; opted in with no number at all.
    e: await createStudent({ branch: "CSE", cgpa: 7.9, whatsapp: { optIn: true } }, { name: "Eshan P" }),
    // Ineligible: CGPA, backlogs, branch.
    lowCgpa: await createStudent({ branch: "CSE", cgpa: 6.5, ...optIn("+919811111111") }),
    backlog: await createStudent({ branch: "CSE", cgpa: 8.5, backlogs: 2, ...optIn("+919822222222") }),
    mech: await createStudent({ branch: "ME", cgpa: 9.5, ...optIn("+919833333333") }),
  };
};

const ELIGIBLE = ["a", "b", "c", "d", "e"];

// ─── 1–7: publish, eligibility, all channels, links ─────────────────

test("publishing notifies only eligible students, in-app at once and email/WhatsApp in the background", async () => {
  const s = await cohort();
  const { O, driveId } = await draftDrive();

  // A draft notifies nobody on any channel.
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity" }), 0);
  assert.equal(await NotificationDelivery.countDocuments(), 0);

  const res = await publish(O, driveId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.notified, ELIGIBLE.length);
  // The publish request did not wait on any provider.
  assert.equal(email.calls.length + whatsapp.calls.length, 0);

  // In-app: eligible students only, with structured drive details.
  const inApp = await Notification.find({ type: "drive_opportunity" }).lean();
  assert.deepEqual(
    inApp.map((n) => String(n.userId)).sort(),
    ELIGIBLE.map((k) => String(s[k].user._id)).sort(),
  );
  const n = inApp[0];
  assert.equal(n.link, `/student/drives/${driveId}`);
  assert.equal(n.isRead, false);
  assert.equal(n.metadata.companyName, "Acme Systems");
  assert.equal(n.metadata.role, "Graduate Engineer");
  assert.ok(n.metadata.registrationDeadline);
  for (const k of ["lowCgpa", "backlog", "mech"]) {
    assert.equal(await Notification.countDocuments({ userId: s[k].user._id }), 0, `${k} must not be notified`);
    assert.equal(await NotificationDelivery.countDocuments({ userId: s[k].user._id }), 0, `${k} must not be queued`);
  }

  // Queued: one email per eligible student; WhatsApp only where reachable.
  assert.equal(await NotificationDelivery.countDocuments({ channel: "email", status: "pending" }), 5);
  const wa = await NotificationDelivery.find({ channel: "whatsapp" }).lean();
  const waBy = Object.fromEntries(wa.map((r) => [String(r.studentId), r]));
  assert.equal(waBy[s.a.student._id].status, "pending");
  assert.equal(waBy[s.b.student._id].status, "pending");
  assert.equal(waBy[s.c.student._id].skipReason, "no_consent");
  assert.equal(waBy[s.d.student._id].skipReason, "invalid_phone");
  assert.equal(waBy[s.e.student._id].skipReason, "no_phone");
  // Addresses are not stored, only a masked form.
  assert.equal(waBy[s.a.student._id].recipientMasked, "+91••••••3210");
  assert.equal(JSON.stringify(wa).includes("9876543210"), false);

  const run = await processDueDeliveries();
  assert.equal(run.sent, 7);

  // Email: every eligible student's registered address, full content.
  assert.deepEqual(email.calls.map((m) => m.to).sort(), ELIGIBLE.map((k) => s[k].user.email).sort());
  const mail = email.calls[0];
  const url = `${APP_URL}/student/drives/${driveId}`;
  assert.equal(mail.subject, "New Placement Opportunity – Acme Systems | Graduate Engineer");
  for (const part of ["Acme Systems", "Graduate Engineer", "₹8.5 LPA", "Mangaluru", "REGISTER NOW", url, "CGPA ≥ 7", "Build and run services."]) {
    assert.ok(mail.html.includes(part), `email html should contain ${part}`);
  }
  assert.ok(mail.text.includes(url));
  assert.match(mail.html, /Hello (Asha Rao|Bilal K|Chen L|Divya S|Eshan P),/);

  // WhatsApp: approved template, normalised numbers, link in body and button.
  assert.deepEqual(whatsapp.calls.map((m) => m.to).sort(), ["919123456789", "919876543210"]);
  const msg = whatsapp.calls.find((m) => m.to === "919876543210");
  assert.equal(msg.type, "template");
  assert.equal(msg.template.name, "placement_drive_alert");
  const params = msg.template.components[0].parameters.map((p) => p.text);
  assert.equal(params.length, 7);
  assert.deepEqual(params.slice(0, 5), ["Asha Rao", "Acme Systems", "Graduate Engineer", "₹8.5 LPA", "Mangaluru"]);
  assert.equal(params[6], url);
  assert.deepEqual(msg.template.components[1], {
    type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: driveId }],
  });

  const sent = await NotificationDelivery.find({ status: "sent" }).lean();
  assert.equal(sent.length, 7);
  assert.ok(sent.every((r) => r.providerMessageId && r.sentAt && r.attempts === 1));

  // Officer report: every figure from the stored rows.
  const summary = (await O.get(`/placement/drives/${driveId}/notifications/summary`)).body.summary;
  assert.equal(summary.eligible, 5);
  assert.equal(summary.inApp.created, 5);
  assert.equal(summary.email.succeeded, 5);
  assert.equal(summary.email.pending + summary.email.failed, 0);
  assert.equal(summary.whatsapp.succeeded, 2);
  assert.equal(summary.whatsapp.unreachable, 3);
  assert.deepEqual(summary.whatsapp.skippedBy, { no_consent: 1, invalid_phone: 1, no_phone: 1 });
  assert.equal(summary.config.mode, "live");
});

test("a student who stops being eligible before the worker runs is not messaged", async () => {
  const s = await cohort();
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  // Officer tightens the criteria: only CGPA ≥ 8.1 remains eligible (a, c).
  const r = await O.put(`/placement/drives/${driveId}/eligibility`, { minCgpa: 8.1, maxBacklogs: 0, branches: ["CSE", "ISE"] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await processDueDeliveries();
  assert.deepEqual(email.calls.map((m) => m.to).sort(), [s.a.user.email, s.c.user.email].sort());
  assert.equal(await NotificationDelivery.countDocuments({ channel: "email", skipReason: "no_longer_eligible" }), 3);
});

test("with the worker on, publishing starts delivery in the background on its own", async () => {
  configure({ DELIVERY_WORKER: "on" });
  try {
    await cohort();
    const { O, driveId } = await draftDrive();
    const res = await publish(O, driveId);
    assert.equal(res.status, 200);
    // Nobody called processDueDeliveries: the publish kicked the worker.
    await deliveryWorkerIdle();
    assert.equal(await NotificationDelivery.countDocuments({ status: "sent" }), 7);
    assert.equal(email.calls.length, 5);
  } finally {
    configure({ DELIVERY_WORKER: "off" });
  }
});

// ─── 8, 17: duplicates and concurrency ──────────────────────────────

test("repeated publication, recalculation and worker runs never send a second message", async () => {
  await cohort();
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  await processDueDeliveries();
  const firstEmail = email.calls.length;
  const firstWa = whatsapp.calls.length;
  assert.equal(firstEmail, 5);

  // Close and reopen registration: the defined policy is no re-notification.
  assert.equal((await O.patch(`/placement/drives/${driveId}/status`, { status: "registration_closed" })).status, 200);
  assert.equal((await publish(O, driveId)).status, 200);
  assert.equal((await O.post(`/placement/drives/${driveId}/eligibility/calculate`)).status, 200);
  // Even with notifiedAt cleared (an interrupted earlier run), the keys hold.
  await DriveCandidate.updateMany({ driveId }, { $unset: { notifiedAt: "" } });
  await notifyEligibleStudents(await Drive.findById(driveId));
  await processDueDeliveries();
  await processDueDeliveries();

  assert.equal(email.calls.length, firstEmail);
  assert.equal(whatsapp.calls.length, firstWa);
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity", "metadata.kind": "opportunity" }), 5);
  assert.equal(await NotificationDelivery.countDocuments({ channel: "email" }), 5);
});

test("concurrent publish requests and concurrent workers produce exactly one message per student per channel", async () => {
  await cohort();
  const { O, driveId } = await draftDrive();

  const results = await Promise.all(Array.from({ length: 6 }, () => publish(O, driveId)));
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.ok(results.filter((r) => r.status !== 200).every((r) => r.status === 409));

  // Concurrent recalculations while open.
  await Promise.all(Array.from({ length: 4 }, () => O.post(`/placement/drives/${driveId}/eligibility/calculate`)));
  // And direct concurrent notification passes.
  await DriveCandidate.updateMany({ driveId }, { $unset: { notifiedAt: "" } });
  const drive = await Drive.findById(driveId);
  await Promise.all([notifyEligibleStudents(drive), notifyEligibleStudents(drive), notifyEligibleStudents(drive)]);

  assert.equal(await Notification.countDocuments({ type: "drive_opportunity" }), 5);
  assert.equal(await NotificationDelivery.countDocuments({ channel: "email" }), 5);
  assert.equal(await NotificationDelivery.countDocuments({ channel: "whatsapp" }), 5);

  // Slow provider, three workers racing for the same rows.
  setDeliveryProviders({
    email: (email = mockProvider(() => new Promise((r) => setTimeout(() => r({}), 20)))),
    whatsapp,
  });
  await Promise.all([processDueDeliveries(), processDueDeliveries(), processDueDeliveries()]);
  assert.equal(email.calls.length, 5);
  assert.equal(new Set(email.calls.map((m) => m.to)).size, 5);
  assert.equal(whatsapp.calls.length, 2);
});

// ─── 9–11: retries and provider failures ────────────────────────────

test("a transient failure is retried after a backoff, then succeeds", async () => {
  const s = await cohort();
  setDeliveryProviders({
    email: (email = mockProvider((m, n) => {
      if (n === 1) throw new DeliveryError("ETIMEDOUT", "Connection timed out");
      return {};
    })),
    whatsapp,
  });
  const { O, driveId } = await draftDrive({ branches: ["CSE"], minCgpa: 8.1 }); // a and c
  await publish(O, driveId);

  await processDueDeliveries();
  const retrying = await NotificationDelivery.findOne({ channel: "email", status: "pending" }).lean();
  assert.ok(retrying, "the failed email is back in the queue");
  assert.equal(retrying.attempts, 1);
  assert.equal(retrying.lastError.code, "ETIMEDOUT");
  assert.ok(retrying.nextAttemptAt > new Date(Date.now() + 30000), "retry is scheduled with a backoff");

  // Not due yet: another run leaves it alone.
  await processDueDeliveries();
  assert.equal(email.calls.length, 2);

  await NotificationDelivery.updateOne({ _id: retrying._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await processDueDeliveries();
  assert.equal(email.calls.length, 3);
  const done = await NotificationDelivery.findById(retrying._id).lean();
  assert.equal(done.status, "sent");
  assert.equal(done.attempts, 2);
  assert.equal(done.lastError, undefined);
  assert.ok([s.a.user.email, s.c.user.email].includes(email.calls[2].to));
});

test("retries stop at the attempt limit, and permanent errors are not retried", async () => {
  await cohort();
  configure({ DELIVERY_BACKOFF_BASE_MS: "0", DELIVERY_MAX_ATTEMPTS: "3" });
  setDeliveryProviders({
    email: (email = mockProvider(() => {
      throw new DeliveryError("ECONNECTION", "Server unavailable");
    })),
    whatsapp: (whatsapp = mockProvider(() => {
      throw new DeliveryError("WA_131026", "Message undeliverable", { permanent: true });
    })),
  });
  const { O, driveId } = await draftDrive({ branches: ["CSE"], minCgpa: 9 }); // c only (no WhatsApp)
  await Student.updateOne({ cgpa: 9.1 }, { $set: { whatsapp: { optIn: true, number: "+919988776655" } } });
  await publish(O, driveId);

  await processDueDeliveries();
  await processDueDeliveries();
  const mail = await NotificationDelivery.findOne({ channel: "email" }).lean();
  assert.equal(mail.status, "failed");
  assert.equal(mail.attempts, 3);
  assert.equal(email.calls.length, 3, "exactly DELIVERY_MAX_ATTEMPTS tries");

  const wa = await NotificationDelivery.findOne({ channel: "whatsapp" }).lean();
  assert.equal(wa.status, "failed");
  assert.equal(wa.attempts, 1);
  assert.equal(wa.lastError.permanent, true);
  assert.equal(whatsapp.calls.length, 1);
});

test("an email outage does not affect WhatsApp or in-app notifications", async () => {
  await cohort();
  setDeliveryProviders({
    email: (email = mockProvider(() => {
      throw new DeliveryError("SMTP_550", "Mailbox unavailable", { permanent: true });
    })),
    whatsapp,
  });
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  await processDueDeliveries();
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity" }), 5);
  assert.equal(await NotificationDelivery.countDocuments({ channel: "email", status: "failed" }), 5);
  assert.equal(await NotificationDelivery.countDocuments({ channel: "whatsapp", status: "sent" }), 2);
});

test("real WhatsApp client against a fake Graph API: success, undeliverable, server error and rate limit", async () => {
  const received = [];
  const fake = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      received.push({ url: req.url, auth: req.headers.authorization, body });
      const reply = (status, json) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (body.to === "919876543210") return reply(200, { messages: [{ id: "wamid.OK1" }] });
      if (body.to === "919123456789") return reply(400, { error: { code: 131026, message: "Message undeliverable" } });
      if (body.to === "919988776655") return reply(500, { error: { code: 131000, message: "Something went wrong" } });
      return reply(429, { error: { code: 130429, message: "Rate limit hit" } });
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  try {
    configure({ WHATSAPP_API_BASE_URL: `http://127.0.0.1:${fake.address().port}` });
    setDeliveryProviders({ email }); // WhatsApp uses the real provider
    const s = await cohort();
    await Student.updateOne({ _id: s.c.student._id }, { $set: { whatsapp: { optIn: true, number: "+919988776655" } } });
    await Student.updateOne({ _id: s.d.student._id }, { $set: { whatsapp: { optIn: true, number: "+919900000001" } } });
    const { O, driveId } = await draftDrive();
    await publish(O, driveId);
    await processDueDeliveries();

    assert.ok(received.every((r) => r.url === "/v21.0/1234567890/messages" && r.auth === "Bearer test-token"));
    const by = Object.fromEntries(
      (await NotificationDelivery.find({ channel: "whatsapp" }).lean()).map((r) => [String(r.studentId), r]),
    );
    assert.equal(by[s.a.student._id].status, "sent");
    assert.equal(by[s.a.student._id].providerMessageId, "wamid.OK1");
    assert.equal(by[s.b.student._id].status, "failed");
    assert.equal(by[s.b.student._id].lastError.code, "WA_131026");
    assert.equal(by[s.c.student._id].status, "pending", "a 5xx is retried later");
    assert.equal(by[s.c.student._id].lastError.code, "WA_131000");
    assert.equal(by[s.d.student._id].status, "pending", "a rate limit is retried later");
    assert.ok(by[s.d.student._id].nextAttemptAt > new Date(Date.now() + 30000));
    // Emails were unaffected.
    assert.equal(email.calls.length, 5);
  } finally {
    await new Promise((r) => fake.close(r));
  }
});

test("the real SMTP provider reports an unreachable mail server as a retryable failure", async () => {
  configure({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "9", SMTP_USER: "u", SMTP_PASS: "p", NOTIFY_WHATSAPP_ENABLED: "false" });
  try {
    setDeliveryProviders({}); // real SMTP provider
    await createStudent({ branch: "CSE", cgpa: 8 });
    const { O, driveId } = await draftDrive();
    await publish(O, driveId);
    await processDueDeliveries();
    const row = await NotificationDelivery.findOne({ channel: "email" }).lean();
    assert.equal(row.status, "pending");
    assert.equal(row.lastError.permanent, false);
    assert.equal(await NotificationDelivery.countDocuments({ channel: "whatsapp" }), 0, "WhatsApp disabled: nothing queued");
  } finally {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  }
});

test("without credentials a live channel fails as 'not configured' and is never reported sent", async () => {
  configure({ WHATSAPP_ACCESS_TOKEN: undefined });
  setDeliveryProviders({}); // real providers, no SMTP, no WhatsApp token
  await cohort();
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  await processDueDeliveries();
  assert.equal(await NotificationDelivery.countDocuments({ status: "sent" }), 0);
  const failed = await NotificationDelivery.find({ status: "failed" }).lean();
  assert.equal(failed.length, 7);
  assert.ok(failed.every((r) => r.lastError.code === "CHANNEL_NOT_CONFIGURED"));
  const summary = (await O.get(`/placement/drives/${driveId}/notifications/summary`)).body.summary;
  assert.equal(summary.config.email.configured, false);
  assert.equal(summary.config.whatsapp.configured, false);
});

test("sandbox mode renders messages and records them as simulated, never as sent", async () => {
  configure({ NOTIFICATION_DELIVERY_MODE: "sandbox" });
  setDeliveryProviders({});
  await cohort();
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  const run = await processDueDeliveries();
  assert.equal(run.simulated, 7);
  assert.equal(run.sent, 0);
  assert.equal(await NotificationDelivery.countDocuments({ status: "sent" }), 0);
  const summary = (await O.get(`/placement/drives/${driveId}/notifications/summary`)).body.summary;
  assert.equal(summary.email.simulated, 5);
  assert.equal(summary.email.succeeded, 0);
});

test("a send interrupted by a crash is surfaced for the officer, not resent automatically", async () => {
  await createStudent({ branch: "CSE", cgpa: 8 });
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  await NotificationDelivery.updateOne(
    { channel: "email" },
    { $set: { status: "processing", lockedUntil: new Date(Date.now() - 1000), lockedBy: "dead-worker", attempts: 1 } },
  );
  await processDueDeliveries();
  const row = await NotificationDelivery.findOne({ channel: "email" }).lean();
  assert.equal(row.status, "failed");
  assert.equal(row.lastError.code, "INTERRUPTED");
  assert.equal(email.calls.length, 0);
});

// ─── Database faults at the worst moments ───────────────────────────

/** Make Model[method] throw while `when(args)` holds, `times` times. */
const injectFault = (Model, method, when, times = Infinity) => {
  const original = Model[method];
  let left = times;
  // Behaves like a Mongoose query (chainable) that fails when awaited.
  const failingQuery = () => {
    const q = {
      then: (resolve, reject) => Promise.reject(new Error("injected database fault")).then(resolve, reject),
    };
    for (const m of ["select", "lean", "sort", "limit", "skip", "populate"]) q[m] = () => q;
    return q;
  };
  Model[method] = function (...args) {
    if (left > 0 && when(...args)) {
      left--;
      return failingQuery();
    }
    return original.apply(this, args);
  };
  return () => {
    Model[method] = original;
  };
};
const recordsSent = (filter, update) => update?.$set?.status === "sent";

test("a database error after the provider accepted a message never causes a resend", async () => {
  await createStudent({ branch: "CSE", cgpa: 8 });
  configure({ NOTIFY_WHATSAPP_ENABLED: "false", DELIVERY_BACKOFF_BASE_MS: "0" });
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);

  // Recording "sent" fails once, then works: recorded, sent once.
  let restore = injectFault(NotificationDelivery, "updateOne", recordsSent, 1);
  try {
    await processDueDeliveries();
  } finally {
    restore();
  }
  assert.equal(email.calls.length, 1);
  assert.equal((await NotificationDelivery.findOne({ channel: "email" })).status, "sent");

  // Recording "sent" fails every time: the row is left for an officer, never re-sent.
  await NotificationDelivery.deleteMany({});
  await DriveCandidate.updateMany({ driveId }, { $unset: { notifiedAt: "" } });
  await Notification.deleteMany({});
  await notifyEligibleStudents(await Drive.findById(driveId));
  email.calls.length = 0;
  restore = injectFault(NotificationDelivery, "updateOne", recordsSent);
  try {
    await processDueDeliveries();
    await processDueDeliveries();
  } finally {
    restore();
  }
  assert.equal(email.calls.length, 1, "provider called exactly once");
  const row = await NotificationDelivery.findOne({ channel: "email" }).lean();
  assert.equal(row.status, "processing", "not re-queued");
  // After the lease it is surfaced, and still not re-sent.
  await NotificationDelivery.updateOne({ _id: row._id }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
  await processDueDeliveries();
  assert.equal((await NotificationDelivery.findById(row._id)).lastError.code, "INTERRUPTED");
  assert.equal(email.calls.length, 1);
});

test("a database error mid-batch releases the claimed rows instead of stranding them", async () => {
  await cohort();
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);

  const restore = injectFault(Student, "find", () => true, 1); // the batch prefetch fails once
  try {
    await processDueDeliveries();
  } finally {
    restore();
  }
  assert.equal(await NotificationDelivery.countDocuments({ status: "processing" }), 0, "nothing waits out the lease");
  const released = await NotificationDelivery.find({ status: "pending" }).lean();
  assert.ok(released.length > 0);
  assert.ok(released.every((r) => r.attempts === 0), "a released row has not used an attempt");

  await processDueDeliveries();
  assert.equal(email.calls.length, 5);
  assert.equal(new Set(email.calls.map((m) => m.to)).size, 5);
  assert.equal(whatsapp.calls.length, 2);
  assert.equal(await NotificationDelivery.countDocuments({ status: { $in: ["pending", "processing", "failed"] } }), 0);
});

// ─── 12–14: missing email, invalid phone, no consent ────────────────

test("missing email, deactivated accounts and unusable numbers are skipped with a reason", async () => {
  const s = await cohort();
  await User.collection.updateOne({ _id: s.a.user._id }, { $unset: { email: "" } });
  await User.updateOne({ _id: s.c.user._id }, { $set: { isActive: false } });
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  const reasons = Object.fromEntries(
    (await NotificationDelivery.find({ channel: "email" }).lean()).map((r) => [String(r.studentId), r.skipReason || r.status]),
  );
  assert.equal(reasons[s.a.student._id], "no_email");
  assert.equal(reasons[s.c.student._id], "account_inactive");
  assert.equal(reasons[s.b.student._id], "pending");

  // Consent withdrawn after queueing is respected at send time.
  await Student.updateOne({ _id: s.b.student._id }, { $set: { "whatsapp.optIn": false } });
  await processDueDeliveries();
  const b = await NotificationDelivery.findOne({ channel: "whatsapp", studentId: s.b.student._id }).lean();
  assert.equal(b.status, "skipped");
  assert.equal(b.skipReason, "no_consent");
  assert.deepEqual(whatsapp.calls.map((m) => m.to), ["919876543210"]);
});

test("phone numbers are normalised to E.164 and invalid ones rejected", () => {
  assert.equal(normalizePhone("98765 43210"), "+919876543210");
  assert.equal(normalizePhone("098765-43210"), "+919876543210");
  assert.equal(normalizePhone("0091 98765 43210"), "+919876543210");
  assert.equal(normalizePhone("+91 (98765) 43210"), "+919876543210");
  assert.equal(normalizePhone("919876543210"), "+919876543210");
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("+91 12345 67890"), null, "Indian mobiles start 6–9");
  assert.equal(normalizePhone("call me"), null);
  assert.equal(normalizePhone(""), null);
});

// ─── Officer retry ──────────────────────────────────────────────────

test("officer retry re-queues only failed messages and never resends delivered ones", async () => {
  const s = await cohort();
  let failEmail = true;
  const failing = new Set([s.a.user.email, s.b.user.email]);
  setDeliveryProviders({
    email: (email = mockProvider((m) => {
      // Two specific students fail permanently; the rest succeed.
      if (failEmail && failing.has(m.to)) {
        throw new DeliveryError("SMTP_550", "No such mailbox <x@y.z>", { permanent: true });
      }
      return {};
    })),
    whatsapp,
  });
  const { O, driveId, officer } = await draftDrive();
  await publish(O, driveId);
  await processDueDeliveries();
  const failedBefore = await NotificationDelivery.countDocuments({ channel: "email", status: "failed" });
  const sentBefore = await NotificationDelivery.countDocuments({ channel: "email", status: "sent" });
  assert.ok(failedBefore > 0 && sentBefore > 0, `${failedBefore} failed / ${sentBefore} sent`);
  const failedRow = await NotificationDelivery.findOne({ status: "failed" }).lean();
  assert.equal(failedRow.lastError.message.includes("@"), false, "provider text is redacted");

  // Students and faculty cannot retry or read the report.
  const student = await createStudent({ branch: "CSE", cgpa: 8 });
  const faculty = await createUser("faculty");
  for (const t of [student.token, faculty.token]) {
    assert.equal((await api(t).post(`/placement/drives/${driveId}/notifications/retry`, {})).status, 403);
    assert.equal((await api(t).get(`/placement/drives/${driveId}/notifications/summary`)).status, 403);
    assert.equal((await api(t).get(`/placement/drives/${driveId}/notifications/deliveries`)).status, 403);
  }
  assert.equal((await api().get(`/placement/drives/${driveId}/notifications/summary`)).status, 401);
  assert.equal((await O.post(`/placement/drives/${driveId}/notifications/retry`, { channel: "sms" })).status, 400);

  failEmail = false;
  const callsBefore = email.calls.length;
  const r = await O.post(`/placement/drives/${driveId}/notifications/retry`, { channel: "email" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.retried, failedBefore);
  await processDueDeliveries();
  assert.equal(email.calls.length - callsBefore, failedBefore, "only the failed ones were sent again");
  assert.equal(await NotificationDelivery.countDocuments({ channel: "email", status: "sent" }), 5);
  const retried = await NotificationDelivery.findById(failedRow._id).lean();
  assert.equal(retried.manualRetries, 1);

  const entry = await AuditLog.findOne({ action: "notification.retry" }).lean();
  assert.equal(String(entry.actor), String(officer.user._id));

  // A second retry finds nothing to resend.
  const again = await O.post(`/placement/drives/${driveId}/notifications/retry`, {});
  assert.equal(again.body.retried, 0);
  await processDueDeliveries();
  assert.equal(email.calls.length - callsBefore, failedBefore);

  // Channel-wise list: masked addresses, filterable.
  const list = await O.get(`/placement/drives/${driveId}/notifications/deliveries?channel=whatsapp&status=skipped`);
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 3);
  assert.ok(list.body.deliveries.every((d) => d.student.usn && !("recipient" in d)));

  // Closed registration: retry is refused.
  await O.patch(`/placement/drives/${driveId}/status`, { status: "registration_closed" });
  assert.equal((await O.post(`/placement/drives/${driveId}/notifications/retry`, {})).status, 409);
});

test("admins can read the report", async () => {
  await cohort();
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  const admin = await createUser("admin");
  assert.equal((await api(admin.token).get(`/placement/drives/${driveId}/notifications/summary`)).status, 200);
  assert.equal((await O.get(`/placement/drives/not-an-id/notifications/summary`)).status, 400);
});

// ─── Student notification centre and preferences ────────────────────

test("notification centre: own notifications only, paginated, read and unread persist", async () => {
  const me = await createStudent({ branch: "CSE", cgpa: 8 });
  const other = await createStudent({ branch: "CSE", cgpa: 8 });
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  for (let i = 0; i < 4; i++) {
    await Notification.create({ userId: me.user._id, type: "system", title: `Old ${i}`, body: "x" });
  }
  const M = api(me.token);

  // The bell's existing call is unchanged.
  const bell = await M.get("/notifications");
  assert.equal(bell.status, 200);
  assert.equal(bell.body.notifications.length, 5);
  assert.equal(bell.body.unread, 5);
  assert.equal(bell.body.total, undefined);

  const page1 = await M.get("/notifications?page=1&limit=3");
  assert.equal(page1.body.total, 5);
  assert.equal(page1.body.notifications.length, 3);
  const page2 = await M.get("/notifications?page=2&limit=3");
  assert.equal(page2.body.notifications.length, 2);

  const drive = [...page1.body.notifications, ...page2.body.notifications].find((n) => n.type === "drive_opportunity");
  assert.equal(drive.link, `/student/drives/${driveId}`);
  assert.equal(drive.metadata.companyName, "Acme Systems");

  // Another student cannot touch it.
  await api(other.token).patch("/notifications/read", { ids: [drive._id] });
  await api(other.token).patch("/notifications/unread", { ids: [drive._id] });
  assert.equal((await api(other.token).del(`/notifications/${drive._id}`)).status, 404);
  assert.equal((await Notification.findById(drive._id)).isRead, false);

  let r = await M.patch("/notifications/read", { ids: [drive._id] });
  assert.equal(r.body.unread, 4);
  assert.equal((await M.get("/notifications?status=unread")).body.total, 4);
  assert.equal((await M.get("/notifications?status=read")).body.notifications[0]._id, drive._id);
  r = await M.patch("/notifications/unread", { ids: [drive._id] });
  assert.equal(r.body.unread, 5);
  // Persisted across sessions: a fresh token sees the same state.
  assert.equal((await M.get("/notifications/unread")).body.unread, 5);

  assert.equal((await M.patch("/notifications/read", { ids: "x" })).status, 400);
  assert.equal((await M.patch("/notifications/read", { ids: ["not-an-id"] })).status, 400);
  assert.equal((await M.get("/notifications?status=bogus")).status, 400);
  assert.equal((await api().get("/notifications")).status, 401);
  r = await M.patch("/notifications/read", {});
  assert.equal(r.body.unread, 0);
});

test("WhatsApp consent: opt-in needs a valid number, is stored normalised, and can be withdrawn", async () => {
  const me = await createStudent({ branch: "CSE", cgpa: 8, phone: "" });
  const M = api(me.token);
  let r = await M.get("/student/notification-preferences");
  assert.equal(r.status, 200);
  assert.equal(r.body.whatsapp.optIn, false);
  assert.ok(r.body.whatsapp.consentText.includes("STOP"));

  assert.equal((await M.put("/student/notification-preferences", { whatsappOptIn: true })).status, 400);
  assert.equal((await M.put("/student/notification-preferences", { whatsappOptIn: true, whatsappNumber: "12" })).status, 400);
  assert.equal((await M.put("/student/notification-preferences", { whatsappOptIn: "yes" })).status, 400);

  r = await M.put("/student/notification-preferences", { whatsappOptIn: true, whatsappNumber: "98765 43210" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  let s = await Student.findById(me.student._id).lean();
  assert.equal(s.whatsapp.number, "+919876543210");
  assert.equal(s.whatsapp.optIn, true);
  assert.ok(s.whatsapp.consentAt);
  assert.ok(s.whatsapp.consentVersion);

  r = await M.put("/student/notification-preferences", { whatsappOptIn: false });
  s = await Student.findById(me.student._id).lean();
  assert.equal(s.whatsapp.optIn, false);
  assert.ok(s.whatsapp.optOutAt);

  const officer = await createUser("placement_officer");
  assert.equal((await api(officer.token).get("/student/notification-preferences")).status, 403);
});

// ─── Webhooks ───────────────────────────────────────────────────────

const signedPost = (body, secret = WA_SECRET) => {
  const raw = JSON.stringify(body);
  const sig = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  return fetch(`${baseUrlForTests()}/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
    body: raw,
  });
};

test("WhatsApp webhooks: verified handshake, signed status updates, STOP opt-out", async () => {
  const s = await cohort();
  const { O, driveId } = await draftDrive();
  await publish(O, driveId);
  await processDueDeliveries();
  const row = await NotificationDelivery.findOne({ channel: "whatsapp", studentId: s.a.student._id }).lean();

  const verify = (token) =>
    fetch(`${baseUrlForTests()}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=abc123`);
  assert.equal((await verify("wrong")).status, 403);
  const ok = await verify(WA_VERIFY);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "abc123");

  const statusBody = (status, extra = {}) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { statuses: [{ id: row.providerMessageId, status, timestamp: "1767225600", ...extra }] } }] }],
  });

  // Unsigned or wrongly signed callbacks change nothing.
  const unsigned = await fetch(`${baseUrlForTests()}/webhooks/whatsapp`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(statusBody("read")),
  });
  assert.equal(unsigned.status, 401);
  assert.equal((await signedPost(statusBody("read"), "not-the-secret")).status, 401);
  assert.equal((await NotificationDelivery.findById(row._id)).status, "sent");

  assert.equal((await signedPost(statusBody("delivered"))).status, 200);
  assert.equal((await NotificationDelivery.findById(row._id)).status, "delivered");
  assert.equal((await signedPost(statusBody("read"))).status, 200);
  // A late "delivered" or "failed" never moves it backwards.
  await signedPost(statusBody("delivered"));
  await signedPost(statusBody("failed", { errors: [{ code: 131026, title: "Undeliverable" }] }));
  const final = await NotificationDelivery.findById(row._id).lean();
  assert.equal(final.status, "read");
  assert.ok(final.deliveredAt && final.readAt);

  const summary = (await O.get(`/placement/drives/${driveId}/notifications/summary`)).body.summary;
  assert.equal(summary.whatsapp.read, 1);
  assert.equal(summary.whatsapp.succeeded, 2);

  const stop = await signedPost({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messages: [{ from: "919876543210", type: "text", text: { body: "STOP" } }] } }] }],
  });
  assert.equal(stop.status, 200);
  const a = await Student.findById(s.a.student._id).lean();
  assert.equal(a.whatsapp.optIn, false);
  assert.equal(a.whatsapp.consentSource, "whatsapp_reply");

  configure({ WHATSAPP_APP_SECRET: undefined });
  assert.equal((await signedPost(statusBody("read"))).status, 503, "no secret configured: nothing accepted");
});

// ─── Templates and configuration ────────────────────────────────────

test("email content is escaped and only http(s) links are used", () => {
  const facts = opportunityFacts({
    drive: {
      companyName: `<script>alert("x")</script> & Co`,
      role: "Dev\"ops",
      description: "<img src=x onerror=alert(1)>",
      registrationDeadline: days(3),
      ctc: 0,
    },
    criteria: ["CGPA ≥ 7"],
    registrationUrl: "https://careercore.example.edu/student/drives/abc",
    timeZone: "Asia/Kolkata",
  });
  const { html, text, subject } = renderOpportunityEmail({ studentName: "<b>Ann</b>", facts });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Hello &lt;b&gt;Ann&lt;/b&gt;,"));
  assert.ok(!html.includes(">Package<"), "no package row when CTC is unknown");
  assert.ok(text.includes("https://careercore.example.edu/student/drives/abc"));
  assert.ok(subject.startsWith("New Placement Opportunity – "));

  const bad = opportunityFacts({ drive: { companyName: "X", role: "Y" }, registrationUrl: "javascript:alert(1)" });
  assert.equal(bad.registrationUrl, "");
  assert.equal(redact("550 <kiran@example.com> unknown, +91 98765 43210"), "550 <[address]> unknown, [number]");
});

test("production refuses WhatsApp switched on without its credentials", () => {
  const good = {
    JWT_SECRET: "x".repeat(40),
    MONGO_URI: "mongodb+srv://u:p@c.mongodb.net/db",
    CLIENT_URL: "https://careercore.example.edu",
  };
  assert.deepEqual(productionEnvProblems(good), []);
  assert.equal(productionEnvProblems({ ...good, NOTIFY_WHATSAPP_ENABLED: "true" }).length, 5);
  assert.equal(productionEnvProblems({ ...good, NOTIFICATION_DELIVERY_MODE: "loud" }).length, 1);
  assert.equal(productionEnvProblems({ ...good, PUBLIC_APP_URL: "http://localhost:5173" }).length, 1);
});

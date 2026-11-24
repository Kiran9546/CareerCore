import "./env.js";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown, reset, createUser, createStudents, api, days } from "./helpers.js";
import Notification from "../models/Notification.js";
import NotificationDelivery from "../models/NotificationDelivery.js";
import Student from "../models/Student.js";
import {
  setDeliveryProviders,
  processDueDeliveries,
  resetDeliveryPauses,
  kickDeliveryWorker,
  deliveryWorkerIdle,
  stopDeliveryLoops,
} from "../services/notificationDeliveryService.js";
import { DeliveryError } from "../services/delivery/providers.js";

/**
 * Load: many students, several drives published at the same moment by
 * different officers, providers with real-world latency, and several worker
 * processes draining the queue at once. Every student must get exactly one
 * message per drive per channel — no losses, no duplicates — and the
 * publish requests must not slow down with provider latency.
 *
 * Sizes are kept to what the in-memory database handles in CI; SCALE_STUDENTS
 * raises them for a manual run.
 */

const STUDENTS = Number(process.env.SCALE_STUDENTS) || 3000;
const DRIVES = [
  { company: "Northwind Labs", branches: ["CSE", "ISE"], minCgpa: 7 },
  { company: "Contoso Systems", branches: ["CSE", "ISE", "ECE"], minCgpa: 6 },
  { company: "Fabrikam Tech", branches: ["ISE", "ECE", "EEE"], minCgpa: 8 },
];
const BRANCHES = ["CSE", "ISE", "ECE", "EEE", "ME"];

const env = {
  NOTIFICATION_DELIVERY_MODE: "live",
  NOTIFY_EMAIL_ENABLED: "true",
  NOTIFY_WHATSAPP_ENABLED: "true",
  PUBLIC_APP_URL: "https://careercore.example.edu",
  WHATSAPP_ACCESS_TOKEN: "t",
  WHATSAPP_PHONE_NUMBER_ID: "1",
  WHATSAPP_TEMPLATE_NAME: "placement_drive_alert",
  DELIVERY_WORKER: "off",
  DELIVERY_BACKOFF_BASE_MS: "0",
  DELIVERY_CONCURRENCY: "8",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A provider with latency that records (recipient, drive) for each send. */
const latencyProvider = (channel, latencyMs, { fail } = {}) => {
  const sent = [];
  let inFlight = 0;
  let peak = 0;
  return {
    sent,
    peak: () => peak,
    async send(msg) {
      inFlight++;
      peak = Math.max(peak, inFlight);
      try {
        await sleep(typeof latencyMs === "function" ? latencyMs() : latencyMs);
        if (fail?.(msg)) throw new DeliveryError("TEMP", "temporary", {});
        const driveId =
          channel === "email"
            ? msg.text.match(/\/student\/drives\/([a-f0-9]{24})/)[1]
            : msg.template.components[1].parameters[0].text;
        sent.push({ to: msg.to, driveId, at: Date.now() });
        return { provider: "mock", providerMessageId: `${channel}-${sent.length}-${Math.random()}` };
      } finally {
        inFlight--;
      }
    },
  };
};

/** Run N worker "processes" until the queue is empty; returns elapsed ms. */
const drain = async (workers) => {
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const r = await processDueDeliveries();
        if (!r.processed && !(await NotificationDelivery.exists({ status: { $in: ["pending", "processing"] } }))) return;
      }
    }),
  );
  return Date.now() - t0;
};

before(setup);
after(async () => {
  setDeliveryProviders({});
  await teardown();
});
beforeEach(async () => {
  await reset();
  Object.assign(process.env, env);
  resetDeliveryPauses();
});

const buildCohort = async () => {
  const rows = Array.from({ length: STUDENTS }, (_, i) => ({
    branch: BRANCHES[i % BRANCHES.length],
    cgpa: 5.5 + (i % 45) / 10, // 5.5 … 9.9
    usn: `4MT22LD${String(i).padStart(5, "0")}`,
    name: `Load Student ${i}`,
  }));
  const cohort = await createStudents(rows);
  // Two in three students opt in to WhatsApp, each with a distinct number.
  await Student.bulkWrite(
    cohort
      .filter((_, i) => i % 3 !== 0)
      .map((c, i) => ({
        updateOne: {
          filter: { _id: c.student._id },
          update: { $set: { whatsapp: { optIn: true, number: `+9198${String(i).padStart(8, "0")}`, consentAt: new Date() } } },
        },
      })),
  );
  return { rows, cohort };
};

const expectedEligible = (rows, d) =>
  rows.map((r, i) => (d.branches.includes(r.branch) && r.cgpa >= d.minCgpa ? i : -1)).filter((i) => i >= 0);

test(`${STUDENTS} students × ${DRIVES.length} drives published at once: every message exactly once`, { timeout: 600000 }, async () => {
  const { rows, cohort } = await buildCohort();

  // Three officers create their drives.
  const created = [];
  for (const d of DRIVES) {
    const officer = await createUser("placement_officer");
    const O = api(officer.token);
    const company = await O.post("/placement/companies", { name: d.company });
    const drive = await O.post("/placement/drives", {
      workflow: "managed",
      companyId: company.body.company._id,
      role: "Engineer",
      driveDate: days(10).toISOString(),
      registrationDeadline: days(5).toISOString(),
      minCgpa: d.minCgpa,
      maxBacklogs: 0,
      branches: d.branches,
    });
    assert.equal(drive.status, 201, JSON.stringify(drive.body));
    created.push({ O, id: drive.body.drive._id, spec: d });
  }

  // Slow providers: a publish must not wait on them.
  const email = latencyProvider("email", () => 20 + Math.random() * 20);
  const whatsapp = latencyProvider("whatsapp", () => 40 + Math.random() * 40);
  setDeliveryProviders({ email, whatsapp });

  // All three published at the same instant.
  const t0 = Date.now();
  const published = await Promise.all(
    created.map(async (c) => {
      const s = Date.now();
      const r = await c.O.patch(`/placement/drives/${c.id}/status`, { status: "open" });
      return { ...c, r, ms: Date.now() - s };
    }),
  );
  const publishMs = Date.now() - t0;
  for (const p of published) assert.equal(p.r.status, 200, JSON.stringify(p.r.body));
  assert.equal(email.sent.length + whatsapp.sent.length, 0, "publish requests did not call any provider");

  // In-app: exactly the eligible students, per drive.
  let totalEligible = 0;
  const expectedWa = new Set();
  const expectedEmail = new Set();
  for (const p of published) {
    const eligible = expectedEligible(rows, p.spec);
    totalEligible += eligible.length;
    assert.equal(p.r.body.notified, eligible.length, `${p.spec.company} notified`);
    for (const i of eligible) {
      expectedEmail.add(`${cohort[i].user.email}|${p.id}`);
      if (i % 3 !== 0) expectedWa.add(`${p.id}|${i}`);
    }
  }
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity" }), totalEligible);

  // Three worker processes drain the queue concurrently.
  const drainMs = await drain(3);

  const keys = (list) => list.map((m) => `${m.to}|${m.driveId}`);
  const emailKeys = keys(email.sent);
  assert.equal(new Set(emailKeys).size, emailKeys.length, "no duplicate email");
  assert.deepEqual(new Set(emailKeys), expectedEmail, "every eligible student emailed for every drive");
  const waKeys = keys(whatsapp.sent);
  assert.equal(new Set(waKeys).size, waKeys.length, "no duplicate WhatsApp");
  assert.equal(waKeys.length, expectedWa.size, "every opted-in eligible student messaged on WhatsApp");
  assert.equal(await NotificationDelivery.countDocuments({ status: { $in: ["pending", "processing", "failed"] } }), 0);

  // Per-student state is right under concurrent reads: a student eligible
  // for all three drives has three unread notifications.
  const everywhere = rows.findIndex((r) => r.branch === "ISE" && r.cgpa >= 8);
  const sample = cohort.slice(0, 200);
  const counts = await Promise.all(sample.map((c) => api(c.token).get("/notifications/unread")));
  for (const [k, c] of counts.entries()) {
    const expected = DRIVES.filter((d) => expectedEligible(rows, d).includes(k)).length;
    assert.equal(c.body.unread, expected, `student ${k}`);
  }
  assert.equal((await api(cohort[everywhere].token).get("/notifications/unread")).body.unread, 3);

  const messages = email.sent.length + whatsapp.sent.length;
  console.log(
    `[scale] ${STUDENTS} students, ${DRIVES.length} drives, ${totalEligible} in-app, ${email.sent.length} email + ${whatsapp.sent.length} WhatsApp\n` +
      `[scale] concurrent publish: ${publishMs} ms total (${published.map((p) => p.ms).join(" / ")} ms each)\n` +
      `[scale] delivery: ${drainMs} ms, ${Math.round((messages / drainMs) * 1000)} messages/s, peak in-flight email ${email.peak()} / WhatsApp ${whatsapp.peak()}`,
  );
});

test("a slow or failing channel does not hold up the other one", { timeout: 300000 }, async () => {
  const { cohort } = await buildCohort();
  const officer = await createUser("placement_officer");
  const O = api(officer.token);
  const company = await O.post("/placement/companies", { name: "Isolation Inc" });
  const drive = await O.post("/placement/drives", {
    workflow: "managed",
    companyId: company.body.company._id,
    role: "Engineer",
    driveDate: days(10).toISOString(),
    registrationDeadline: days(5).toISOString(),
    minCgpa: 0,
    maxBacklogs: 0,
    branches: BRANCHES,
  });
  assert.equal(drive.status, 201);

  // WhatsApp is ten times slower than email and fails transiently a third of the time.
  const email = latencyProvider("email", 10);
  let n = 0;
  const whatsapp = latencyProvider("whatsapp", 100, { fail: () => ++n % 3 === 0 });
  setDeliveryProviders({ email, whatsapp });
  process.env.DELIVERY_MAX_ATTEMPTS = "10";
  // The production path: publishing kicks the per-channel background loops.
  process.env.DELIVERY_WORKER = "on";

  try {
    assert.equal((await O.patch(`/placement/drives/${drive.body.drive._id}/status`, { status: "open" })).status, 200);
    const deadline = Date.now() + 150000;
    while (await NotificationDelivery.exists({ status: { $in: ["pending", "processing"] } })) {
      if (Date.now() > deadline) {
        const stuck = await NotificationDelivery.find({ status: { $in: ["pending", "processing"] } })
          .select("channel status attempts nextAttemptAt lockedBy lockedUntil lastError")
          .limit(5)
          .lean();
        const byStatus = await NotificationDelivery.aggregate([{ $group: { _id: { c: "$channel", s: "$status" }, n: { $sum: 1 } } }]);
        assert.fail(`queue did not drain: ${JSON.stringify(byStatus)} sample ${JSON.stringify(stuck)}`);
      }
      await deliveryWorkerIdle();
      kickDeliveryWorker(); // what the 30 s poll would do
      await sleep(20);
    }
    await deliveryWorkerIdle();
  } finally {
    process.env.DELIVERY_WORKER = "off";
  }

  assert.equal(email.sent.length, cohort.length);
  assert.equal(new Set(whatsapp.sent.map((m) => m.to)).size, whatsapp.sent.length, "retries never duplicate");
  assert.equal(whatsapp.sent.length, cohort.filter((_, i) => i % 3 !== 0).length);
  const lastEmail = Math.max(...email.sent.map((m) => m.at));
  const lastWa = Math.max(...whatsapp.sent.map((m) => m.at));
  const firstAt = Math.min(...email.sent.map((m) => m.at), ...whatsapp.sent.map((m) => m.at));
  console.log(`[scale] isolation: email done after ${lastEmail - firstAt} ms, WhatsApp after ${lastWa - firstAt} ms`);
  // Email finishes in well under half the time the slow channel needs.
  assert.ok(lastEmail - firstAt < (lastWa - firstAt) / 2, "email was not held back by WhatsApp");
});

test("shutdown mid-backlog: in-flight sends are recorded, the rest stay queued, nothing is lost or doubled", { timeout: 300000 }, async () => {
  await buildCohort();
  const officer = await createUser("placement_officer");
  const O = api(officer.token);
  const company = await O.post("/placement/companies", { name: "Shutdown Ltd" });
  const drive = await O.post("/placement/drives", {
    workflow: "managed",
    companyId: company.body.company._id,
    role: "Engineer",
    driveDate: days(10).toISOString(),
    registrationDeadline: days(5).toISOString(),
    minCgpa: 0,
    maxBacklogs: 0,
    branches: BRANCHES,
  });
  const email = latencyProvider("email", 30);
  const whatsapp = latencyProvider("whatsapp", 30);
  setDeliveryProviders({ email, whatsapp });
  process.env.DELIVERY_WORKER = "on";
  try {
    assert.equal((await O.patch(`/placement/drives/${drive.body.drive._id}/status`, { status: "open" })).status, 200);
    await sleep(500);
    await stopDeliveryLoops(); // SIGTERM during a deploy
  } finally {
    process.env.DELIVERY_WORKER = "off";
  }
  const sentBefore = email.sent.length + whatsapp.sent.length;
  assert.ok(sentBefore > 0, "some messages went out before the shutdown");
  assert.equal(await NotificationDelivery.countDocuments({ status: "processing" }), 0, "no send left in limbo");
  assert.equal(await NotificationDelivery.countDocuments({ status: "sent" }), sentBefore);
  assert.ok(await NotificationDelivery.exists({ status: "pending" }), "the remainder is still queued");

  // "Restart": a new process picks up exactly the remainder.
  resetDeliveryPauses();
  await drain(2);
  const all = [...email.sent, ...whatsapp.sent].map((m) => `${m.to}|${m.driveId}`);
  assert.equal(new Set(all).size, all.length, "no duplicates across the restart");
  assert.equal(await NotificationDelivery.countDocuments({ status: "sent" }), all.length);
  assert.equal(await NotificationDelivery.countDocuments({ status: { $nin: ["sent", "skipped"] } }), 0);
  console.log(`[scale] shutdown: ${sentBefore} sent before stop, ${all.length - sentBefore} after restart, 0 duplicates`);
});

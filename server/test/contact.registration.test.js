import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { setup, teardown, reset, createUser, api, days, baseUrlForTests } from "./helpers.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Notification from "../models/Notification.js";
import NotificationDelivery from "../models/NotificationDelivery.js";
import {
  setDeliveryProviders,
  processDueDeliveries,
  resetDeliveryPauses,
  releaseCredentialHolds,
} from "../services/notificationDeliveryService.js";
import { DeliveryError } from "../services/delivery/providers.js";

/**
 * Every student supported automatically: contact details collected at
 * sign-up, verified by the student, stored on their account, and used for
 * every drive — including drives published before they joined. Providers
 * are mocks (or the real WhatsApp client against a fake Graph API); nothing
 * here can reach a real inbox or phone.
 */

const APP_URL = "https://careercore.example.edu";
const OTP_TEMPLATE = "careercore_verification";
const ALERT_TEMPLATE = "placement_drive_alert";

const BASE_ENV = {
  NOTIFICATION_DELIVERY_MODE: "live",
  NOTIFY_EMAIL_ENABLED: "true",
  NOTIFY_WHATSAPP_ENABLED: "true",
  NOTIFY_EMAIL_REQUIRE_VERIFIED: undefined,
  PUBLIC_APP_URL: APP_URL,
  WHATSAPP_ACCESS_TOKEN: "test-token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_TEMPLATE_NAME: ALERT_TEMPLATE,
  WHATSAPP_OTP_TEMPLATE_NAME: OTP_TEMPLATE,
  WHATSAPP_API_BASE_URL: undefined,
  WHATSAPP_APP_SECRET: "test-app-secret",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "t",
  DELIVERY_WORKER: "off",
  DELIVERY_BACKOFF_BASE_MS: "60000",
};
const configure = (overrides = {}) => {
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

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

let email;
let whatsapp;
before(setup);
after(async () => {
  setDeliveryProviders({});
  await teardown();
});
beforeEach(async () => {
  await reset();
  configure();
  resetDeliveryPauses();
  email = mockProvider();
  whatsapp = mockProvider();
  setDeliveryProviders({ email, whatsapp });
});

// ─── Helpers that act exactly as a student or officer would ─────────

let n = 0;
const register = (body = {}) => {
  n++;
  return api().post("/auth/register", {
    name: `New Student ${n}`,
    email: `new${n}@gmail.com`,
    password: "Password123!",
    role: "student",
    ...body,
  });
};
let usnSeq = 0;
const createProfile = (token, academic = {}) =>
  api(token).post("/student/profile", { usn: `4MT23IS${String(++usnSeq).padStart(3, "0")}`, batch: "2026", branch: "ISE", cgpa: 8.2, backlogs: 0, ...academic });
/** Notification metadata stores ObjectIds; compare with one. */
const oid = (id) => new mongoose.Types.ObjectId(String(id));

const alerts = () => whatsapp.calls.filter((m) => m.template.name === ALERT_TEMPLATE);
const codes = () => whatsapp.calls.filter((m) => m.template.name === OTP_TEMPLATE);
const lastCodeTo = (digits) => [...codes()].reverse().find((m) => m.to === digits)?.template.components[0].parameters[0].text;
const verificationLinkTo = (address) => {
  const m = [...email.calls].reverse().find((x) => x.to === address && /Verify your email/.test(x.subject));
  return m?.text.match(/verify-email\?token=([a-f0-9]{64})/)?.[1];
};
const driveEmailsTo = (address) => email.calls.filter((m) => m.to === address && /New Placement Opportunity/.test(m.subject));

const openDrive = async ({ companyName = "Acme Systems", branches = ["ISE", "CSE"], minCgpa = 7, status = "open" } = {}) => {
  const officer = await createUser("placement_officer");
  const O = api(officer.token);
  const company = await O.post("/placement/companies", { name: `${companyName} ${crypto.randomUUID().slice(0, 4)}` });
  const d = await O.post("/placement/drives", {
    workflow: "managed",
    companyId: company.body.company._id,
    role: "Graduate Engineer",
    driveDate: days(14).toISOString(),
    registrationDeadline: days(7).toISOString(),
    minCgpa,
    maxBacklogs: 0,
    branches,
  });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const id = d.body.drive._id;
  if (status !== "draft") assert.equal((await O.patch(`/placement/drives/${id}/status`, { status: "open" })).status, 200);
  if (status === "registration_closed") await O.patch(`/placement/drives/${id}/status`, { status: "registration_closed" });
  return { O, id };
};

// ─── Registration: collected, validated, stored, verification started ──

test("student sign-up collects and stores email, E.164 mobile and WhatsApp consent, and starts both verifications", async () => {
  const r = await register({ email: "Asha.Rao@Gmail.com", phone: "098765 43210", whatsappConsent: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.token);

  const user = await User.findById(r.body.user._id).lean();
  assert.equal(user.email, "asha.rao@gmail.com");
  assert.equal(user.phone, "+919876543210", "normalised to E.164");
  assert.equal(user.phoneVerifiedAt, undefined, "a typed number is never treated as verified");
  assert.equal(user.emailVerifiedAt, undefined);
  assert.equal(user.whatsapp.optIn, true, "their consent is recorded");
  assert.equal(user.whatsapp.consentSource, "registration");
  assert.ok(user.whatsapp.consentAt && user.whatsapp.consentVersion);

  // A verification link to the registered address, and a code to the number.
  assert.ok(verificationLinkTo("asha.rao@gmail.com"), "verification email sent");
  assert.ok(lastCodeTo("919876543210"), "WhatsApp code sent");
  assert.equal(r.body.verification.whatsapp.sentTo, "+91••••••3210");
  // Live mode: the code is never in the response.
  assert.equal(r.body.verification.whatsapp.devCode, undefined);
  // Hashes only, never returned.
  assert.equal(JSON.stringify(r.body.user).includes("Verification"), false);
});

test("sign-up validation: email, phone, consent; staff and older clients without a phone still work", async () => {
  assert.equal((await register({ email: "not-an-email" })).status, 400);
  assert.match((await register({ phone: "12345" })).body.message, /valid mobile number/);
  assert.match((await register({ phone: "call me" })).body.message, /valid mobile number/);
  assert.match((await register({ whatsappConsent: true })).body.message, /mobile number/);
  assert.equal((await register({ phone: "9876543210", whatsappConsent: "yes" })).status, 400);

  // Without consent: number stored, no WhatsApp code sent.
  const r = await register({ phone: "+44 7700 900123", whatsappConsent: false });
  assert.equal(r.status, 201);
  assert.equal((await User.findById(r.body.user._id)).phone, "+447700900123");
  assert.equal(codes().length, 0);

  // Existing API contract: a student may still register without a phone.
  assert.equal((await register({})).status, 201);
  const staff = await api().post("/auth/register", { name: "PO", email: "po@x.local", password: "Password123!", role: "placement_officer" });
  assert.equal(staff.status, 201);

  // No duplicate accounts.
  assert.equal((await register({ email: "dup@gmail.com" })).status, 201);
  assert.equal((await register({ email: "DUP@gmail.com" })).status, 409);
});

// ─── Email verification ─────────────────────────────────────────────

test("email verification: single-use link, invalid and expired links refused, resend limited", async () => {
  const r = await register({ email: "verify.me@gmail.com" });
  const token = verificationLinkTo("verify.me@gmail.com");
  assert.ok(token);
  const link = email.calls.at(-1).text;
  assert.ok(link.includes(`${APP_URL}/verify-email?token=`), "link points at the website");

  assert.equal((await api().post("/auth/email/verify", { token: "x".repeat(64) })).status, 400);
  assert.equal((await api().post("/auth/email/verify", { token: "0".repeat(64) })).status, 400);
  const ok = await api().post("/auth/email/verify", { token });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok((await User.findById(r.body.user._id)).emailVerifiedAt);
  assert.equal((await api().post("/auth/email/verify", { token })).status, 400, "single use");

  const S = api(r.body.token);
  assert.equal((await S.post("/auth/email/resend")).body.alreadyVerified, true);

  // Expired link.
  const r2 = await register({ email: "late@gmail.com" });
  const t2 = verificationLinkTo("late@gmail.com");
  await User.updateOne({ _id: r2.body.user._id }, { $set: { "emailVerification.expiresAt": new Date(Date.now() - 1000) } });
  assert.match((await api().post("/auth/email/verify", { token: t2 })).body.message, /expired/);

  // Resend: not more than once a minute.
  assert.equal((await api(r2.body.token).post("/auth/email/resend")).status, 429);
  await User.updateOne({ _id: r2.body.user._id }, { $set: { "emailVerification.sentAt": new Date(Date.now() - 120000) } });
  assert.equal((await api(r2.body.token).post("/auth/email/resend")).status, 200);
  assert.ok(verificationLinkTo("late@gmail.com") !== t2, "a fresh link");
});

// ─── WhatsApp verification and consent ──────────────────────────────

test("WhatsApp verification: consent required, wrong and expired codes refused, attempts and sends limited", async () => {
  const r = await register({ phone: "91234 56789" });
  const S = api(r.body.token);

  assert.equal((await S.post("/auth/phone/send-code", { phone: "91234 56789" })).status, 400, "no consent, no code");
  assert.equal((await S.post("/auth/phone/send-code", { phone: "123", consent: true })).status, 400);
  assert.equal((await S.post("/auth/phone/verify", { code: "123456" })).status, 400, "nothing requested yet");

  assert.equal((await S.post("/auth/phone/send-code", { phone: "91234 56789", consent: true })).status, 200);
  assert.equal((await S.post("/auth/phone/send-code", { phone: "91234 56789", consent: true })).status, 429, "one a minute");
  const code = lastCodeTo("919123456789");
  assert.match(code, /^\d{6}$/);
  // The authentication template carries the code in the body and the copy button.
  const otp = codes().at(-1);
  assert.equal(otp.template.components[1].parameters[0].text, code);

  const wrong = code === "000000" ? "111111" : "000000";
  const w = await S.post("/auth/phone/verify", { code: wrong });
  assert.equal(w.status, 400);
  assert.match(w.body.message, /4 attempts left/);
  for (let i = 0; i < 4; i++) await S.post("/auth/phone/verify", { code: wrong });
  assert.equal((await S.post("/auth/phone/verify", { code })).status, 429, "locked after five wrong codes, even the right one");
  assert.equal((await User.findById(r.body.user._id)).phoneVerifiedAt, undefined);

  // A new code (after the one-minute gap) works; an expired one does not.
  await User.updateOne({ _id: r.body.user._id }, { $set: { "phoneVerification.sentAt": new Date(Date.now() - 120000) } });
  await S.post("/auth/phone/send-code", { phone: "91234 56789", consent: true });
  await User.updateOne({ _id: r.body.user._id }, { $set: { "phoneVerification.expiresAt": new Date(Date.now() - 1000) } });
  assert.match((await S.post("/auth/phone/verify", { code: lastCodeTo("919123456789") })).body.message, /expired/);

  await User.updateOne({ _id: r.body.user._id }, { $set: { "phoneVerification.sentAt": new Date(Date.now() - 120000) } });
  await S.post("/auth/phone/send-code", { phone: "91234 56789", consent: true });
  const ok = await S.post("/auth/phone/verify", { code: lastCodeTo("919123456789") });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.phone.verified, true);
  assert.equal(ok.body.whatsapp.active, true);
  const u = await User.findById(r.body.user._id).lean();
  assert.ok(u.phoneVerifiedAt);
  assert.equal(u.whatsapp.optIn, true);
  assert.ok(u.whatsapp.consentAt && u.whatsapp.consentVersion);
  assert.equal(u.whatsapp.consentSource, "profile");

  // Hourly cap on codes.
  await User.updateOne({ _id: r.body.user._id }, { $set: { phoneVerification: { sentAt: new Date(Date.now() - 120000), windowStart: new Date(), windowCount: 5 } } });
  assert.match((await S.post("/auth/phone/send-code", { phone: "91234 56789", consent: true })).body.message, /an hour/);
});

test("turning WhatsApp alerts off and on: only a verified number can be switched on", async () => {
  const r = await register({ phone: "91234 56789", whatsappConsent: true });
  const S = api(r.body.token);
  assert.equal((await S.put("/auth/contact/whatsapp", { optIn: true })).status, 409, "not verified yet");
  await S.post("/auth/phone/verify", { code: lastCodeTo("919123456789") });
  const u0 = await User.findById(r.body.user._id).lean();
  assert.equal(u0.whatsapp.consentSource, "registration");

  const off = await S.put("/auth/contact/whatsapp", { optIn: false });
  assert.equal(off.body.whatsapp.active, false);
  assert.ok((await User.findById(r.body.user._id)).whatsapp.optOutAt);
  const on = await S.put("/auth/contact/whatsapp", { optIn: true });
  assert.equal(on.body.whatsapp.active, true);
  assert.equal((await S.put("/auth/contact/whatsapp", { optIn: "yes" })).status, 400);
});

test("sandbox and missing configuration: codes are simulated and labelled, never claimed as sent", async () => {
  configure({ NOTIFICATION_DELIVERY_MODE: "sandbox" });
  setDeliveryProviders({});
  const r = await register({ phone: "91234 56789", whatsappConsent: true });
  assert.equal(r.body.verification.whatsapp.simulated, true);
  assert.match(r.body.verification.whatsapp.devCode, /^\d{6}$/, "outside production the simulated code is shown so the flow can be tested");
  assert.equal(r.body.verification.email.sent, false);
  assert.equal(r.body.verification.email.simulated, true);
  assert.ok(r.body.verification.email.devLink.includes("/verify-email?token="));
  const ok = await api(r.body.token).post("/auth/phone/verify", { code: r.body.verification.whatsapp.devCode });
  assert.equal(ok.status, 200);

  // Live, but no verification template configured: refused plainly.
  configure({ WHATSAPP_OTP_TEMPLATE_NAME: undefined });
  setDeliveryProviders({ email, whatsapp });
  const r2 = await register({ phone: "92222 33333", whatsappConsent: true });
  assert.equal(r2.status, 201, "sign-up still succeeds");
  assert.match(r2.body.verification.whatsapp.reason, /not set up/);
  assert.equal(codes().length, 0);
});

// ─── Automatic recipients from the account ───────────────────────────

test("a drive reaches each eligible student's registered email and verified WhatsApp only", async () => {
  const verified = await register({ phone: "91111 11111", whatsappConsent: true });
  await api(verified.body.token).post("/auth/phone/verify", { code: lastCodeTo("919111111111") });
  const unverified = await register({ phone: "92222 22222", whatsappConsent: true }); // never enters the code
  const noConsent = await register({ phone: "93333 33333" });
  const ineligible = await register({ phone: "94444 44444", whatsappConsent: true });
  await api(ineligible.body.token).post("/auth/phone/verify", { code: lastCodeTo("919444444444") });

  for (const r of [verified, unverified, noConsent]) assert.equal((await createProfile(r.body.token)).status, 201);
  assert.equal((await createProfile(ineligible.body.token, { cgpa: 5.5 })).status, 201);

  const { id } = await openDrive();
  await processDueDeliveries();

  for (const r of [verified, unverified, noConsent]) assert.equal(driveEmailsTo(r.body.user.email).length, 1);
  assert.equal(driveEmailsTo(ineligible.body.user.email).length, 0);
  assert.deepEqual(alerts().map((m) => m.to), ["919111111111"], "only the verified, consenting, eligible number");
  assert.equal(alerts()[0].template.components[1].parameters[0].text, id);

  const reasons = Object.fromEntries(
    (await NotificationDelivery.find({ channel: "whatsapp" }).lean()).map((d) => [String(d.userId), d.skipReason || d.status]),
  );
  assert.equal(reasons[unverified.body.user._id], "unverified_phone");
  assert.equal(reasons[noConsent.body.user._id], "no_consent");
});

test("NOTIFY_EMAIL_REQUIRE_VERIFIED: unverified addresses wait, and receive open drives once verified", async () => {
  configure({ NOTIFY_EMAIL_REQUIRE_VERIFIED: "true" });
  const r = await register({ email: "careful@gmail.com" });
  await createProfile(r.body.token);
  await openDrive();
  await processDueDeliveries();
  assert.equal(driveEmailsTo("careful@gmail.com").length, 0);
  assert.equal((await NotificationDelivery.findOne({ channel: "email" })).skipReason, "email_unverified");

  await api().post("/auth/email/verify", { token: verificationLinkTo("careful@gmail.com") });
  await processDueDeliveries();
  assert.equal(driveEmailsTo("careful@gmail.com").length, 1, "the open drive arrives once verified");
});

// ─── New students and drives published before they joined ──────────

test("a student who joins after drives were published is notified of eligible open drives, once, on every channel", async () => {
  const eligibleDrive = await openDrive({ companyName: "Open Eligible" });
  const otherBranch = await openDrive({ companyName: "Mech Only", branches: ["ME"] });
  const closedDrive = await openDrive({ companyName: "Closed", status: "registration_closed" });
  const draft = await openDrive({ companyName: "Draft", status: "draft" });

  // Sign up with WhatsApp, verify, create the academic profile.
  const r = await register({ email: "late.joiner@gmail.com", phone: "95555 55555", whatsappConsent: true });
  const S = api(r.body.token);
  await S.post("/auth/phone/verify", { code: lastCodeTo("919555555555") });
  const p = await createProfile(r.body.token);
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.deepEqual({ eligible: p.body.openDrives.eligible, notified: p.body.openDrives.notified }, { eligible: 1, notified: 1 });

  // In-app (bell and notification centre read the same record).
  const mine = await Notification.find({ userId: r.body.user._id, type: "drive_opportunity" }).lean();
  assert.deepEqual(mine.map((x) => String(x.metadata.driveId)), [eligibleDrive.id]);
  const centre = await S.get("/notifications?page=1&limit=10");
  assert.equal(centre.body.total, 1);

  await processDueDeliveries();
  assert.equal(driveEmailsTo("late.joiner@gmail.com").length, 1);
  assert.deepEqual(alerts().map((m) => [m.to, m.template.components[1].parameters[0].text]), [["919555555555", eligibleDrive.id]]);
  for (const d of [otherBranch, closedDrive, draft]) {
    assert.equal(await Notification.countDocuments({ userId: r.body.user._id, "metadata.driveId": oid(d.id) }), 0);
  }

  // Saving the profile again, or re-running eligibility, never repeats it.
  await S.put("/student/profile", { cgpa: 8.4 });
  await eligibleDrive.O.post(`/placement/drives/${eligibleDrive.id}/eligibility/calculate`);
  await processDueDeliveries();
  assert.equal(await Notification.countDocuments({ userId: r.body.user._id }), 1);
  assert.equal(driveEmailsTo("late.joiner@gmail.com").length, 1);
  assert.equal(alerts().length, 1);

  // The draft, once published, reaches them like everyone else.
  await draft.O.patch(`/placement/drives/${draft.id}/status`, { status: "open" });
  await processDueDeliveries();
  assert.equal(driveEmailsTo("late.joiner@gmail.com").length, 2);
});

test("verifying WhatsApp after joining sends the open drives already announced in the app — and only those", async () => {
  const r = await register({ email: "later.verify@gmail.com", phone: "96666 66666" });
  await createProfile(r.body.token);
  const d = await openDrive();
  await processDueDeliveries();
  assert.equal(alerts().length, 0, "no consent or verification yet");

  const S = api(r.body.token);
  await S.post("/auth/phone/send-code", { phone: "96666 66666", consent: true });
  const v = await S.post("/auth/phone/verify", { code: lastCodeTo("919666666666") });
  assert.equal(v.body.catchUp.queued, 1);
  await processDueDeliveries();
  assert.deepEqual(alerts().map((m) => [m.to, m.template.components[1].parameters[0].text]), [["919666666666", d.id]]);
});

test("an academic update that makes a student eligible notifies them of the open drive", async () => {
  const r = await register({ email: "improver@gmail.com" });
  await createProfile(r.body.token, { cgpa: 6.5 });
  const d = await openDrive({ minCgpa: 7 });
  await processDueDeliveries();
  assert.equal(driveEmailsTo("improver@gmail.com").length, 0);

  const u = await api(r.body.token).put("/student/profile", { cgpa: 7.4 });
  assert.equal(u.body.openDrives.notified, 1);
  await processDueDeliveries();
  assert.equal(driveEmailsTo("improver@gmail.com").length, 1);
  assert.equal(await Notification.countDocuments({ userId: r.body.user._id, "metadata.driveId": oid(d.id) }), 1);
});

test("a changed phone must be verified again before WhatsApp uses it; the new number then gets open drives once", async () => {
  const r = await register({ email: "mover@gmail.com", phone: "97777 77777", whatsappConsent: true });
  const S = api(r.body.token);
  await S.post("/auth/phone/verify", { code: lastCodeTo("919777777777") });
  await createProfile(r.body.token);
  const first = await openDrive({ companyName: "First" });
  await processDueDeliveries();
  assert.deepEqual(alerts().map((m) => m.to), ["919777777777"]);

  // New number typed on the profile: stored, unverified, mirrored on the record.
  const upd = await S.put("/student/profile", { phone: "+91 98888 88888" });
  assert.equal(upd.body.phoneVerificationRequired, true);
  const u = await User.findById(r.body.user._id).lean();
  assert.equal(u.phone, "+919888888888");
  assert.equal(u.phoneVerifiedAt, undefined);
  assert.equal((await Student.findOne({ userId: r.body.user._id })).phone, "+919888888888");
  assert.equal((await S.put("/student/profile", { phone: "12345" })).status, 400);

  const second = await openDrive({ companyName: "Second" });
  await processDueDeliveries();
  assert.equal(alerts().length, 1, "nothing to an unverified number");
  assert.equal((await NotificationDelivery.findOne({ driveId: second.id, channel: "whatsapp" })).skipReason, "unverified_phone");

  await S.post("/auth/phone/send-code", { phone: "+91 98888 88888", consent: true });
  await S.post("/auth/phone/verify", { code: lastCodeTo("919888888888") });
  await processDueDeliveries();
  const toNew = alerts().filter((m) => m.to === "919888888888").map((m) => m.template.components[1].parameters[0].text);
  assert.deepEqual(toNew, [second.id], "the drive it missed; the first already went to the old number");
  await S.post("/auth/phone/verify", { code: "123456" }); // stray retries change nothing
  await processDueDeliveries();
  assert.equal(alerts().length, 2);
  assert.ok(first.id);
});

test("concurrent sign-ups and profile saves for many students never duplicate a notification", async () => {
  const d = await openDrive();
  const regs = await Promise.all(Array.from({ length: 20 }, () => register({ phone: undefined })));
  regs.forEach((r) => assert.equal(r.status, 201));
  await Promise.all(regs.map((r) => createProfile(r.body.token)));
  // Every student saves twice at once, and the officer recalculates meanwhile.
  await Promise.all([
    ...regs.map((r) => api(r.body.token).put("/student/profile", { cgpa: 8.6 })),
    ...regs.map((r) => api(r.body.token).put("/student/profile", { cgpa: 8.7 })),
    d.O.post(`/placement/drives/${d.id}/eligibility/calculate`),
  ]);
  await Promise.all([processDueDeliveries(), processDueDeliveries()]);
  assert.equal(await Notification.countDocuments({ "metadata.driveId": oid(d.id) }), 20);
  assert.equal(email.calls.filter((m) => /New Placement Opportunity/.test(m.subject)).length, 20);
  assert.equal(new Set(email.calls.filter((m) => /New Placement Opportunity/.test(m.subject)).map((m) => m.to)).size, 20);
});

// ─── Expired credentials, independent channels, delivery statuses ───

test("an expired WhatsApp token pauses WhatsApp only: emails continue, messages are kept, and go out once fixed", async () => {
  // The real WhatsApp client against a Graph API that rejects the token.
  let tokenValid = false;
  const fake = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.writeHead(tokenValid ? 200 : 401, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tokenValid
        ? { messages: [{ id: `wamid.${crypto.randomUUID()}` }] }
        : { error: { code: 190, message: "Error validating access token: Session has expired" } }));
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  try {
    const regs = [];
    for (const num of ["91010 10101", "92020 20202", "93030 30303"]) {
      const r = await register({ phone: num });
      await User.updateOne({ _id: r.body.user._id }, { $set: { phoneVerifiedAt: new Date(), whatsapp: { optIn: true, consentAt: new Date() } } });
      await createProfile(r.body.token);
      regs.push(r);
    }
    configure({ WHATSAPP_API_BASE_URL: `http://127.0.0.1:${fake.address().port}` });
    setDeliveryProviders({ email }); // WhatsApp: real client
    const d = await openDrive();
    await processDueDeliveries();

    assert.equal(driveEmailsTo(regs[0].body.user.email).length + driveEmailsTo(regs[1].body.user.email).length + driveEmailsTo(regs[2].body.user.email).length, 3, "email unaffected");
    const held = await NotificationDelivery.find({ channel: "whatsapp" }).lean();
    assert.equal(held.length, 3);
    assert.ok(held.every((h) => h.status === "pending" && h.attempts === 0), "held, attempts not used up");
    // The messages already in flight when the first 401 came back also
    // see it; then the channel pauses. None used up an attempt.
    assert.ok(held.every((h) => !h.lastError || h.lastError.code === "WA_190"));
    assert.ok(held.some((h) => h.lastError?.code === "WA_190"));
    const summary = (await d.O.get(`/placement/drives/${d.id}/notifications/summary`)).body.summary;
    assert.match(summary.config.alerts.whatsapp.message, /WHATSAPP_ACCESS_TOKEN/);
    assert.equal(summary.whatsapp.failed, 0);

    // The administrator updates the token and restarts.
    tokenValid = true;
    resetDeliveryPauses();
    await releaseCredentialHolds();
    await processDueDeliveries();
    assert.equal(await NotificationDelivery.countDocuments({ channel: "whatsapp", status: "sent" }), 3);
    const after = (await d.O.get(`/placement/drives/${d.id}/notifications/summary`)).body.summary;
    assert.equal(after.config.alerts.whatsapp, undefined, "alert cleared by the first success");
  } finally {
    await new Promise((r) => fake.close(r));
  }
});

test("a rejected email login pauses email only: WhatsApp continues and the emails are kept", async () => {
  let loginOk = false;
  setDeliveryProviders({
    email: (email = mockProvider(() => {
      if (!loginOk) throw new DeliveryError("EAUTH", "535 Username and Password not accepted", { credential: true, retryAfterMs: 600000 });
      return {};
    })),
    whatsapp,
  });
  const r = await register({ email: "both@gmail.com", phone: "91212 12121", whatsappConsent: true });
  await api(r.body.token).post("/auth/phone/verify", { code: lastCodeTo("919121212121") });
  await createProfile(r.body.token);
  await openDrive();
  await processDueDeliveries();
  assert.equal(alerts().length, 1, "WhatsApp delivered");
  const mail = await NotificationDelivery.findOne({ channel: "email", userId: r.body.user._id }).lean();
  assert.equal(mail.status, "pending");
  assert.equal(mail.attempts, 0);

  loginOk = true;
  resetDeliveryPauses();
  await releaseCredentialHolds();
  await processDueDeliveries();
  assert.equal((await NotificationDelivery.findById(mail._id)).status, "sent");
});

test("delivery statuses: out-of-order, repeated and failed callbacks are applied realistically", async () => {
  const r = await register({ phone: "91313 13131", whatsappConsent: true });
  await api(r.body.token).post("/auth/phone/verify", { code: lastCodeTo("919131313131") });
  await createProfile(r.body.token);
  await openDrive();
  await processDueDeliveries();
  const row = await NotificationDelivery.findOne({ channel: "whatsapp" }).lean();
  assert.equal(row.status, "sent");

  const post = (statuses) => {
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses } }] }] });
    const sig = `sha256=${crypto.createHmac("sha256", "test-app-secret").update(raw).digest("hex")}`;
    return fetch(`${baseUrlForTests()}/webhooks/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig }, body: raw });
  };
  const id = row.providerMessageId;
  // "read" arrives before "delivered" (Meta does not guarantee order), then both repeat.
  assert.equal((await post([{ id, status: "read", timestamp: "1767225700" }])).status, 200);
  await post([{ id, status: "delivered", timestamp: "1767225600" }, { id, status: "read", timestamp: "1767225700" }, { id, status: "sent", timestamp: "1767225500" }]);
  const done = await NotificationDelivery.findById(row._id).lean();
  assert.equal(done.status, "read");
  assert.ok(done.deliveredAt && done.readAt);

  // An unknown message id changes nothing; a failure for an undelivered message is recorded.
  await post([{ id: "wamid.unknown", status: "delivered", timestamp: "1767225600" }]);
  await NotificationDelivery.updateOne({ _id: row._id }, { $set: { status: "sent" }, $unset: { deliveredAt: "", readAt: "" } });
  await post([{ id, status: "failed", timestamp: "1767225800", errors: [{ code: 131049, title: "Not delivered to maintain healthy ecosystem engagement" }] }]);
  const failed = await NotificationDelivery.findById(row._id).lean();
  assert.equal(failed.status, "failed");
  assert.equal(failed.lastError.code, "WA_131049");
});

test("contact screen shows only the user's own details and needs sign-in", async () => {
  const r = await register({ email: "me@gmail.com", phone: "91414 14141" });
  const c = await api(r.body.token).get("/auth/contact");
  assert.equal(c.status, 200);
  assert.equal(c.body.email.address, "me@gmail.com");
  assert.equal(c.body.phone.number, "+919141414141");
  assert.equal(c.body.phone.verified, false);
  assert.equal(JSON.stringify(c.body).includes("codeHash"), false);
  assert.equal((await api().get("/auth/contact")).status, 401);
  assert.equal((await api().post("/auth/phone/send-code", { phone: "9", consent: true })).status, 401);
});

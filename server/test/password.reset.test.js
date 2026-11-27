import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { setup, teardown, reset, createUser, api } from "./helpers.js";
import User from "../models/User.js";
import { setDeliveryProviders } from "../services/notificationDeliveryService.js";
import { RESET_TTL_MS } from "../services/passwordResetService.js";

/**
 * Forgot password: one-time emailed link, no account enumeration, and a
 * reset signs out every existing session. The email provider is a mock;
 * nothing here can reach a real inbox.
 */

const APP_URL = "https://careercore.example.edu";
const ENV = {
  NOTIFICATION_DELIVERY_MODE: "live",
  NOTIFY_EMAIL_ENABLED: "true",
  PUBLIC_APP_URL: APP_URL,
  SMTP_USER: "placement@example.edu",
  SMTP_PASS: "not-a-real-password",
};
const configure = (overrides = {}) => {
  for (const [k, v] of Object.entries({ ...ENV, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

let email;
let addr;
let seq = 0;
const mockEmail = () => {
  const calls = [];
  return {
    calls,
    async send(message) {
      calls.push(message);
      return { provider: "mock", providerMessageId: `mock-${crypto.randomUUID()}` };
    },
  };
};

/** The email goes out after the response; wait for it. */
const waitForEmails = async (n, ms = 3000) => {
  const end = Date.now() + ms;
  while (email.calls.length < n && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return email.calls;
};
/** Give a background send the chance to happen (for "nothing was sent"). */
const settle = () => new Promise((r) => setTimeout(r, 250));
const tokenFrom = (message) => message.text.match(/reset-password\?token=([a-f0-9]{64})/)[1];

before(setup);
after(async () => {
  setDeliveryProviders({});
  for (const k of Object.keys(ENV)) delete process.env[k];
  process.env.NOTIFICATION_DELIVERY_MODE = "sandbox";
  await teardown();
});
beforeEach(async () => {
  await reset();
  configure();
  email = mockEmail();
  setDeliveryProviders({ email });
  // Each test its own address: the request limiter is per address and email.
  addr = `asha${++seq}@college.edu`;
});

const A = api();
const password = "Password123!";
const account = async () => {
  const { user, token } = await createUser("student", { email: addr, name: "Asha Rao", passwordHash: password });
  return { user, token };
};

test("known and unknown addresses get the same answer; only the known one is emailed", async () => {
  await account();
  const known = await A.post("/auth/password/forgot", { email: `  ${addr.toUpperCase()} ` });
  const unknown = await A.post("/auth/password/forgot", { email: "nobody@college.edu" });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.doesNotMatch(JSON.stringify(known.body), /token|reset-password/);

  const sent = await waitForEmails(1);
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, addr);
  assert.match(sent[0].subject, /Reset your CareerCore password/);
  assert.match(sent[0].html, new RegExp(`${APP_URL}/reset-password\\?token=[a-f0-9]{64}`));

  const stored = await User.findOne({ email: addr }).select("+passwordReset").lean();
  assert.notEqual(stored.passwordReset.tokenHash, tokenFrom(sent[0]), "only the hash is stored");
});

test("a reset changes the password, works once and signs out existing sessions", async () => {
  const { token: oldSession } = await account();
  assert.equal((await api(oldSession).get("/auth/me")).status, 200);

  await A.post("/auth/password/forgot", { email: addr });
  const [message] = await waitForEmails(1);
  const token = tokenFrom(message);

  assert.deepEqual((await A.post("/auth/password/check", { token })).body, { valid: true });

  // Sessions are compared at whole-second precision: let a second pass so the
  // old session is clearly older than the change.
  await new Promise((r) => setTimeout(r, 1100));
  const done = await A.post("/auth/password/reset", { token, password: "NewPassword456" });
  assert.equal(done.status, 200, JSON.stringify(done.body));

  const me = await api(oldSession).get("/auth/me");
  assert.equal(me.status, 401);
  assert.match(me.body.message, /password was changed/);

  assert.equal((await A.post("/auth/login", { email: addr, password })).status, 401);
  const fresh = await A.post("/auth/login", { email: addr, password: "NewPassword456" });
  assert.equal(fresh.status, 200);
  assert.equal((await api(fresh.body.token).get("/auth/me")).status, 200, "a new sign-in works");

  const again = await A.post("/auth/password/reset", { token, password: "Another789xyz" });
  assert.equal(again.status, 400);
  assert.match(again.body.message, /not valid or was already used/);
  assert.equal((await A.post("/auth/password/check", { token })).status, 400);
});

test("expired, malformed and short-password requests are refused", async () => {
  await account();
  await A.post("/auth/password/forgot", { email: addr });
  const [message] = await waitForEmails(1);
  const token = tokenFrom(message);

  const short = await A.post("/auth/password/reset", { token, password: "short" });
  assert.equal(short.status, 400);
  assert.match(short.body.message, /at least 8/);

  assert.equal((await A.post("/auth/password/reset", { token: "abc", password: "LongEnough1" })).status, 400);

  await User.updateOne({ email: addr }, { $set: { "passwordReset.expiresAt": new Date(Date.now() - 1000) } });
  const expired = await A.post("/auth/password/reset", { token, password: "LongEnough1" });
  assert.equal(expired.status, 400);
  assert.match(expired.body.message, /expired/);
  assert.ok(RESET_TTL_MS <= 60 * 60 * 1000, "links are short-lived");
});

test("one email a minute per account; a newer link replaces the older one", async () => {
  await account();
  await A.post("/auth/password/forgot", { email: addr });
  await waitForEmails(1);
  await A.post("/auth/password/forgot", { email: addr });
  await settle();
  assert.equal(email.calls.length, 1, "second request inside a minute sends nothing");

  // After the gap, a new link replaces the old one.
  await User.updateOne({ email: addr }, { $set: { "passwordReset.sentAt": new Date(Date.now() - 120000) } });
  await A.post("/auth/password/forgot", { email: addr });
  const [first, second] = await waitForEmails(2);
  assert.equal((await A.post("/auth/password/check", { token: tokenFrom(first) })).status, 400);
  assert.equal((await A.post("/auth/password/check", { token: tokenFrom(second) })).status, 200);
});

test("deactivated accounts get no email but the same answer", async () => {
  await account();
  await User.updateOne({ email: addr }, { $set: { isActive: false } });
  const r = await A.post("/auth/password/forgot", { email: addr });
  assert.equal(r.status, 200);
  await settle();
  assert.equal(email.calls.length, 0);
});

test("a failed send restores the previous state and the answer is unchanged", async () => {
  await account();
  setDeliveryProviders({
    email: {
      async send() {
        throw Object.assign(new Error("SMTP down"), { code: "SEND_FAILED" });
      },
    },
  });
  const r = await A.post("/auth/password/forgot", { email: addr });
  assert.equal(r.status, 200);
  await settle();
  const stored = await User.findOne({ email: addr }).select("+passwordReset").lean();
  assert.equal(stored.passwordReset, undefined, "no dangling link when nothing was sent");
});

test("when email is off on the server, the answer says so without naming any account", async () => {
  configure({ NOTIFICATION_DELIVERY_MODE: "off" });
  const r = await A.post("/auth/password/forgot", { email: "nobody@college.edu" });
  assert.equal(r.status, 503);
  assert.match(r.body.message, /not available on this server/);
  assert.equal((await A.post("/auth/password/forgot", { email: "not-an-email" })).status, 400);
});

test("account JSON never includes the reset fields", async () => {
  const { token } = await account();
  await A.post("/auth/password/forgot", { email: addr });
  await waitForEmails(1);
  const me = await api(token).get("/auth/me");
  assert.equal(me.body.user?.passwordReset ?? me.body.passwordReset, undefined);
});

test("repeated requests for one address are rate limited", async () => {
  await account();
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await A.post("/auth/password/forgot", { email: addr })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

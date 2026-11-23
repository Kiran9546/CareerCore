import "./env.js";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setup, teardown, reset, createUser, api, baseUrlForTests } from "./helpers.js";
import { acquireLease, runExclusive } from "../jobs/jobLock.js";

/**
 * Behaviour that matters once several API processes and many users run at
 * the same time: scheduled jobs run once cluster-wide, users of different
 * roles act concurrently without interfering, and the readiness probe
 * reflects the database.
 */

before(setup);
after(teardown);
beforeEach(reset);

test("a job lease is granted to exactly one of many concurrent contenders", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () => acquireLease("cron:test-race", 60_000))
  );
  assert.equal(results.filter(Boolean).length, 1);
});

test("a lease is held for its TTL and can be taken again once it expires", async () => {
  const t0 = new Date("2026-01-01T09:00:00Z");
  assert.equal(await acquireLease("cron:test-ttl", 5 * 60_000, t0), true);
  // Another instance firing the same tick a few seconds later is refused.
  assert.equal(await acquireLease("cron:test-ttl", 5 * 60_000, new Date(t0.getTime() + 10_000)), false);
  // The next tick, after the lease has lapsed, runs.
  assert.equal(await acquireLease("cron:test-ttl", 5 * 60_000, new Date(t0.getTime() + 10 * 60_000)), true);
});

test("runExclusive runs the job body once across simultaneous ticks", async () => {
  let runs = 0;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      runExclusive("cron:test-body", 60_000, async () => {
        runs++;
      })
    )
  );
  assert.equal(runs, 1);
});

test("users of every role can work simultaneously, each seeing only their own account", async () => {
  const roles = ["student", "faculty", "placement_officer", "admin"];
  const users = await Promise.all(roles.map((r) => createUser(r)));

  // Fire every user's request at once, several times over.
  const responses = await Promise.all(
    Array.from({ length: 5 }).flatMap(() =>
      users.map(async ({ user, token }) => ({ expected: user, res: await api(token).get("/auth/me") }))
    )
  );
  for (const { expected, res } of responses) {
    assert.equal(res.status, 200);
    assert.equal(res.body.user._id, String(expected._id));
    assert.equal(res.body.user.role, expected.role);
  }
});

test("failed logins for one account do not lock out other accounts on the same network", async () => {
  const { user: victim } = await createUser("student", { email: "typo@example.edu" });
  const { user: other } = await createUser("student", { email: "other@example.edu" });
  const login = (email, password) =>
    fetch(`${baseUrlForTests()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

  for (let i = 0; i < 21; i++) await login(victim.email, "wrong-password");
  assert.equal((await login(victim.email, "wrong-password")).status, 429);

  // Same IP, different account: unaffected.
  assert.equal((await login(other.email, "Password123!")).status, 200);
});

test("the readiness probe reports the database connection", async () => {
  const res = await fetch(`${baseUrlForTests()}/ready`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).database, "connected");
  assert.equal(mongoose.connection.readyState, 1);
});

import "./env.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { demoSeedDecision, databaseIdentity, hostsFromUri } from "../seed/guard.js";
import { productionEnvProblems } from "../config/env.js";

/**
 * The guards that keep demo seeding and clean-up away from real data, and the
 * production start-up checks. The seed scripts are run as real processes
 * against a throwaway in-memory database, from an empty working directory so
 * that no developer .env (database, mail server) can be picked up.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const seedDir = path.join(here, "..", "seed");
const run = promisify(execFile);
const { MongoClient } = mongoose.mongo;

// ── Pure decisions ─────────────────────────────────────────────────────

test("demo seeding: identity strips credentials and keeps hosts and name", () => {
  assert.equal(hostsFromUri("mongodb+srv://u:p%40ss@Cluster0.AbC.mongodb.net/x?retryWrites=true"), "cluster0.abc.mongodb.net");
  assert.equal(hostsFromUri("mongodb://h1:27017,h2:27017/db"), "h1:27017,h2:27017");
  assert.equal(databaseIdentity("mongodb://localhost:27017/careercore_dev", "careercore_dev"), "localhost:27017/careercore_dev");
});

test("demo seeding: only the declared development database is allowed", () => {
  const uri = "mongodb://localhost:27017/careercore_dev";
  const base = { nodeEnv: "development", uri, dbName: "careercore_dev" };
  assert.equal(demoSeedDecision({ ...base, declared: "" }).allowed, false);
  assert.equal(demoSeedDecision({ ...base, declared: "localhost:27017/careercore" }).allowed, false);
  assert.equal(demoSeedDecision({ ...base, declared: "otherhost:27017/careercore_dev" }).allowed, false);
  assert.equal(demoSeedDecision({ ...base, declared: "LOCALHOST:27017/careercore_dev" }).allowed, true);
  // Production refuses even when the database is declared.
  assert.equal(demoSeedDecision({ ...base, nodeEnv: "production", declared: "localhost:27017/careercore_dev" }).allowed, false);
  // Same database name on a different cluster is not the same database.
  const prod = { nodeEnv: "development", uri: "mongodb+srv://u:p@prod.abc.mongodb.net/careercore", dbName: "careercore" };
  assert.equal(demoSeedDecision({ ...prod, declared: "dev.abc.mongodb.net/careercore" }).allowed, false);
});

test("production start-up: unsafe or missing settings are reported", () => {
  const good = {
    JWT_SECRET: "x".repeat(40),
    MONGO_URI: "mongodb+srv://u:p@prod.abc.mongodb.net/careercore",
    CLIENT_URL: "https://careercore.vercel.app,https://placements.college.edu",
  };
  assert.deepEqual(productionEnvProblems(good), []);
  assert.equal(productionEnvProblems({ ...good, JWT_SECRET: "" }).length, 1);
  assert.equal(productionEnvProblems({ ...good, JWT_SECRET: "replace_with_a_long_random_string" }).length, 1);
  assert.equal(productionEnvProblems({ ...good, JWT_SECRET: "short" }).length, 1);
  assert.equal(productionEnvProblems({ ...good, MONGO_URI: "" }).length, 1);
  assert.equal(productionEnvProblems({ ...good, MONGO_URI: "mongodb+srv://<user>:<password>@<cluster>.mongodb.net/x" }).length, 1);
  assert.equal(productionEnvProblems({ ...good, CLIENT_URL: "" }).length, 1);
  assert.equal(productionEnvProblems({ ...good, CLIENT_URL: "http://localhost:5173" }).length, 1);
  assert.equal(productionEnvProblems({ ...good, DEMO_SEED_DATABASE: "x/y" }).length, 1);
});

// ── The scripts themselves, against a throwaway database ───────────────

let mongo;
let client;
let db;
let uri;
let identity;
let cwd;

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  uri = mongo.getUri("careercore_guardtest");
  identity = databaseIdentity(uri, "careercore_guardtest");
  client = await MongoClient.connect(uri);
  db = client.db("careercore_guardtest");
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cc-guard-"));
});

after(async () => {
  await client?.close();
  await mongo?.stop();
  fs.rmSync(cwd, { recursive: true, force: true });
});

/** Runs a seed script; resolves to { code, out } instead of throwing. */
const script = async (file, args = [], env = {}) => {
  try {
    const r = await run(process.execPath, [path.join(seedDir, file), ...args], {
      cwd,
      timeout: 180000,
      env: {
        ...process.env,
        NODE_ENV: "development",
        MONGO_URI: uri,
        DEMO_SEED_DATABASE: "",
        SMTP_HOST: "",
        SMTP_USER: "",
        SMTP_PASS: "",
        ...env,
      },
    });
    return { code: 0, out: r.stdout + r.stderr };
  } catch (e) {
    return { code: e.code ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
};

test("full reference seed refuses an undeclared database and writes nothing", async () => {
  const r = await script("seed.js");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /Refusing the full seed/);
  assert.match(r.out, new RegExp(`DEMO_SEED_DATABASE=${identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.equal(await db.collection("skills").countDocuments(), 0);
});

test("insert-only seed adds missing reference data and never changes existing records", async () => {
  const first = await script("seed.js", ["--insert-only"]);
  assert.equal(first.code, 0, first.out);
  const counts = async () =>
    Object.fromEntries(
      await Promise.all(
        ["skills", "careerpaths", "aptitudequestions", "learningresources"].map(async (c) => [c, await db.collection(c).countDocuments()]),
      ),
    );
  const before = await counts();
  assert.ok(before.skills > 0 && before.aptitudequestions > 0 && before.careerpaths > 0);

  // An administrator's edit to an existing question.
  const q = await db.collection("aptitudequestions").findOne({});
  await db.collection("aptitudequestions").updateOne({ _id: q._id }, { $set: { adminNote: "edited by an administrator" } });
  const edited = await db.collection("aptitudequestions").findOne({ _id: q._id });

  const second = await script("seed.js", ["--insert-only"]);
  assert.equal(second.code, 0, second.out);
  assert.deepEqual(await counts(), before);
  assert.deepEqual(await db.collection("aptitudequestions").findOne({ _id: q._id }), edited);

  // For contrast: the full seed on the declared development database does
  // rewrite existing records, which is why it is guarded.
  const full = await script("seed.js", [], { DEMO_SEED_DATABASE: identity });
  assert.equal(full.code, 0, full.out);
  assert.notDeepEqual((await db.collection("aptitudequestions").findOne({ _id: q._id })).updatedAt, edited.updatedAt);
});

test("cohort seed and clean-up refuse undeclared and production databases and leave accounts alone", async () => {
  await db.collection("users").insertOne({ name: "Existing Person", email: "existing.person@guardtest.local", role: "student", password: "x" });
  const has = async (email) => (await db.collection("users").countDocuments({ email })) === 1;

  const undeclared = await script("seedCohort.js");
  assert.notEqual(undeclared.code, 0);
  assert.match(undeclared.out, /Refusing to run seed:cohort/);

  const production = await script("seedCohort.js", [], { NODE_ENV: "production", DEMO_SEED_DATABASE: identity });
  assert.notEqual(production.code, 0);
  assert.match(production.out, /NODE_ENV is production/);

  const clean = await script("cleanDatabase.js");
  assert.notEqual(clean.code, 0);
  assert.match(clean.out, /Refusing to run db:clean/);

  const dry = await script("seedCohort.js", ["--dry-run"]);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /A real run would be REFUSED/);

  assert.ok(await has("existing.person@guardtest.local"), "the existing account is untouched");
  assert.equal(await db.collection("users").countDocuments(), 1, "no demo accounts were created");

  // Declared development database: the seed runs (and is destructive, which
  // is exactly why it needs the declaration).
  const declared = await script("seedCohort.js", [], { DEMO_SEED_DATABASE: identity });
  assert.equal(declared.code, 0, declared.out);
  assert.equal(await has("existing.person@guardtest.local"), false);
  assert.ok((await db.collection("users").countDocuments()) > 1);
});

test("admin:create adds one administrator and never changes an existing account", async () => {
  const email = "first.admin@guardtest.local";
  const env = { NODE_ENV: "production", ADMIN_EMAIL: email, ADMIN_NAME: "First Admin" };
  const usersBefore = await db.collection("users").countDocuments();

  const short = await script("createAdmin.js", [], { ...env, ADMIN_PASSWORD: "short" });
  assert.notEqual(short.code, 0);
  assert.match(short.out, /at least 12 characters/);

  const created = await script("createAdmin.js", [], { ...env, ADMIN_PASSWORD: "a-long-test-password-1" });
  assert.equal(created.code, 0, created.out);
  const admin = await db.collection("users").findOne({ email });
  assert.equal(admin.role, "admin");
  assert.notEqual(admin.passwordHash, "a-long-test-password-1", "the password is stored hashed");
  assert.equal(await db.collection("users").countDocuments(), usersBefore + 1);

  const again = await script("createAdmin.js", [], { ...env, ADMIN_NAME: "Someone Else", ADMIN_PASSWORD: "a-different-password-2" });
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /already exists.*Nothing was changed/);
  assert.deepEqual(await db.collection("users").findOne({ email }), admin);
  assert.equal(await db.collection("users").countDocuments(), usersBefore + 1);
});

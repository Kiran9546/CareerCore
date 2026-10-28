import "./env.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Runs migrations/placementWorkflow.js against a database shaped like one
 * from before the recruitment workflow: the old unique owner index on
 * companies, two recruiter profiles sharing a name, and a recorded drive
 * with no companyId.
 */

const run = promisify(execFile);
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations", "placementWorkflow.js");
let mongo;
let uri;

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  uri = `${mongo.getUri()}legacy`;
  const conn = await mongoose.createConnection(uri).asPromise();
  const companies = conn.collection("companies");
  await companies.createIndex({ recruiterUserId: 1 }, { unique: true });
  await companies.insertMany([
    { name: "ABC Technologies", recruiterUserId: new mongoose.Types.ObjectId(), createdAt: new Date(2024, 1, 1) },
    { name: "abc technologies pvt ltd", recruiterUserId: new mongoose.Types.ObjectId(), createdAt: new Date(2024, 2, 1) },
  ]);
  await conn.collection("drives").insertOne({ companyName: "Legacy Co", role: "Dev", driveDate: new Date(), status: "completed", stages: ["aptitude", "final"], createdBy: new mongoose.Types.ObjectId() });
  await conn.close();
});

after(async () => {
  await mongo?.stop();
});

const migrate = (...args) => run(process.execPath, [script, ...args], { env: { ...process.env, MONGO_URI: uri } });

test("dry run changes nothing; apply migrates additively and is repeatable", { timeout: 120000 }, async () => {
  const dry = await migrate();
  assert.match(dry.stdout, /Dry run complete/);
  const conn = await mongoose.createConnection(uri).asPromise();
  const companies = conn.collection("companies");
  assert.ok((await companies.indexes()).some((i) => i.name === "recruiterUserId_1" && !i.partialFilterExpression));
  assert.equal(await companies.countDocuments({ nameKey: { $exists: true } }), 0);

  const applied = await migrate("--apply", "--link-drives");
  assert.match(applied.stdout, /Duplicate company name left without a key/);
  assert.match(applied.stdout, /Migration complete/);

  const idx = await companies.indexes();
  const owner = idx.find((i) => i.key.recruiterUserId === 1);
  assert.ok(owner.partialFilterExpression, "owner index is partial now");
  assert.equal(await companies.countDocuments({ nameKey: "abc technologies" }), 1);
  assert.equal(await companies.countDocuments(), 3, "nothing deleted, Legacy Co added");
  const drive = await conn.collection("drives").findOne({ companyName: "Legacy Co" });
  assert.ok(drive.companyId);

  // Two owner-less companies can now coexist.
  await companies.insertOne({ name: "No Owner One", nameKey: "no owner one" });
  await companies.insertOne({ name: "No Owner Two", nameKey: "no owner two" });

  const again = await migrate("--apply", "--link-drives");
  assert.match(again.stdout, /already compatible/);
  assert.equal(await companies.countDocuments(), 5);
  await conn.close();
});

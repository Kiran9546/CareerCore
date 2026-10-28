import mongoose from "mongoose";
import dotenv from "dotenv";

import Company, { companyNameKey } from "../models/Company.js";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import Notification from "../models/Notification.js";
import DriveCandidate from "../models/DriveCandidate.js";
import RoundResult from "../models/RoundResult.js";
import AuditLog from "../models/AuditLog.js";
import InterviewTemplate from "../models/InterviewTemplate.js";
import PlacementSetting from "../models/PlacementSetting.js";

/**
 * CareerCore — recruitment workflow migration
 * ===========================================
 *
 * Prepares an existing database for the managed recruitment workflow. It is
 * additive: no document is deleted and no existing field is overwritten.
 *
 *   1. Company.recruiterUserId stops being required, so the placement cell
 *      can list companies that have no recruiter account. The old index
 *      (`recruiterUserId_1`, unique on every document) would reject a second
 *      company without an owner; it is replaced by a unique index that only
 *      covers companies that have one. Dropping an index removes no data.
 *   2. Companies get `nameKey`, the normalised name that prevents
 *      duplicates. Where two existing recruiter profiles share a name, the
 *      oldest gets the key and the others are reported and left unset.
 *   3. Indexes for the new and extended collections are created.
 *   4. --link-drives (optional): every recorded drive without a companyId is
 *      linked to a company with the same name, adding the company to the list
 *      if needed, so the company dropdown shows past visitors too.
 *
 * Existing drives need no change: a drive without `workflow` reads as
 * "recorded", and a participation without `registrationStatus` reads as
 * "registered".
 *
 * Usage:
 *   node migrations/placementWorkflow.js                 dry run, changes nothing
 *   node migrations/placementWorkflow.js --apply         perform steps 1–3
 *   node migrations/placementWorkflow.js --apply --link-drives
 */

dotenv.config();

const APPLY = process.argv.includes("--apply");
const LINK_DRIVES = process.argv.includes("--link-drives");
const log = (...a) => console.log(APPLY ? "" : "[dry run]", ...a);

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected to ${mongoose.connection.name}${APPLY ? "" : " (dry run — nothing will change)"}`);

  // ── 1. Company owner index ──────────────────────────────────
  const indexes = await Company.collection.indexes().catch(() => []);
  const legacy = indexes.find(
    (i) => i.key?.recruiterUserId === 1 && i.unique && !i.partialFilterExpression,
  );
  if (legacy) {
    log(`Replace index ${legacy.name} with a partial unique index on recruiterUserId`);
    if (APPLY) await Company.collection.dropIndex(legacy.name);
  } else {
    log("Company owner index already compatible");
  }

  // ── 2. Company name keys ────────────────────────────────────
  const companies = await Company.find({}).sort({ createdAt: 1 }).select("name nameKey").lean();
  const taken = new Map(companies.filter((c) => c.nameKey).map((c) => [c.nameKey, c]));
  let keyed = 0;
  for (const c of companies.filter((x) => !x.nameKey)) {
    const key = companyNameKey(c.name);
    if (!key) continue;
    if (taken.has(key)) {
      log(`Duplicate company name left without a key: "${c.name}" (${c._id}) matches "${taken.get(key).name}"`);
      continue;
    }
    taken.set(key, c);
    keyed++;
    if (APPLY) await Company.updateOne({ _id: c._id }, { $set: { nameKey: key } });
  }
  log(`Company name keys to add: ${keyed}`);

  // ── 3. Indexes ──────────────────────────────────────────────
  for (const Model of [Company, Drive, DriveParticipation, Notification, DriveCandidate, RoundResult, AuditLog, InterviewTemplate, PlacementSetting]) {
    log(`Create indexes for ${Model.collection.collectionName}`);
    if (APPLY) await Model.createIndexes();
  }

  // ── 4. Link recorded drives to companies (optional) ─────────
  if (LINK_DRIVES) {
    const unlinked = await Drive.find({ companyId: { $exists: false } }).select("companyName").lean();
    let linked = 0;
    let added = 0;
    for (const d of unlinked) {
      const key = companyNameKey(d.companyName);
      let company = taken.get(key);
      if (!company) {
        added++;
        log(`Add company "${d.companyName}" to the list`);
        if (APPLY) {
          company = (await Company.create({ name: d.companyName, source: "placement_cell" })).toObject();
        } else {
          company = { _id: null, name: d.companyName };
        }
        taken.set(key, company);
      }
      linked++;
      if (APPLY) await Drive.updateOne({ _id: d._id, companyId: { $exists: false } }, { $set: { companyId: company._id } });
    }
    log(`Recorded drives to link: ${linked} (companies to add: ${added})`);
  }

  await mongoose.disconnect();
  console.log(APPLY ? "Migration complete." : "Dry run complete. Re-run with --apply to make these changes.");
};

run().catch(async (err) => {
  console.error(`Migration failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

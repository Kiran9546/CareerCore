import mongoose from "mongoose";
import dotenv from "dotenv";

import NotificationDelivery from "../models/NotificationDelivery.js";
import Student from "../models/Student.js";
import Notification from "../models/Notification.js";

/**
 * CareerCore — multi-channel notification migration
 * =================================================
 *
 * Additive only. Nothing is deleted, renamed or overwritten:
 *
 *   1. Creates the `notificationdeliveries` collection's indexes, including
 *      the UNIQUE index on idempotencyKey that guarantees one email and one
 *      WhatsApp message per drive × student. Create it before the first
 *      publish on a database that predates this feature, so the guarantee
 *      holds from the first row.
 *   2. Creates the sparse index on students.whatsapp.number (used to honour
 *      "STOP" replies). Existing students simply have no `whatsapp` field,
 *      which reads as "not opted in" — no backfill is needed or done.
 *   3. Confirms the existing unique notifications.dedupeKey index exists.
 *
 * Mongoose also builds missing indexes when the API starts (autoIndex), so
 * this script is for operators who run with autoIndex off or want to see
 * the change before it happens.
 *
 * Usage:
 *   node migrations/notificationDelivery.js           dry run, changes nothing
 *   node migrations/notificationDelivery.js --apply   create missing indexes
 */

dotenv.config();

const APPLY = process.argv.includes("--apply");

const missingIndexes = async (model) => {
  const existing = await model.collection.indexes().catch(() => []);
  const names = new Set(existing.map((i) => JSON.stringify(i.key)));
  return model.schema.indexes().filter(([key]) => !names.has(JSON.stringify(key)));
};

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected to ${mongoose.connection.name}${APPLY ? "" : " (dry run — nothing will change)"}`);

  // ── Contact details move from the student record to the account ──
  // Earlier builds kept the WhatsApp number/consent on students. The account
  // (User) is now the single home. Copied only where the account has no
  // number yet; nothing on the student is deleted. A copied number is NOT
  // verified: the student enters a WhatsApp code once before alerts go there.
  const { normalizePhone } = await import("../utils/phone.js");
  const { default: User } = await import("../models/User.js");
  const legacy = await Student.collection
    .find({ $or: [{ "whatsapp.number": { $type: "string" } }, { phone: { $nin: [null, ""] } }] })
    .project({ userId: 1, phone: 1, whatsapp: 1 })
    .toArray();
  let moved = 0;
  for (const s of legacy) {
    const number = normalizePhone(s.whatsapp?.number || s.phone);
    if (!number || !s.userId) continue;
    const user = await User.collection.findOne({ _id: s.userId }, { projection: { phone: 1 } });
    if (!user || user.phone) continue;
    moved++;
    if (APPLY) {
      await User.collection.updateOne(
        { _id: s.userId, phone: { $exists: false } },
        {
          $set: {
            phone: number,
            ...(s.whatsapp?.optIn
              ? { whatsapp: { optIn: true, consentAt: s.whatsapp.consentAt || new Date(), consentVersion: s.whatsapp.consentVersion, consentSource: "migration" } }
              : {}),
          },
        },
      );
    }
  }
  console.log(`accounts: ${APPLY ? "copied" : "would copy"} a mobile number from the student record for ${moved} account(s) (unverified)`);

  for (const model of [NotificationDelivery, Student, Notification, User]) {
    const missing = await missingIndexes(model);
    if (!missing.length) {
      console.log(`${model.collection.name}: indexes up to date`);
      continue;
    }
    for (const [key, options] of missing) {
      console.log(`${model.collection.name}: ${APPLY ? "creating" : "would create"} index ${JSON.stringify(key)}${options?.unique ? " (unique)" : ""}`);
      if (APPLY) await model.collection.createIndex(key, options);
    }
  }
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(`Migration failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

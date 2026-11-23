import os from "os";
import mongoose from "mongoose";

/**
 * A lease-based lock in MongoDB so a scheduled job runs on exactly one
 * process, however many API instances (or cluster workers) are running.
 *
 * Every instance schedules the same cron ticks. At each tick they all race
 * to take the lease for that job; the first one wins and runs it, the others
 * see the lease held and skip. The lease is not released early on purpose:
 * holding it for `ttlMs` also covers an instance whose clock is a little
 * behind and fires the "same" tick a few seconds later.
 *
 * Choose `ttlMs` shorter than the job's interval and longer than any
 * plausible clock skew between hosts.
 */

const jobLockSchema = new mongoose.Schema(
  {
    _id: String, // job name
    lockedUntil: { type: Date, required: true },
    owner: String,
  },
  { versionKey: false, collection: "joblocks" }
);

const JobLock = mongoose.models.JobLock || mongoose.model("JobLock", jobLockSchema);

/** Identifies this process in the lock document, for debugging. */
export const INSTANCE_ID = `${os.hostname()}:${process.pid}`;

/**
 * Try to take the lease for `name`. Resolves true if this process now holds
 * it, false if another process does.
 */
export const acquireLease = async (name, ttlMs, now = new Date()) => {
  try {
    const doc = await JobLock.findOneAndUpdate(
      { _id: name, lockedUntil: { $lte: now } },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs), owner: INSTANCE_ID } },
      { upsert: true, new: true }
    );
    return doc?.owner === INSTANCE_ID;
  } catch (err) {
    // The filter missed because the lease is still held, so the upsert tried
    // to insert a second document with the same _id: someone else has it.
    if (err.code === 11000) return false;
    throw err;
  }
};

/** Run `fn` only if this process wins the lease for `name`. */
export const runExclusive = async (name, ttlMs, fn) => {
  if (!(await acquireLease(name, ttlMs))) return undefined;
  return fn();
};

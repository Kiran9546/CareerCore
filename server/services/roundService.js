import mongoose from "mongoose";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import RoundResult from "../models/RoundResult.js";
import Student from "../models/Student.js";
import "../models/User.js";
import {
  ATTENDANCE,
  ROUND_RESULT,
  ROUND_STATUS,
  ROUND_TYPES,
  ROUND_TYPE_LABEL,
  REGISTRATION_STATUS,
  MANAGED_DRIVE_STATUS,
  STAGE_STATUS,
  FINAL_STATUS,
  ATTEMPT_STAGES,
  MAX_PAGE_SIZE,
} from "../config/constants.js";
import { audit, auditMany, httpError } from "./auditService.js";
import { notifyOnceMany, onlyDuplicateKeyErrors } from "./notificationService.js";
import { escapeRegex } from "../utils/escapeRegex.js";

/**
 * CareerCore — Rounds, attendance, results and progression
 * ========================================================
 *
 * PROGRESSION RULE: the participant list of round N+1 is derived from the
 * persisted results of round N and nothing else. When round N is finalized
 * every student whose result is `passed` gets a RoundResult in round N+1;
 * failed, absent and unresolved students do not. Round 1 is derived the same
 * way from the drive's valid registrations.
 *
 * Every derivation is an upsert keyed on (roundId, studentId), backed by a
 * unique index, so repeating it — a retried request, a double click, two
 * officers at once — cannot create a second entry.
 *
 * FINALIZE is guarded without multi-document transactions (so it also works
 * on a standalone development MongoDB): the round's status is flipped with a
 * conditional update that only one request can win, the round's results are
 * then locked, completeness is re-checked against the locked documents, and
 * the progression steps that follow are idempotent so a crash part-way can be
 * completed by finalizing again.
 */

const roundName = (round) => ROUND_TYPE_LABEL[round.type] || round.type;
const withName = (round) => ({ _id: round._id, type: round.type, name: roundName(round) });

export const findRound = (drive, roundId) => {
  if (!mongoose.isValidObjectId(roundId)) throw httpError(400, "Invalid round");
  const rounds = drive.orderedRounds();
  const index = rounds.findIndex((r) => String(r._id) === String(roundId));
  if (index === -1) throw httpError(404, "Round not found on this drive");
  return { round: rounds[index], index, rounds, isLast: index === rounds.length - 1 };
};

const formatSchedule = (round) => {
  const s = round.schedule || {};
  if (!s.date) return "Schedule to be announced.";
  const parts = [
    `Date: ${new Date(s.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`,
  ];
  if (s.startTime) parts.push(`Time: ${s.startTime}${s.endTime ? `–${s.endTime}` : ""}`);
  if (s.mode === "online") parts.push("Mode: Online (link on the drive page)");
  else if (s.venue) parts.push(`Venue: ${s.venue}`);
  return parts.join(" · ");
};

// ─────────────────────────────────────────────────────────────
// PARTICIPANT SEEDING
// ─────────────────────────────────────────────────────────────

/** Registrations that may enter round 1: registered, not withdrawn, and not
 *  flagged ineligible unless an officer overrode the flag. */
const roundOneSource = (driveId) => ({
  driveId,
  registrationStatus: REGISTRATION_STATUS.REGISTERED,
  $or: [
    { "eligibilityFlag.ineligibleSince": { $exists: false } },
    { "eligibilityFlag.overriddenAt": { $exists: true } },
  ],
});

/**
 * Derive the participant list of one round and persist it. Returns the
 * number of students newly entered (0 on a repeat call).
 */
export const seedRoundParticipants = async (drive, roundIndex) => {
  const rounds = drive.orderedRounds();
  const round = rounds[roundIndex];
  if (!round) return 0;

  let sources;
  if (roundIndex === 0) {
    sources = await DriveParticipation.find(roundOneSource(drive._id)).select("_id studentId").lean();
    sources = sources.map((p) => ({ studentId: p.studentId, participationId: p._id }));
  } else {
    const previous = rounds[roundIndex - 1];
    if (previous.status !== ROUND_STATUS.FINALIZED) {
      throw httpError(409, `${roundName(previous)} must be finalized before ${roundName(round)} can start`);
    }
    sources = await RoundResult.find({
      roundId: previous._id,
      attendance: ATTENDANCE.APPEARED,
      result: ROUND_RESULT.PASSED,
      locked: true,
    })
      .select("studentId participationId")
      .lean();
  }

  const students = await Student.find({ _id: { $in: sources.map((s) => s.studentId) } })
    .select("usn branch cgpa backlogs userId")
    .populate("userId", "name")
    .lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));

  const ops = sources
    .filter((s) => byId.has(String(s.studentId)))
    .map((s) => {
      const st = byId.get(String(s.studentId));
      return {
        updateOne: {
          filter: { roundId: round._id, studentId: s.studentId },
          update: {
            $setOnInsert: {
              driveId: drive._id,
              roundId: round._id,
              roundOrder: round.order,
              roundType: round.type,
              studentId: s.studentId,
              participationId: s.participationId,
              attendance: ATTENDANCE.UNMARKED,
              result: ROUND_RESULT.PENDING,
              locked: false,
              student: { name: st.userId?.name, usn: st.usn, branch: st.branch, cgpa: st.cgpa, backlogs: st.backlogs },
              history: [],
            },
          },
          upsert: true,
        },
      };
    });

  let inserted = 0;
  let upsertedIds = {};
  if (ops.length) {
    try {
      const r = await RoundResult.bulkWrite(ops, { ordered: false });
      inserted = r.upsertedCount ?? 0;
      upsertedIds = r.upsertedIds ?? {};
    } catch (err) {
      // A concurrent seed won the race for some students — those rows exist,
      // which is exactly the state we wanted.
      if (!onlyDuplicateKeyErrors(err)) throw err;
      inserted = err.result?.upsertedCount ?? 0;
      upsertedIds = err.result?.upsertedIds ?? {};
    }
  }

  await Drive.updateOne(
    { _id: drive._id, "rounds._id": round._id },
    { $set: { "rounds.$.participantsSeededAt": new Date() } },
  );
  round.participantsSeededAt = new Date();

  // Tell the students who were just entered. Keyed per round and student.
  const newlyEntered = Object.keys(upsertedIds).map((i) => ops[Number(i)].updateOne.filter.studentId);
  const items = newlyEntered
    .map((sid) => byId.get(String(sid)))
    .filter((st) => st?.userId?._id)
    .map((st) => ({
      dedupeKey: `round:${round._id}:entered:${st._id}`,
      userId: st.userId._id,
      type: "placement_update",
      title:
        roundIndex === 0
          ? `${drive.companyName}: ${roundName(round)}`
          : `Congratulations! You qualified for the ${roundName(round)}`,
      body:
        (roundIndex === 0
          ? `You are in the first round of the ${drive.role} drive at ${drive.companyName}. `
          : `You have qualified for the ${roundName(round)} at ${drive.companyName} (${drive.role}). `) +
        formatSchedule(round),
      link: `/student/drives/${drive._id}`,
      metadata: { driveId: drive._id, roundId: round._id, kind: "round_entered" },
    }));
  await notifyOnceMany(items);

  return inserted;
};

// ─────────────────────────────────────────────────────────────
// LISTING
// ─────────────────────────────────────────────────────────────


/** Mongo filter for a round's participant list from query/body filters. */
export const roundFilter = (roundId, f = {}) => {
  const filter = { roundId };
  if (f.q) {
    const rx = new RegExp(escapeRegex(String(f.q).trim()), "i");
    filter.$or = [{ "student.name": rx }, { "student.usn": rx }];
  }
  if (f.branch) filter["student.branch"] = String(f.branch);
  if (f.attendance && Object.values(ATTENDANCE).includes(f.attendance)) filter.attendance = f.attendance;
  if (f.result && Object.values(ROUND_RESULT).includes(f.result)) filter.result = f.result;
  if (f.minCgpa !== undefined && f.minCgpa !== "" && Number.isFinite(Number(f.minCgpa))) {
    filter["student.cgpa"] = { $gte: Number(f.minCgpa) };
  }
  if (f.maxBacklogs !== undefined && f.maxBacklogs !== "" && Number.isFinite(Number(f.maxBacklogs))) {
    filter["student.backlogs"] = { $lte: Number(f.maxBacklogs) };
  }
  return filter;
};

export const pageParams = (q = {}) => {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), MAX_PAGE_SIZE);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, page, skip: (page - 1) * limit };
};

/** Paginated participants of one round plus its counts. */
export const listRoundParticipants = async (drive, roundId, query) => {
  const { round, index, isLast } = findRound(drive, roundId);
  const { limit, page, skip } = pageParams(query);
  const filter = roundFilter(round._id, query);

  const [rows, total, counts] = await Promise.all([
    RoundResult.find(filter).sort({ "student.usn": 1 }).skip(skip).limit(limit).select("-history").lean(),
    RoundResult.countDocuments(filter),
    roundCounts(round._id),
  ]);

  return {
    round: { ...round.toObject(), name: roundName(round), index, isLast },
    participants: rows,
    total,
    page,
    limit,
    counts,
  };
};

export const roundCounts = async (roundId) => {
  const rows = await RoundResult.aggregate([
    { $match: { roundId: new mongoose.Types.ObjectId(String(roundId)) } },
    { $group: { _id: { a: "$attendance", r: "$result" }, n: { $sum: 1 } } },
  ]);
  const c = { participants: 0, appeared: 0, absent: 0, unmarked: 0, passed: 0, failed: 0, pending: 0 };
  for (const { _id, n } of rows) {
    c.participants += n;
    c[_id.a] += n;
    if (_id.a === ATTENDANCE.APPEARED) c[_id.r] += n;
  }
  // Results still to record = appeared but no result yet.
  return c;
};

// ─────────────────────────────────────────────────────────────
// ATTENDANCE & RESULTS
// ─────────────────────────────────────────────────────────────

const assertRoundWritable = (drive, round) => {
  if (drive.status !== MANAGED_DRIVE_STATUS.IN_PROGRESS) {
    throw httpError(409, "Attendance and results can only be recorded while the drive is in progress");
  }
  if (round.status === ROUND_STATUS.FINALIZED) {
    throw httpError(409, `${roundName(round)} is finalized. Its results are read-only`);
  }
  if (!round.participantsSeededAt) {
    throw httpError(409, `${roundName(round)} has not started yet. Finalize the previous round first`);
  }
};

/**
 * Resolve which round entries a bulk action targets: explicit student ids,
 * or "everything matching these filters" for Select All across pages.
 * Rejects the whole request if any id is not a participant of this round.
 */
const resolveTargets = async (round, { studentIds, all, filter }) => {
  if (all) {
    return RoundResult.find(roundFilter(round._id, filter || {}))
      .select("_id studentId attendance result locked student.usn")
      .lean();
  }
  const ids = (Array.isArray(studentIds) ? studentIds : []).filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) throw httpError(400, "Select at least one student");
  const docs = await RoundResult.find({ roundId: round._id, studentId: { $in: ids } })
    .select("_id studentId attendance result locked student.usn")
    .lean();
  const unique = new Set(ids.map(String));
  if (docs.length !== unique.size) {
    throw httpError(
      400,
      `${unique.size - docs.length} of the selected students are not participants of ${roundName(round)}`,
    );
  }
  return docs;
};

/**
 * Apply one field change to many entries with optimistic concurrency: each
 * update only lands if the entry is unlocked and still holds the value we
 * read, and the history entry records exactly that transition.
 */
const applyChange = async (docs, field, to, actor, extraSet = () => ({})) => {
  const changing = docs.filter((d) => d[field] !== to);
  if (!changing.length) return [];
  const now = new Date();
  const ops = changing.map((d) => {
    const extra = extraSet(d);
    const history = [{ field, from: d[field], to, at: now, by: actor._id }];
    if (extra.result !== undefined && extra.result !== d.result) {
      history.push({ field: "result", from: d.result, to: extra.result, at: now, by: actor._id, note: `cleared, marked ${to}` });
    }
    return {
      updateOne: {
        filter: { _id: d._id, locked: false, [field]: d[field] },
        update: { $set: { [field]: to, updatedBy: actor._id, ...extra }, $push: { history: { $each: history } } },
      },
    };
  });
  await RoundResult.bulkWrite(ops, { ordered: false });

  // Report only what actually changed (a concurrent finalize or edit may
  // have won for some entries).
  const after = await RoundResult.find({ _id: { $in: changing.map((d) => d._id) } }).select(`_id ${field}`).lean();
  const landed = new Set(after.filter((a) => a[field] === to).map((a) => String(a._id)));
  return changing.filter((d) => landed.has(String(d._id)));
};

export const recordAttendance = async (drive, roundId, body, actor) => {
  const { round } = findRound(drive, roundId);
  assertRoundWritable(drive, round);

  const attendance = body.attendance;
  if (!Object.values(ATTENDANCE).includes(attendance)) {
    throw httpError(400, `attendance must be one of: ${Object.values(ATTENDANCE).join(", ")}`);
  }

  const docs = await resolveTargets(round, body);
  if (docs.some((d) => d.locked)) throw httpError(409, `${roundName(round)} is finalized. Its results are read-only`);

  // Absent or unmarked students cannot hold a result, so one recorded
  // earlier is cleared (and the clearing is logged).
  const changed = await applyChange(docs, "attendance", attendance, actor, () =>
    attendance === ATTENDANCE.APPEARED ? {} : { result: ROUND_RESULT.PENDING },
  );

  await auditMany(
    actor,
    "round.attendance_changed",
    changed.map((d) => ({ studentId: d.studentId, studentUsn: d.student?.usn, from: d.attendance, to: attendance })),
    { drive, round: withName(round) },
  );

  return { updated: changed.length, unchanged: docs.length - changed.length, counts: await roundCounts(round._id) };
};

export const recordResults = async (drive, roundId, body, actor) => {
  const { round } = findRound(drive, roundId);
  assertRoundWritable(drive, round);

  const result = body.result;
  if (!Object.values(ROUND_RESULT).includes(result)) {
    throw httpError(400, `Invalid result. Must be one of: ${Object.values(ROUND_RESULT).join(", ")}`);
  }

  const docs = await resolveTargets(round, body);
  if (docs.some((d) => d.locked)) throw httpError(409, `${roundName(round)} is finalized. Its results are read-only`);

  // Attendance first: a result for a student not marked Appeared is refused.
  const notAppeared = docs.filter((d) => d.attendance !== ATTENDANCE.APPEARED);
  if (notAppeared.length) {
    throw httpError(
      400,
      `${notAppeared.length} of the selected students are not marked Appeared. Record attendance before results`,
    );
  }

  const changed = await applyChange(docs, "result", result, actor);
  await auditMany(
    actor,
    "round.result_changed",
    changed.map((d) => ({ studentId: d.studentId, studentUsn: d.student?.usn, from: d.result, to: result })),
    { drive, round: withName(round) },
  );

  return { updated: changed.length, unchanged: docs.length - changed.length, counts: await roundCounts(round._id) };
};

// ─────────────────────────────────────────────────────────────
// FINALIZE / REOPEN
// ─────────────────────────────────────────────────────────────

const incompleteReason = async (roundId) => {
  const c = await roundCounts(roundId);
  if (c.unmarked > 0) return `${c.unmarked} student(s) have no attendance recorded`;
  if (c.pending > 0) return `${c.pending} student(s) marked Appeared have no result`;
  return null;
};

/**
 * Finalize a round: lock its results, then progress the passes. Calling it
 * again on a finalized round re-runs only the idempotent progression steps
 * and reports `alreadyFinalized`.
 */
export const finalizeRound = async (drive, roundId, actor) => {
  const { round, index, isLast } = findRound(drive, roundId);

  if (drive.status !== MANAGED_DRIVE_STATUS.IN_PROGRESS) {
    throw httpError(409, "Rounds can only be finalized while the drive is in progress");
  }

  let alreadyFinalized = round.status === ROUND_STATUS.FINALIZED;

  if (!alreadyFinalized) {
    if (!round.participantsSeededAt) {
      throw httpError(409, `${roundName(round)} has not started yet`);
    }
    const reason = await incompleteReason(round._id);
    if (reason) throw httpError(409, `Cannot finalize ${roundName(round)}: ${reason}`);

    const now = new Date();
    const flip = await Drive.updateOne(
      { _id: drive._id, rounds: { $elemMatch: { _id: round._id, status: { $ne: ROUND_STATUS.FINALIZED } } } },
      { $set: { "rounds.$.status": ROUND_STATUS.FINALIZED, "rounds.$.finalizedAt": now, "rounds.$.finalizedBy": actor._id } },
    );

    if (flip.modifiedCount === 0) {
      alreadyFinalized = true; // another request won
    } else {
      await RoundResult.updateMany({ roundId: round._id }, { $set: { locked: true } });

      // A write that slipped in between the check and the lock would show up
      // here. Undo and report rather than progress an incomplete round.
      const late = await incompleteReason(round._id);
      if (late) {
        await RoundResult.updateMany({ roundId: round._id }, { $set: { locked: false } });
        await Drive.updateOne(
          { _id: drive._id, "rounds._id": round._id },
          { $set: { "rounds.$.status": round.schedule?.date ? ROUND_STATUS.SCHEDULED : ROUND_STATUS.PENDING }, $unset: { "rounds.$.finalizedAt": "", "rounds.$.finalizedBy": "" } },
        );
        throw httpError(409, `Cannot finalize ${roundName(round)}: ${late}`);
      }

      round.status = ROUND_STATUS.FINALIZED;
      round.finalizedAt = now;
      round.finalizedBy = actor._id;
    }
  } else {
    // Make sure the lock is in place on a retry after a crash.
    await RoundResult.updateMany({ roundId: round._id, locked: false }, { $set: { locked: true } });
  }

  // Reload so the in-memory drive reflects the finalized state.
  const fresh = await Drive.findById(drive._id);
  const counts = await roundCounts(round._id);
  let progressed = 0;

  if (!isLast) {
    progressed = await seedRoundParticipants(fresh, index + 1);
  }

  const participants = await RoundResult.find({ roundId: round._id }).select("studentId").lean();
  await syncLegacyStages(fresh, participants.map((p) => p.studentId), actor);

  if (isLast) await notifySelections(fresh, round);

  if (!alreadyFinalized) {
    await audit(actor, "round.finalized", {
      drive: fresh,
      round: withName(round),
      to: { ...counts, progressed: isLast ? undefined : progressed, selected: isLast ? counts.passed : undefined },
    });
  }

  return {
    alreadyFinalized,
    counts,
    progressed: isLast ? 0 : counts.passed,
    newlyEntered: progressed,
    selected: isLast ? counts.passed : undefined,
    nextRound: isLast ? null : withName(fresh.orderedRounds()[index + 1]),
  };
};

const notifySelections = async (drive, round) => {
  const selected = await RoundResult.find({ roundId: round._id, result: ROUND_RESULT.PASSED, locked: true })
    .select("studentId")
    .lean();
  const students = await Student.find({ _id: { $in: selected.map((s) => s.studentId) } }).select("userId").lean();
  await notifyOnceMany(
    students
      .filter((s) => s.userId)
      .map((s) => ({
        dedupeKey: `drive:${drive._id}:selected:${s._id}`,
        userId: s.userId,
        type: "placement_update",
        title: `Selected: ${drive.companyName}`,
        body: `Congratulations! You have been selected for ${drive.role} at ${drive.companyName}.`,
        link: `/student/drives/${drive._id}`,
        metadata: { driveId: drive._id, kind: "selected" },
      })),
  );
};

/**
 * Reopen a finalized round (authorised roles only — enforced at the route).
 *
 * Refused while the following round holds recorded attendance or results,
 * so reopening can never orphan downstream records: those have to be
 * reopened or cleared first. Entries the next round received automatically
 * and that carry nothing recorded are removed, and are derived again when
 * this round is finalized once more. Reopening the last round reverts the
 * final selections it produced; their history is kept on the participation.
 */
export const reopenRound = async (drive, roundId, reason, actor) => {
  const { round, index, rounds, isLast } = findRound(drive, roundId);

  if (!reason || !String(reason).trim()) throw httpError(400, "A reason is required to reopen a finalized round");
  if (round.status !== ROUND_STATUS.FINALIZED) throw httpError(409, `${roundName(round)} is not finalized`);
  if (drive.status !== MANAGED_DRIVE_STATUS.IN_PROGRESS) {
    throw httpError(409, "Rounds can only be reopened while the drive is in progress");
  }

  let removedDownstream = 0;
  const next = rounds[index + 1];
  if (next) {
    if (next.status === ROUND_STATUS.FINALIZED) {
      throw httpError(409, `${roundName(next)} is already finalized. Reopen it first`);
    }
    const touched = await RoundResult.countDocuments({
      roundId: next._id,
      $or: [{ attendance: { $ne: ATTENDANCE.UNMARKED } }, { result: { $ne: ROUND_RESULT.PENDING } }],
    });
    if (touched > 0) {
      throw httpError(
        409,
        `${roundName(next)} already has ${touched} recorded attendance/result entr${touched === 1 ? "y" : "ies"}. Clear them before reopening ${roundName(round)}`,
      );
    }
    const del = await RoundResult.deleteMany({ roundId: next._id });
    removedDownstream = del.deletedCount ?? 0;
    await Drive.updateOne(
      { _id: drive._id, "rounds._id": next._id },
      { $unset: { "rounds.$.participantsSeededAt": "" } },
    );
  }

  const flip = await Drive.updateOne(
    { _id: drive._id, rounds: { $elemMatch: { _id: round._id, status: ROUND_STATUS.FINALIZED } } },
    {
      $set: { "rounds.$.status": round.schedule?.date ? ROUND_STATUS.SCHEDULED : ROUND_STATUS.PENDING },
      $unset: { "rounds.$.finalizedAt": "", "rounds.$.finalizedBy": "" },
      $inc: { "rounds.$.reopenCount": 1 },
    },
  );
  if (flip.modifiedCount === 0) throw httpError(409, `${roundName(round)} is not finalized`);

  await RoundResult.updateMany({ roundId: round._id }, { $set: { locked: false } });

  const fresh = await Drive.findById(drive._id);
  const participants = await RoundResult.find({ roundId: round._id }).select("studentId").lean();
  const reverted = await syncLegacyStages(fresh, participants.map((p) => p.studentId), actor, {
    note: `Round reopened: ${String(reason).trim()}`,
  });

  await audit(actor, "round.reopened", {
    drive: fresh,
    round: withName(round),
    from: ROUND_STATUS.FINALIZED,
    to: fresh.orderedRounds()[index].status,
    note: String(reason).trim(),
  });
  if (isLast && reverted.finalReverted) {
    await audit(actor, "final_selection.reverted", {
      drive: fresh,
      round: withName(round),
      studentCount: reverted.finalReverted,
      note: String(reason).trim(),
    });
  }

  return { reopened: true, removedDownstream, finalSelectionsReverted: reverted.finalReverted };
};

// ─────────────────────────────────────────────────────────────
// LEGACY STAGE MIRROR
// ─────────────────────────────────────────────────────────────

const LEGACY_OF = Object.fromEntries(ROUND_TYPES.map((r) => [r.code, r.legacyStage]));

/** The four legacy stages a managed drive's rounds cover, in canonical order. */
export const legacyStagesFor = (roundTypes) => {
  const covered = new Set(roundTypes.map((t) => LEGACY_OF[t]));
  return [...ATTEMPT_STAGES.filter((s) => covered.has(s)), "final"];
};

/**
 * Mirror finalized round outcomes onto DriveParticipation.stages so the
 * placement profile, rule engine, cohort overview and export — which all
 * read the four legacy stages — include managed drives without a second
 * calculation path.
 *
 * Per legacy stage, walk the finalized rounds mapped to it in order: a pass
 * records passed, a fail records failed and stops, an absence stops without
 * recording an attempt (the student never sat it — the existing model's
 * `not_reached`). The final stage is selected/rejected from the last round.
 */
export const syncLegacyStages = async (drive, studentIds, actor, { note } = {}) => {
  const rounds = drive.orderedRounds();
  const finalized = rounds.filter((r) => r.status === ROUND_STATUS.FINALIZED);
  const last = rounds[rounds.length - 1];
  const lastFinalized = last && last.status === ROUND_STATUS.FINALIZED;

  const [participations, results] = await Promise.all([
    DriveParticipation.find({ driveId: drive._id, studentId: { $in: studentIds } }),
    RoundResult.find({ driveId: drive._id, studentId: { $in: studentIds } }).select("studentId roundId attendance result").lean(),
  ]);

  const byStudent = new Map();
  for (const r of results) {
    const k = String(r.studentId);
    if (!byStudent.has(k)) byStudent.set(k, new Map());
    byStudent.get(k).set(String(r.roundId), r);
  }

  let finalReverted = 0;
  for (const p of participations) {
    const mine = byStudent.get(String(p.studentId)) ?? new Map();
    let dirty = false;

    for (const stage of ATTEMPT_STAGES) {
      let status = STAGE_STATUS.NOT_REACHED;
      for (const r of finalized) {
        if (LEGACY_OF[r.type] !== stage) continue;
        const entry = mine.get(String(r._id));
        if (!entry) break;
        if (entry.attendance !== ATTENDANCE.APPEARED) break;
        if (entry.result === ROUND_RESULT.PASSED) status = STAGE_STATUS.PASSED;
        else if (entry.result === ROUND_RESULT.FAILED) {
          status = STAGE_STATUS.FAILED;
          break;
        }
      }
      if ((p.stages[stage]?.status ?? STAGE_STATUS.NOT_REACHED) !== status) {
        p.applyStageResult(stage, { status, note }, actor?._id);
        dirty = true;
      }
    }

    let finalStatus = FINAL_STATUS.NOT_REACHED;
    if (lastFinalized) {
      const entry = mine.get(String(last._id));
      if (entry?.attendance === ATTENDANCE.APPEARED) {
        finalStatus = entry.result === ROUND_RESULT.PASSED ? FINAL_STATUS.SELECTED : FINAL_STATUS.REJECTED;
      }
    }
    const currentFinal = p.stages.final?.status ?? FINAL_STATUS.NOT_REACHED;
    if (currentFinal !== finalStatus) {
      const offer =
        finalStatus === FINAL_STATUS.SELECTED && !p.stages.final?.offer?.offerDate
          ? {
              ctc: drive.ctc,
              role: drive.role,
              location: drive.location,
              offerDate: last.finalizedAt || new Date(),
              status: "pending",
              accepted: false,
            }
          : undefined;
      if (currentFinal === FINAL_STATUS.SELECTED) finalReverted++;
      p.applyStageResult("final", { status: finalStatus, note, offer }, actor?._id);
      dirty = true;
    }

    if (dirty) await p.save();
  }

  return { finalReverted };
};

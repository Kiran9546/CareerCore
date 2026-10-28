import mongoose from "mongoose";
import Company, { companyNameKey } from "../models/Company.js";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import DriveCandidate from "../models/DriveCandidate.js";
import RoundResult from "../models/RoundResult.js";
import Student from "../models/Student.js";
import InterviewTemplate from "../models/InterviewTemplate.js";
import PlacementSetting from "../models/PlacementSetting.js";
import {
  DRIVE_WORKFLOW,
  MANAGED_DRIVE_STATUS,
  MANAGED_STATUS_TRANSITIONS,
  ROUND_TYPE_CODES,
  ROUND_TYPE_LABEL,
  ROUND_STATUS,
  ROUND_MODES,
  REGISTRATION_STATUS,
  FINAL_STATUS,
  PARTICIPATION_POLICY,
  DEFAULT_PARTICIPATION_POLICY,
  DEFAULT_INTERVIEW_TEMPLATES,
  OFFER_STATUS,
} from "../config/constants.js";
import { audit, httpError } from "./auditService.js";
import {
  calculateEligibility,
  evaluateStudent,
  notifyEligibleStudents,
  parseEligibilityInput,
} from "./eligibilityService.js";
import { legacyStagesFor, seedRoundParticipants } from "./roundService.js";
import { notifyOnceMany } from "./notificationService.js";
import { escapeRegex } from "../utils/escapeRegex.js";

/**
 * CareerCore — Managed recruitment workflow
 * =========================================
 *
 * Drive lifecycle, round configuration, cloning, student registration and the
 * participation policy. Every rule here is enforced on the server; the UI
 * only mirrors it so the officer is not fighting the API.
 */

const toNum = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));

const parseDate = (v, label) => {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw httpError(400, `${label} is not a valid date`);
  return d;
};

export const assertManaged = (drive) => {
  if (!drive) throw httpError(404, "Drive not found");
  if (drive.workflow !== DRIVE_WORKFLOW.MANAGED) {
    throw httpError(409, "This drive was recorded with the original results flow and does not run the recruitment workflow");
  }
};

export const loadManagedDrive = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid drive");
  const drive = await Drive.findById(id);
  assertManaged(drive);
  return drive;
};

// ─────────────────────────────────────────────────────────────
// COMPANIES
// ─────────────────────────────────────────────────────────────

export const createCompany = async (body, actor) => {
  const name = String(body.name || "").trim();
  if (!name) throw httpError(400, "Company name is required");
  if (name.length > 120) throw httpError(400, "Company name must be 120 characters or fewer");

  const key = companyNameKey(name);
  const existing = await Company.findOne({ $or: [{ nameKey: key }, { name: new RegExp(`^${escapeRegex(name)}$`, "i") }] })
    .select("name")
    .lean();
  if (existing) {
    throw httpError(409, `Company already exists: ${existing.name}. Select it from the list instead.`, {
      companyId: existing._id,
    });
  }

  try {
    const company = await Company.create({
      name,
      industry: body.industry,
      website: body.website,
      location: body.location,
      description: body.description,
      source: "placement_cell",
      createdBy: actor._id,
    });
    await audit(actor, "company.created", { companyId: company._id, companyName: company.name });
    return company;
  } catch (err) {
    if (err.code === 11000) throw httpError(409, `Company already exists: ${name}. Select it from the list instead.`);
    throw err;
  }
};

// ─────────────────────────────────────────────────────────────
// ROUNDS
// ─────────────────────────────────────────────────────────────

/** A round is locked once it has participants or is finalized: its type and
 *  position can no longer change. */
const isLockedRound = (r) => r.status === ROUND_STATUS.FINALIZED || Boolean(r.participantsSeededAt);

/**
 * Validate a requested round list ([{ _id?, type }], in order) against the
 * drive's current rounds. New rounds may be added and unstarted rounds
 * removed or reordered at any time before completion; rounds that have
 * started keep their place.
 */
const buildRounds = (drive, requested) => {
  if (!Array.isArray(requested) || !requested.length) {
    throw httpError(400, "No interview process selected — choose at least one round");
  }
  const types = requested.map((r) => (typeof r === "string" ? r : r?.type));
  const invalid = types.filter((t) => !ROUND_TYPE_CODES.includes(t));
  if (invalid.length) throw httpError(400, `Unknown round type: ${invalid.join(", ")}`);
  const dupes = types.filter((t, i) => types.indexOf(t) !== i);
  if (dupes.length) throw httpError(400, `Duplicate round: ${ROUND_TYPE_LABEL[dupes[0]]} is selected more than once`);

  const current = drive.orderedRounds();
  const byId = new Map(current.map((r) => [String(r._id), r]));
  const locked = current.filter(isLockedRound);

  const next = requested.map((r, i) => {
    const type = types[i];
    const id = typeof r === "object" && r?._id ? String(r._id) : null;
    const existing = (id && byId.get(id)) || current.find((c) => c.type === type);
    if (existing && existing.type === type) {
      const obj = existing.toObject();
      return { ...obj, order: i + 1 };
    }
    return { type, order: i + 1, status: ROUND_STATUS.PENDING };
  });

  locked.forEach((r, i) => {
    const at = next[i];
    if (!at || String(at._id) !== String(r._id)) {
      throw httpError(
        409,
        `${ROUND_TYPE_LABEL[r.type]} has already started — it cannot be removed or moved. Change only the rounds after it.`,
      );
    }
  });

  return next;
};

export const configureRounds = async (drive, requested, actor) => {
  if ([MANAGED_DRIVE_STATUS.COMPLETED, MANAGED_DRIVE_STATUS.CANCELLED].includes(drive.status)) {
    throw httpError(409, `The interview process of a ${drive.status} drive cannot be changed`);
  }
  const before = drive.orderedRounds().map((r) => r.type);
  const next = buildRounds(drive, requested);
  drive.rounds = next;
  drive.stages = legacyStagesFor(next.map((r) => r.type));
  await drive.save();

  const after = drive.orderedRounds().map((r) => r.type);
  if (before.join() !== after.join()) {
    await audit(actor, "rounds.configured", { drive, from: before, to: after });
  }
  return drive;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const scheduleRound = async (drive, roundId, body, actor) => {
  if ([MANAGED_DRIVE_STATUS.COMPLETED, MANAGED_DRIVE_STATUS.CANCELLED].includes(drive.status)) {
    throw httpError(409, `Rounds of a ${drive.status} drive cannot be rescheduled`);
  }
  const rounds = drive.orderedRounds();
  const index = rounds.findIndex((r) => String(r._id) === String(roundId));
  if (index === -1) throw httpError(404, "Round not found on this drive");
  const round = rounds[index];
  if (round.status === ROUND_STATUS.FINALIZED) throw httpError(409, "A finalized round cannot be rescheduled");

  const date = parseDate(body.date, "Round date");
  if (!date) throw httpError(400, "Round date is required");
  const { startTime, endTime } = body;
  if (!startTime || !TIME.test(startTime)) throw httpError(400, "Start time must be HH:MM");
  if (endTime && !TIME.test(endTime)) throw httpError(400, "End time must be HH:MM");
  if (endTime && endTime <= startTime) throw httpError(400, "End time must be after the start time");
  const mode = body.mode || "offline";
  if (!ROUND_MODES.includes(mode)) throw httpError(400, `Mode must be one of: ${ROUND_MODES.join(", ")}`);
  const venue = String(body.venue || "").trim();
  const meetingLink = String(body.meetingLink || "").trim();
  if (mode === "offline" && !venue) throw httpError(400, "Venue is required for an offline round");
  if (mode === "online") {
    if (!meetingLink) throw httpError(400, "Meeting link is required for an online round");
    if (!/^https?:\/\/\S+$/i.test(meetingLink)) throw httpError(400, "Meeting link must be an http(s) URL");
  }

  // Rounds run in order: a round cannot be dated before the one before it,
  // or after the one after it.
  const day = (d) => new Date(d).toISOString().slice(0, 10);
  const prev = rounds[index - 1]?.schedule?.date;
  const nextDate = rounds[index + 1]?.schedule?.date;
  if (prev && day(date) < day(prev)) {
    throw httpError(400, `${ROUND_TYPE_LABEL[round.type]} cannot be scheduled before ${ROUND_TYPE_LABEL[rounds[index - 1].type]}`);
  }
  if (nextDate && day(date) > day(nextDate)) {
    throw httpError(400, `${ROUND_TYPE_LABEL[round.type]} cannot be scheduled after ${ROUND_TYPE_LABEL[rounds[index + 1].type]}`);
  }

  const before = round.schedule?.date ? round.toObject().schedule : null;
  round.schedule = {
    date,
    startTime,
    endTime: endTime || undefined,
    mode,
    venue: venue || undefined,
    meetingLink: mode === "online" ? meetingLink : undefined,
    instructions: String(body.instructions || "").trim() || undefined,
  };
  if (round.status === ROUND_STATUS.PENDING) round.status = ROUND_STATUS.SCHEDULED;
  await drive.save();

  await audit(actor, before ? "round.rescheduled" : "round.scheduled", {
    drive,
    round: { _id: round._id, name: ROUND_TYPE_LABEL[round.type] },
    from: before,
    to: round.toObject().schedule,
  });

  // A reschedule of a round students are already in reaches them.
  if (before && round.participantsSeededAt) {
    const entries = await RoundResult.find({ roundId: round._id }).select("studentId").lean();
    const students = await Student.find({ _id: { $in: entries.map((e) => e.studentId) } }).select("userId").lean();
    const stamp = Date.now();
    await notifyOnceMany(
      students.filter((s) => s.userId).map((s) => ({
        dedupeKey: `round:${round._id}:schedule:${stamp}:${s._id}`,
        userId: s.userId,
        type: "placement_update",
        title: `${drive.companyName} — ${ROUND_TYPE_LABEL[round.type]} rescheduled`,
        body: `New schedule: ${date.toLocaleDateString("en-IN", { day: "numeric", month: "long" })} at ${startTime}.`,
        link: `/student/drives/${drive._id}`,
        metadata: { driveId: drive._id, roundId: round._id, kind: "rescheduled" },
      })),
    );
  }

  return drive;
};

export const ensureDefaultTemplates = async () => {
  if ((await InterviewTemplate.estimatedDocumentCount()) > 0) return;
  await InterviewTemplate.bulkWrite(
    DEFAULT_INTERVIEW_TEMPLATES.map((t) => ({
      updateOne: { filter: { key: t.key }, update: { $setOnInsert: t }, upsert: true },
    })),
    { ordered: false },
  ).catch((err) => {
    if (err.code !== 11000) throw err;
  });
};

// ─────────────────────────────────────────────────────────────
// DRIVES
// ─────────────────────────────────────────────────────────────

const resolveCompany = async (companyId) => {
  if (!companyId || !mongoose.isValidObjectId(companyId)) throw httpError(400, "Invalid company — select a company");
  const company = await Company.findById(companyId).select("name");
  if (!company) throw httpError(400, "Invalid company — it does not exist");
  return company;
};

const validateDates = ({ driveDate, registrationDeadline }) => {
  if (driveDate && registrationDeadline) {
    const endOfDriveDay = new Date(driveDate);
    endOfDriveDay.setHours(23, 59, 59, 999);
    if (registrationDeadline > endOfDriveDay) {
      throw httpError(400, "The registration deadline cannot be after the drive date");
    }
  }
};

/** Create a managed drive in Draft and calculate its eligibility at once. */
export const createManagedDrive = async (body, actor) => {
  const company = await resolveCompany(body.companyId);
  const role = String(body.role || "").trim();
  if (!role) throw httpError(400, "Job role is required");
  const driveDate = parseDate(body.driveDate, "Drive date");
  if (!driveDate) throw httpError(400, "Drive date is required");
  const registrationDeadline = parseDate(body.registrationDeadline, "Registration deadline");
  validateDates({ driveDate, registrationDeadline });
  const ctc = toNum(body.ctc);
  if (ctc !== undefined && (!Number.isFinite(ctc) || ctc < 0)) throw httpError(400, "CTC must be a positive number");

  const eligibility = parseEligibilityInput(body.eligibility || body);

  const drive = new Drive({
    workflow: DRIVE_WORKFLOW.MANAGED,
    status: MANAGED_DRIVE_STATUS.DRAFT,
    companyId: company._id,
    companyName: company.name,
    role,
    driveDate,
    registrationDeadline,
    description: body.description,
    location: body.location,
    ctc,
    eligibility: { ...eligibility, version: 1 },
    createdBy: actor._id,
  });
  if (Array.isArray(body.rounds) && body.rounds.length) {
    drive.rounds = buildRounds(drive, body.rounds);
    drive.stages = legacyStagesFor(drive.rounds.map((r) => r.type));
  } else {
    drive.stages = ["final"];
  }
  await drive.save();
  await audit(actor, "drive.created", { drive, to: { role, status: drive.status } });

  const summary = await calculateEligibility(drive, actor);
  return { drive, eligibility: summary };
};

const EDITABLE_AFTER_START = new Set(["description", "location", "ctc"]);

export const updateManagedDrive = async (drive, body, actor) => {
  if ([MANAGED_DRIVE_STATUS.COMPLETED, MANAGED_DRIVE_STATUS.CANCELLED].includes(drive.status)) {
    throw httpError(409, `A ${drive.status} drive cannot be edited`);
  }
  if (body.status !== undefined && body.status !== drive.status) {
    throw httpError(400, "Change the drive status with the status action, not by editing the drive");
  }
  const started = drive.status === MANAGED_DRIVE_STATUS.IN_PROGRESS;
  const changes = {};
  const set = (k, v) => {
    if (started && !EDITABLE_AFTER_START.has(k)) {
      throw httpError(409, `The ${k} cannot be changed once the drive is in progress`);
    }
    const old = drive[k] instanceof Date ? drive[k].toISOString() : drive[k];
    const neu = v instanceof Date ? v.toISOString() : v;
    if (String(old ?? "") !== String(neu ?? "")) {
      changes[k] = { from: old, to: neu };
      drive[k] = v;
    }
  };

  if (body.companyId !== undefined && String(body.companyId) !== String(drive.companyId)) {
    if (drive.status !== MANAGED_DRIVE_STATUS.DRAFT) throw httpError(409, "The company can only be changed while the drive is a draft");
    const company = await resolveCompany(body.companyId);
    set("companyId", company._id);
    set("companyName", company.name);
  }
  if (body.role !== undefined) {
    const role = String(body.role).trim();
    if (!role) throw httpError(400, "Job role is required");
    set("role", role);
  }
  if (body.driveDate !== undefined) set("driveDate", parseDate(body.driveDate, "Drive date"));
  if (body.registrationDeadline !== undefined) {
    set("registrationDeadline", parseDate(body.registrationDeadline, "Registration deadline"));
  }
  validateDates(drive);
  if (drive.status === MANAGED_DRIVE_STATUS.OPEN && drive.registrationDeadline && changes.registrationDeadline && drive.registrationDeadline < new Date()) {
    throw httpError(400, "The registration deadline of an open drive must be in the future");
  }
  if (body.description !== undefined) set("description", body.description);
  if (body.location !== undefined) set("location", body.location);
  if (body.ctc !== undefined) {
    const ctc = toNum(body.ctc);
    if (ctc !== undefined && (!Number.isFinite(ctc) || ctc < 0)) throw httpError(400, "CTC must be a positive number");
    set("ctc", ctc);
  }

  await drive.save();
  if (Object.keys(changes).length) await audit(actor, "drive.updated", { drive, from: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])), to: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])) });
  return drive;
};

/** Replace the criteria, bump their version and recalculate. */
export const updateEligibility = async (drive, body, actor) => {
  if (![MANAGED_DRIVE_STATUS.DRAFT, MANAGED_DRIVE_STATUS.OPEN, MANAGED_DRIVE_STATUS.REGISTRATION_CLOSED].includes(drive.status)) {
    throw httpError(409, "Eligibility is locked once the drive is in progress");
  }
  const next = parseEligibilityInput(body);
  const prev = drive.eligibility.toObject();
  const before = { minCgpa: prev.minCgpa, maxBacklogs: prev.maxBacklogs, branches: prev.branches, batches: prev.batches };

  Object.assign(drive.eligibility, next);
  drive.eligibility.version = (prev.version ?? 1) + 1;
  await drive.save();
  await audit(actor, "eligibility.changed", { drive, from: before, to: next });

  const summary = await calculateEligibility(drive, actor);
  return { drive, eligibility: summary };
};

/**
 * Move a managed drive to another status. Transitions not listed in
 * MANAGED_STATUS_TRANSITIONS are refused; each listed one has its own
 * preconditions below.
 */
export const changeDriveStatus = async (drive, to, actor, { reason } = {}) => {
  const from = drive.status;
  if (!Object.values(MANAGED_DRIVE_STATUS).includes(to)) throw httpError(400, `Unknown status: ${to}`);
  if (!(MANAGED_STATUS_TRANSITIONS[from] || []).includes(to)) {
    throw httpError(409, `Invalid status transition: ${from} → ${to}`);
  }
  const now = new Date();
  const result = {};

  if (to === MANAGED_DRIVE_STATUS.OPEN) {
    if (!drive.registrationDeadline) throw httpError(400, "Set a registration deadline before opening registration");
    if (drive.registrationDeadline <= now) throw httpError(400, "The registration deadline must be in the future to open registration");
    if (!drive.eligibility?.branches?.length) throw httpError(400, "No branch selected — configure eligibility before publishing");
  }
  if (to === MANAGED_DRIVE_STATUS.IN_PROGRESS) {
    if (!drive.rounds?.length) throw httpError(400, "No interview process selected — configure the rounds before starting the drive");
    const registered = await DriveParticipation.countDocuments({
      driveId: drive._id,
      registrationStatus: REGISTRATION_STATUS.REGISTERED,
    });
    if (!registered) throw httpError(409, "No students are registered for this drive");
  }
  if (to === MANAGED_DRIVE_STATUS.COMPLETED) {
    const open = drive.orderedRounds().filter((r) => r.status !== ROUND_STATUS.FINALIZED);
    if (open.length) {
      throw httpError(409, `Finalize every round before completing the drive (${open.map((r) => ROUND_TYPE_LABEL[r.type]).join(", ")} still open)`);
    }
  }

  // Conditional on the status we validated against, so two officers clicking
  // different transitions at once cannot both win.
  const update = { status: to };
  if (to === MANAGED_DRIVE_STATUS.OPEN && !drive.publishedAt) update.publishedAt = now;
  if (to === MANAGED_DRIVE_STATUS.COMPLETED) update.completedAt = now;
  const flip = await Drive.updateOne({ _id: drive._id, status: from }, { $set: update });
  if (flip.modifiedCount === 0) throw httpError(409, "The drive status was changed by someone else — reload and try again");
  Object.assign(drive, update);

  await audit(actor, "drive.status_changed", { drive, from, to, note: reason });

  if (to === MANAGED_DRIVE_STATUS.OPEN) {
    // Publish: recalculate against the latest academic records, then tell
    // every eligible student. Both steps are idempotent.
    result.eligibility = await calculateEligibility(drive, actor, { notify: false });
    result.notified = await notifyEligibleStudents(drive);
  }
  if (to === MANAGED_DRIVE_STATUS.IN_PROGRESS) {
    result.roundOneParticipants = await seedRoundParticipants(drive, 0);
  }
  if (to === MANAGED_DRIVE_STATUS.CANCELLED) {
    const regs = await DriveParticipation.find({ driveId: drive._id, registrationStatus: REGISTRATION_STATUS.REGISTERED })
      .populate("studentId", "userId")
      .lean();
    await notifyOnceMany(
      regs.filter((r) => r.studentId?.userId).map((r) => ({
        dedupeKey: `drive:${drive._id}:cancelled:${r.studentId._id}`,
        userId: r.studentId.userId,
        type: "placement_update",
        title: `${drive.companyName} drive cancelled`,
        body: `The ${drive.role} drive at ${drive.companyName} has been cancelled by the placement cell.`,
        link: `/student/drives/${drive._id}`,
        metadata: { driveId: drive._id, kind: "cancelled" },
      })),
    );
  }

  return { drive: await Drive.findById(drive._id), ...result };
};

const LEGACY_TO_ROUND = { aptitude: "aptitude", technical: "technical", interview: "hr" };

/**
 * Clone a drive's reusable configuration into a new Draft. Registrations,
 * eligibility results, notifications, attendance, results, selections and
 * schedules dates are never copied — the clone starts clean.
 */
export const cloneDrive = async (source, body, actor) => {
  const driveDate = parseDate(body.driveDate, "Drive date");
  if (!driveDate) throw httpError(400, "Drive date is required for the new drive");
  const registrationDeadline = parseDate(body.registrationDeadline, "Registration deadline");
  validateDates({ driveDate, registrationDeadline });

  let companyId = source.companyId;
  let companyName = source.companyName;
  if (!companyId) {
    // A recorded drive may predate the company list: link or add it now.
    const key = companyNameKey(source.companyName);
    let company = await Company.findOne({ nameKey: key });
    if (!company) {
      company = await Company.create({ name: source.companyName, source: "placement_cell", createdBy: actor._id });
    }
    companyId = company._id;
    companyName = company.name;
  }

  const rounds =
    source.workflow === DRIVE_WORKFLOW.MANAGED
      ? source.orderedRounds().map((r, i) => ({
          type: r.type,
          order: i + 1,
          status: ROUND_STATUS.PENDING,
          // Reusable logistics only; dates and links belong to the old drive.
          schedule: r.schedule?.mode
            ? { mode: r.schedule.mode, venue: r.schedule.venue, instructions: r.schedule.instructions }
            : undefined,
        }))
      : source.orderedStages().filter((s) => LEGACY_TO_ROUND[s]).map((s, i) => ({
          type: LEGACY_TO_ROUND[s],
          order: i + 1,
          status: ROUND_STATUS.PENDING,
        }));

  const e = source.eligibility?.toObject?.() ?? {};
  const drive = await Drive.create({
    workflow: DRIVE_WORKFLOW.MANAGED,
    status: MANAGED_DRIVE_STATUS.DRAFT,
    companyId,
    companyName,
    role: String(body.role || source.role).trim(),
    description: source.description,
    location: source.location,
    ctc: source.ctc,
    driveDate,
    registrationDeadline,
    eligibility: {
      minCgpa: e.minCgpa ?? 0,
      maxBacklogs: e.maxBacklogs ?? 0,
      branches: e.branches ?? [],
      batches: body.batches ?? e.batches ?? [],
      version: 1,
    },
    rounds,
    stages: rounds.length ? legacyStagesFor(rounds.map((r) => r.type)) : ["final"],
    clonedFrom: source._id,
    createdBy: actor._id,
  });

  await audit(actor, "drive.cloned", { drive, from: { driveId: source._id }, to: { role: drive.role } });
  const eligibility = drive.eligibility.branches.length ? await calculateEligibility(drive, actor) : null;
  return { drive, eligibility };
};

// ─────────────────────────────────────────────────────────────
// PARTICIPATION POLICY
// ─────────────────────────────────────────────────────────────

const POLICY_KEY = "placement";

export const getParticipationPolicy = async () => {
  const s = await PlacementSetting.findOne({ key: POLICY_KEY }).lean();
  return s?.participationPolicy || DEFAULT_PARTICIPATION_POLICY;
};

export const setParticipationPolicy = async (policy, actor) => {
  if (!Object.values(PARTICIPATION_POLICY).includes(policy)) {
    throw httpError(400, `policy must be one of: ${Object.values(PARTICIPATION_POLICY).join(", ")}`);
  }
  const from = await getParticipationPolicy();
  await PlacementSetting.updateOne(
    { key: POLICY_KEY },
    { $set: { participationPolicy: policy, updatedBy: actor._id } },
    { upsert: true },
  );
  if (from !== policy) await audit(actor, "policy.changed", { from, to: policy });
  return policy;
};

/** Refuse a registration the participation policy does not allow. */
const checkParticipationPolicy = async (student, drive) => {
  const policy = await getParticipationPolicy();
  if (policy === PARTICIPATION_POLICY.ALLOW_ALL) return;

  const selections = await DriveParticipation.find({
    studentId: student._id,
    driveId: { $ne: drive._id },
    "stages.final.status": FINAL_STATUS.SELECTED,
  })
    .populate("driveId", "companyName ctc")
    .lean();
  if (!selections.length) return;

  if (policy === PARTICIPATION_POLICY.BLOCK_SELECTED) {
    const at = selections[0].driveId?.companyName || "another company";
    throw httpError(409, `Student already selected elsewhere (${at}) — the placement policy does not allow registering for another drive`);
  }
  // HIGHER_PACKAGE_ONLY
  const best = Math.max(...selections.map((s) => s.stages?.final?.offer?.ctc ?? s.driveId?.ctc ?? 0));
  if (!(Number(drive.ctc) > best)) {
    throw httpError(
      409,
      `Student already selected elsewhere with a package of ${best} LPA — the placement policy allows registering only for a higher package` +
        (drive.ctc ? ` (this drive offers ${drive.ctc} LPA)` : " (this drive has no package set)"),
    );
  }
};

// ─────────────────────────────────────────────────────────────
// REGISTRATION
// ─────────────────────────────────────────────────────────────

/** Can students register right now? Status and deadline both decide. */
export const registrationOpen = (drive, now = new Date()) =>
  drive.status === MANAGED_DRIVE_STATUS.OPEN && drive.registrationDeadline && drive.registrationDeadline > now;

/**
 * Register the authenticated student. Identity and academic details come
 * from the Student document, never from the request body.
 */
export const registerStudent = async (drive, student, actor) => {
  if (!registrationOpen(drive)) throw httpError(409, "Registration closed — this drive is not accepting registrations");

  // Live check against the current record and criteria, not a cached list.
  const verdict = evaluateStudent(student, drive.eligibility?.toObject?.() ?? drive.eligibility);
  if (!verdict.eligible) {
    throw httpError(403, `Student not eligible: ${verdict.reasons.join("; ")}`);
  }

  await checkParticipationPolicy(student, drive);

  const snapshot = { cgpa: student.cgpa, backlogs: student.backlogs, branch: student.branch, batch: student.batch };
  const existing = await DriveParticipation.findOne({ driveId: drive._id, studentId: student._id });

  let participation;
  if (existing) {
    if (existing.registrationStatus !== REGISTRATION_STATUS.WITHDRAWN) {
      throw httpError(409, "Duplicate registration — you are already registered for this drive");
    }
    // Re-registering after a withdrawal, still before the deadline.
    participation = await DriveParticipation.findOneAndUpdate(
      { _id: existing._id, registrationStatus: REGISTRATION_STATUS.WITHDRAWN },
      {
        $set: { registrationStatus: REGISTRATION_STATUS.REGISTERED, registeredAt: new Date(), registeredBy: actor._id, academicSnapshot: snapshot },
        $unset: { withdrawnAt: "", withdrawnBy: "", withdrawReason: "" },
        $push: { history: { stage: "registration", from: "withdrawn", to: "registered", changedAt: new Date(), changedBy: actor._id } },
      },
      { new: true },
    );
    if (!participation) throw httpError(409, "Duplicate registration — you are already registered for this drive");
  } else {
    try {
      participation = await DriveParticipation.create({
        driveId: drive._id,
        studentId: student._id,
        registeredAt: new Date(),
        registeredBy: actor._id,
        registrationStatus: REGISTRATION_STATUS.REGISTERED,
        academicSnapshot: snapshot,
        history: [{ stage: "registration", from: null, to: "registered", changedAt: new Date(), changedBy: actor._id }],
      });
    } catch (err) {
      if (err.code === 11000) throw httpError(409, "Duplicate registration — you are already registered for this drive");
      throw err;
    }
  }

  // Keep the candidate row in step (a student created after the last
  // calculation still shows up on the eligible list).
  await DriveCandidate.updateOne(
    { driveId: drive._id, studentId: student._id },
    {
      $set: { eligible: true, reasons: [], missingData: false, userId: student.userId?._id ?? student.userId },
      $setOnInsert: {
        academic: { name: actor.name, usn: student.usn, branch: student.branch, batch: student.batch, cgpa: student.cgpa, backlogs: student.backlogs },
        evaluatedAt: new Date(),
        criteriaVersion: drive.eligibility?.version,
      },
    },
    { upsert: true },
  );

  await audit(actor, "registration.created", { drive, student, to: REGISTRATION_STATUS.REGISTERED });
  return participation;
};

/**
 * Withdraw a registration. Allowed until the student enters a round — once
 * they have, their place in the round is official and withdrawing is refused.
 */
export const withdrawStudent = async (drive, student, actor, reason) => {
  const participation = await DriveParticipation.findOne({ driveId: drive._id, studentId: student._id });
  if (!participation || participation.registrationStatus !== REGISTRATION_STATUS.REGISTERED) {
    throw httpError(409, "You are not registered for this drive");
  }
  if (![MANAGED_DRIVE_STATUS.OPEN, MANAGED_DRIVE_STATUS.REGISTRATION_CLOSED].includes(drive.status)) {
    throw httpError(409, `Withdrawal is not allowed once the drive is ${drive.status.replace("_", " ")}`);
  }
  const inRound = await RoundResult.exists({ participationId: participation._id });
  if (inRound) throw httpError(409, "You have already entered an interview round and can no longer withdraw");

  const updated = await DriveParticipation.findOneAndUpdate(
    { _id: participation._id, registrationStatus: REGISTRATION_STATUS.REGISTERED },
    {
      $set: {
        registrationStatus: REGISTRATION_STATUS.WITHDRAWN,
        withdrawnAt: new Date(),
        withdrawnBy: actor._id,
        withdrawReason: reason ? String(reason).slice(0, 500) : undefined,
      },
      $push: { history: { stage: "registration", from: "registered", to: "withdrawn", changedAt: new Date(), changedBy: actor._id, note: reason } },
    },
    { new: true },
  );
  if (!updated) throw httpError(409, "You are not registered for this drive");

  await audit(actor, "registration.withdrawn", { drive, student, from: REGISTRATION_STATUS.REGISTERED, to: REGISTRATION_STATUS.WITHDRAWN, note: reason });
  return updated;
};

/**
 * Officer override for a registered student flagged ineligible by a later
 * criteria change: lets them enter round 1. Audited with a reason.
 */
export const overrideEligibilityFlag = async (participation, drive, reason, actor) => {
  if (!reason || !String(reason).trim()) throw httpError(400, "A reason is required for an eligibility override");
  if (!participation.eligibilityFlag?.ineligibleSince) throw httpError(409, "This registration is not flagged as ineligible");
  if (drive.orderedRounds()[0]?.participantsSeededAt) {
    throw httpError(409, "Round 1 has already started; the participant list can no longer change");
  }
  participation.eligibilityFlag.overriddenAt = new Date();
  participation.eligibilityFlag.overriddenBy = actor._id;
  participation.eligibilityFlag.overrideReason = String(reason).trim();
  await participation.save();
  const student = await Student.findById(participation.studentId).select("usn");
  await audit(actor, "registration.eligibility_override", { drive, student, from: "flagged_ineligible", to: "allowed", note: String(reason).trim() });
  return participation;
};

// ─────────────────────────────────────────────────────────────
// OFFERS
// ─────────────────────────────────────────────────────────────

export const updateOffer = async (participation, drive, body, actor) => {
  if (participation.stages?.final?.status !== FINAL_STATUS.SELECTED) {
    throw httpError(409, "Offer details can only be recorded for a finally selected student");
  }
  const offer = participation.stages.final.offer || {};
  const before = { ctc: offer.ctc, location: offer.location, offerDate: offer.offerDate, status: offer.status };

  if (body.ctc !== undefined) {
    const ctc = toNum(body.ctc);
    if (ctc !== undefined && (!Number.isFinite(ctc) || ctc < 0)) throw httpError(400, "CTC must be a positive number");
    offer.ctc = ctc;
  }
  if (body.location !== undefined) offer.location = String(body.location).trim() || undefined;
  if (body.offerDate !== undefined) offer.offerDate = parseDate(body.offerDate, "Selection date");
  if (body.status !== undefined) {
    if (!OFFER_STATUS.includes(body.status)) throw httpError(400, `Offer status must be one of: ${OFFER_STATUS.join(", ")}`);
    offer.status = body.status;
    offer.accepted = body.status === "accepted";
  }
  participation.stages.final.offer = offer;
  participation.stages.final.updatedBy = actor._id;
  participation.stages.final.updatedAt = new Date();
  participation.markModified("stages.final.offer");
  await participation.save();

  const student = await Student.findById(participation.studentId).select("usn");
  await audit(actor, "offer.updated", {
    drive,
    student,
    from: before,
    to: { ctc: offer.ctc, location: offer.location, offerDate: offer.offerDate, status: offer.status },
  });
  return participation;
};

/** Deleting is only for drafts: anything published has history attached. */
export const deleteManagedDrive = async (drive, actor) => {
  if (drive.status !== MANAGED_DRIVE_STATUS.DRAFT) {
    throw httpError(409, "Only a draft drive can be deleted. Cancel it instead so its history is kept.");
  }
  const regs = await DriveParticipation.countDocuments({ driveId: drive._id });
  if (regs) throw httpError(409, "This drive has registrations; cancel it instead");
  await DriveCandidate.deleteMany({ driveId: drive._id });
  await drive.deleteOne();
  await audit(actor, "drive.deleted", { drive, from: { status: drive.status } });
};

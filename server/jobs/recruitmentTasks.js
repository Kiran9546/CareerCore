import Drive from "../models/Drive.js";
import DriveCandidate from "../models/DriveCandidate.js";
import DriveParticipation from "../models/DriveParticipation.js";
import RoundResult from "../models/RoundResult.js";
import Student from "../models/Student.js";
import {
  DRIVE_WORKFLOW,
  MANAGED_DRIVE_STATUS,
  ROUND_STATUS,
  ROUND_TYPE_LABEL,
  DEADLINE_REMINDER_HOURS,
} from "../config/constants.js";
import { audit } from "../services/auditService.js";
import { notifyOnceMany } from "../services/notificationService.js";

/**
 * Time-driven steps of the recruitment workflow. Each is idempotent — run it
 * twice and the second run finds nothing to do — so overlapping cron ticks or
 * a restart mid-run are harmless.
 */

/** Open drives past their deadline move to Registration Closed. */
export const closeExpiredRegistrations = async (now = new Date()) => {
  const expired = await Drive.find({
    workflow: DRIVE_WORKFLOW.MANAGED,
    status: MANAGED_DRIVE_STATUS.OPEN,
    registrationDeadline: { $lte: now },
  });
  let closed = 0;
  for (const drive of expired) {
    const r = await Drive.updateOne(
      { _id: drive._id, status: MANAGED_DRIVE_STATUS.OPEN },
      { $set: { status: MANAGED_DRIVE_STATUS.REGISTRATION_CLOSED } },
    );
    if (r.modifiedCount) {
      closed++;
      await audit(null, "drive.status_changed", {
        drive,
        from: MANAGED_DRIVE_STATUS.OPEN,
        to: MANAGED_DRIVE_STATUS.REGISTRATION_CLOSED,
        note: "Registration deadline passed",
      });
    }
  }
  return closed;
};

/** One reminder to eligible, unregistered students as the deadline nears. */
export const remindRegistrationDeadlines = async (now = new Date()) => {
  const soon = new Date(now.getTime() + DEADLINE_REMINDER_HOURS * 3600 * 1000);
  const drives = await Drive.find({
    workflow: DRIVE_WORKFLOW.MANAGED,
    status: MANAGED_DRIVE_STATUS.OPEN,
    registrationDeadline: { $gt: now, $lte: soon },
  }).lean();

  let sent = 0;
  for (const drive of drives) {
    const registered = await DriveParticipation.find({ driveId: drive._id }).distinct("studentId");
    const candidates = await DriveCandidate.find({
      driveId: drive._id,
      eligible: true,
      userId: { $exists: true },
      studentId: { $nin: registered },
      deadlineReminderAt: { $exists: false },
    })
      .select("_id userId studentId")
      .lean();
    if (!candidates.length) continue;

    const { created } = await notifyOnceMany(
      candidates.map((c) => ({
        dedupeKey: `drive:${drive._id}:deadline:${c.studentId}`,
        userId: c.userId,
        type: "drive_opportunity",
        title: `Registration closes soon — ${drive.companyName}`,
        body: `Registration for ${drive.role} at ${drive.companyName} closes on ${new Date(drive.registrationDeadline).toLocaleString("en-IN")}. You are eligible and have not registered.`,
        link: `/student/drives/${drive._id}`,
        metadata: { driveId: drive._id, kind: "deadline" },
      })),
    );
    await DriveCandidate.updateMany(
      { _id: { $in: candidates.map((c) => c._id) } },
      { $set: { deadlineReminderAt: now } },
    );
    sent += created;
  }
  return sent;
};

/** Students in a round scheduled for tomorrow get a reminder. */
export const remindUpcomingRounds = async (now = new Date()) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const drives = await Drive.find({
    workflow: DRIVE_WORKFLOW.MANAGED,
    status: MANAGED_DRIVE_STATUS.IN_PROGRESS,
    rounds: { $elemMatch: { "schedule.date": { $gte: start, $lt: end }, status: { $ne: ROUND_STATUS.FINALIZED } } },
  }).lean();

  let sent = 0;
  for (const drive of drives) {
    for (const round of drive.rounds) {
      const d = round.schedule?.date && new Date(round.schedule.date);
      if (!d || d < start || d >= end || round.status === ROUND_STATUS.FINALIZED) continue;
      const entries = await RoundResult.find({ roundId: round._id }).select("studentId").lean();
      const students = await Student.find({ _id: { $in: entries.map((e) => e.studentId) } }).select("userId").lean();
      const label = ROUND_TYPE_LABEL[round.type];
      const { created } = await notifyOnceMany(
        students.filter((s) => s.userId).map((s) => ({
          dedupeKey: `round:${round._id}:upcoming:${d.toISOString().slice(0, 10)}:${s._id}`,
          userId: s.userId,
          type: "placement_update",
          title: `Tomorrow: ${label} — ${drive.companyName}`,
          body: `${label} for ${drive.role} at ${drive.companyName} is tomorrow${round.schedule.startTime ? ` at ${round.schedule.startTime}` : ""}${round.schedule.venue ? `, ${round.schedule.venue}` : ""}.`,
          link: `/student/drives/${drive._id}`,
          metadata: { driveId: drive._id, roundId: round._id, kind: "upcoming" },
        })),
      );
      sent += created;
    }
  }
  return sent;
};

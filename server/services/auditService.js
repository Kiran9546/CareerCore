import AuditLog from "../models/AuditLog.js";

/**
 * Error carrying an HTTP status. The global error handler in index.js passes
 * the message of any non-500 error straight to the client, so a thrown
 * httpError(409, "...") reaches the officer's toast verbatim.
 */
export const httpError = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });

const actorFields = (actor) =>
  actor
    ? { actor: actor._id, actorName: actor.name, actorRole: actor.role }
    : { actorName: "System", actorRole: "system" };

const driveFields = (drive) =>
  drive
    ? { driveId: drive._id, companyId: drive.companyId, companyName: drive.companyName }
    : {};

/**
 * Write one audit entry. Audit failure must never undo the action it
 * describes, so errors are logged rather than thrown.
 *
 *   await audit(req.user, "drive.status_changed", { drive, from: "open", to: "registration_closed" });
 */
export const audit = async (actor, action, { drive, round, student, ...rest } = {}) => {
  try {
    await AuditLog.create({
      ...actorFields(actor),
      action,
      ...driveFields(drive),
      ...(round ? { roundId: round._id, roundName: round.name || round.type } : {}),
      ...(student ? { studentId: student._id, studentUsn: student.usn } : {}),
      ...rest,
    });
  } catch (err) {
    console.error(`Audit write failed (${action}): ${err.message}`);
  }
};

/** Many entries in one round trip — one per student in a bulk action. */
export const auditMany = async (actor, action, entries, { drive, round } = {}) => {
  if (!entries.length) return;
  const base = {
    ...actorFields(actor),
    action,
    ...driveFields(drive),
    ...(round ? { roundId: round._id, roundName: round.name || round.type } : {}),
  };
  try {
    await AuditLog.insertMany(entries.map((e) => ({ ...base, ...e })), { ordered: false });
  } catch (err) {
    console.error(`Audit write failed (${action}): ${err.message}`);
  }
};

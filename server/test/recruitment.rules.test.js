import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setup, teardown, reset, createUser, createStudent, createStudents, api, days } from "./helpers.js";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import DriveCandidate from "../models/DriveCandidate.js";
import RoundResult from "../models/RoundResult.js";
import Notification from "../models/Notification.js";
import AuditLog from "../models/AuditLog.js";
import Company from "../models/Company.js";
import Student from "../models/Student.js";
import { closeExpiredRegistrations, remindRegistrationDeadlines } from "../jobs/recruitmentTasks.js";

before(setup);
after(teardown);
beforeEach(reset);

// ─── Fixtures ────────────────────────────────────────────────

const officerApi = async () => {
  const officer = await createUser("placement_officer");
  return { officer, O: api(officer.token) };
};

const newCompany = async (O, name = "ABC Technologies") => (await O.post("/placement/companies", { name })).body.company;

const newDrive = async (O, overrides = {}) => {
  const company = overrides.company || (await newCompany(O));
  const r = await O.post("/placement/drives", {
    workflow: "managed",
    companyId: company._id,
    role: "Software Engineer",
    driveDate: days(10).toISOString(),
    registrationDeadline: days(5).toISOString(),
    minCgpa: 7.5,
    maxBacklogs: 0,
    branches: ["CSE", "ISE"],
    rounds: ["aptitude", "coding", "hr"],
    ctc: 8,
    ...overrides,
    company: undefined,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.drive;
};

const open = (O, id) => O.patch(`/placement/drives/${id}/status`, { status: "open" });
const close = (O, id) => O.patch(`/placement/drives/${id}/status`, { status: "registration_closed" });
const start = (O, id) => O.patch(`/placement/drives/${id}/status`, { status: "in_progress" });

/** Drive opened, the given students registered, then started. */
const runningDrive = async (O, students, overrides) => {
  const drive = await newDrive(O, overrides);
  assert.equal((await open(O, drive._id)).status, 200);
  for (const s of students) assert.equal((await api(s.token).post(`/student/drives/${drive._id}/register`)).status, 201);
  assert.equal((await close(O, drive._id)).status, 200);
  const st = await start(O, drive._id);
  assert.equal(st.status, 200, JSON.stringify(st.body));
  const fresh = await Drive.findById(drive._id);
  return { drive: fresh, rounds: fresh.orderedRounds().map((r) => String(r._id)) };
};

const mark = (O, d, rid, studentIds, attendance) =>
  O.post(`/placement/drives/${d}/rounds/${rid}/attendance`, { studentIds: studentIds.map(String), attendance });
const result = (O, d, rid, studentIds, r) =>
  O.post(`/placement/drives/${d}/rounds/${rid}/results`, { studentIds: studentIds.map(String), result: r });
const finalize = (O, d, rid) => O.post(`/placement/drives/${d}/rounds/${rid}/finalize`);

// ─── 1–2. Companies ──────────────────────────────────────────

test("company creation refuses duplicates by normalised name", async () => {
  const { O } = await officerApi();
  assert.equal((await O.post("/placement/companies", { name: "ABC Technologies" })).status, 201);
  for (const name of ["abc technologies", "  ABC  Technologies ", "ABC Technologies Pvt. Ltd."]) {
    const r = await O.post("/placement/companies", { name });
    assert.equal(r.status, 409, name);
    assert.match(r.body.message, /Company already exists/);
  }
  assert.equal((await O.post("/placement/companies", { name: "" })).status, 400);
  const list = await O.get("/placement/companies?q=abc");
  assert.equal(list.body.companies.length, 1);
});

test("one company can run several independent drives", async () => {
  const { O } = await officerApi();
  const company = await newCompany(O);
  const se = await newDrive(O, { company, role: "Software Engineer", minCgpa: 7.5, branches: ["CSE"] });
  const sup = await newDrive(O, { company, role: "Support Engineer", minCgpa: 6.5, maxBacklogs: 1, branches: ["CSE", "ME", "CV"], rounds: ["aptitude", "group_discussion", "hr"] });
  const detail = await O.get(`/placement/companies/${company._id}`);
  assert.equal(detail.body.drives.length, 2);
  const a = await Drive.findById(se._id);
  const b = await Drive.findById(sup._id);
  assert.equal(a.eligibility.minCgpa, 7.5);
  assert.equal(b.eligibility.minCgpa, 6.5);
  assert.deepEqual(a.orderedRounds().map((r) => r.type), ["aptitude", "coding", "hr"]);
  assert.deepEqual(b.orderedRounds().map((r) => r.type), ["aptitude", "group_discussion", "hr"]);
  assert.equal((await O.post("/placement/drives", { workflow: "managed", companyId: new mongoose.Types.ObjectId(), role: "x", driveDate: days(3), branches: ["CSE"] })).status, 400);
});

// ─── 3–5. Eligibility ────────────────────────────────────────

test("eligibility calculation, validation and missing academic data", async () => {
  const { O } = await officerApi();
  await createStudents([
    { branch: "CSE", cgpa: 8.2, backlogs: 0 },
    { branch: "ISE", cgpa: 7.8, backlogs: 0 },
    { branch: "ECE", cgpa: 7.2, backlogs: 0 },
    { branch: "CSE", cgpa: 9, backlogs: 2 },
  ]);
  // A record with a missing CGPA (bypassing validation, as a bad import might).
  await createStudents([{ branch: "CSE", cgpa: null, backlogs: 0 }]);

  const drive = await newDrive(O, { branches: ["CSE", "ISE", "ECE"] });
  const dash = (await O.get(`/placement/drives/${drive._id}/dashboard`)).body.dashboard;
  assert.equal(dash.stats.totalStudents, 5);
  assert.equal(dash.stats.eligible, 2);
  assert.equal(dash.stats.missingData, 1);
  const missing = await O.get(`/placement/drives/${drive._id}/students?view=missing`);
  assert.match(missing.body.students[0].reasons[0], /CGPA is missing/);

  const company = await newCompany(O, "Other Co");
  const bad = (b) => O.post("/placement/drives", { workflow: "managed", companyId: company._id, role: "R", driveDate: days(5), branches: ["CSE"], ...b });
  assert.match((await bad({ minCgpa: 11 })).body.message, /Invalid CGPA/);
  assert.match((await bad({ maxBacklogs: -1 })).body.message, /Invalid backlog/);
  assert.match((await bad({ branches: [] })).body.message, /No branch selected/);
});

test("recalculation after a criteria change keeps registrations and flags the newly ineligible", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8.0 });
  const b = await createStudent({ branch: "CSE", cgpa: 9.0 });
  const drive = await newDrive(O);
  await open(O, drive._id);
  await api(a.token).post(`/student/drives/${drive._id}/register`);
  await api(b.token).post(`/student/drives/${drive._id}/register`);

  const upd = await O.put(`/placement/drives/${drive._id}/eligibility`, { minCgpa: 8.5, maxBacklogs: 0, branches: ["CSE", "ISE"] });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.eligibility.eligible, 1);
  assert.equal(upd.body.eligibility.newlyFlagged, 1);

  // Registration preserved, flagged, and kept out of round 1.
  const pa = await DriveParticipation.findOne({ studentId: a.student._id });
  assert.equal(pa.registrationStatus, "registered");
  assert.ok(pa.eligibilityFlag.ineligibleSince);
  await close(O, drive._id);
  const st = await start(O, drive._id);
  assert.equal(st.body.roundOneParticipants, 1);
  assert.equal(await AuditLog.countDocuments({ action: "eligibility.changed" }), 1);
  // Locked once in progress.
  assert.equal((await O.put(`/placement/drives/${drive._id}/eligibility`, { minCgpa: 5, branches: ["CSE"] })).status, 409);
});

test("officer override lets a flagged registration into round 1, with audit", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8.0 });
  const drive = await newDrive(O);
  await open(O, drive._id);
  await api(a.token).post(`/student/drives/${drive._id}/register`);
  await O.put(`/placement/drives/${drive._id}/eligibility`, { minCgpa: 9, branches: ["CSE"] });
  const p = await DriveParticipation.findOne({ studentId: a.student._id });
  assert.equal((await O.patch(`/placement/participations/${p._id}/eligibility-override`, {})).status, 400);
  assert.equal((await O.patch(`/placement/participations/${p._id}/eligibility-override`, { reason: "Revaluation pending" })).status, 200);
  await close(O, drive._id);
  assert.equal((await start(O, drive._id)).body.roundOneParticipants, 1);
  assert.equal(await AuditLog.countDocuments({ action: "registration.eligibility_override" }), 1);
});

// ─── 6–7. Notifications ──────────────────────────────────────

test("publishing notifies eligible students once; newly eligible are notified on recalculation", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8.0 });
  const b = await createStudent({ branch: "ME", cgpa: 8.0 });
  const drive = await newDrive(O);
  const pub = await open(O, drive._id);
  assert.equal(pub.body.notified, 1);

  // Concurrent recalculations still notify nobody twice.
  await Promise.all([1, 2, 3].map(() => O.post(`/placement/drives/${drive._id}/eligibility/calculate`)));
  assert.equal(await Notification.countDocuments({ userId: a.user._id, type: "drive_opportunity" }), 1);
  assert.equal(await Notification.countDocuments({ userId: b.user._id }), 0);

  await O.put(`/placement/drives/${drive._id}/eligibility`, { minCgpa: 7.5, branches: ["CSE", "ME"] });
  assert.equal(await Notification.countDocuments({ userId: b.user._id, type: "drive_opportunity" }), 1);
  assert.equal(await Notification.countDocuments({ userId: a.user._id, type: "drive_opportunity" }), 1);

  // Student can read and mark it through the existing notification API.
  const S = api(a.token);
  const list = await S.get("/notifications");
  assert.equal(list.body.unread, 1);
  await S.patch("/notifications/read", { ids: [list.body.notifications[0]._id] });
  assert.equal((await S.get("/notifications/unread")).body.unread, 0);
});

test("deadline reminder and automatic close are idempotent", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8.0 });
  const drive = await newDrive(O, { registrationDeadline: new Date(Date.now() + 3 * 3600 * 1000).toISOString() });
  await open(O, drive._id);
  assert.equal(await remindRegistrationDeadlines(), 1);
  assert.equal(await remindRegistrationDeadlines(), 0);
  assert.equal(await Notification.countDocuments({ userId: a.user._id, "metadata.kind": "deadline" }), 1);

  assert.equal(await closeExpiredRegistrations(new Date(Date.now() + 4 * 3600 * 1000)), 1);
  assert.equal(await closeExpiredRegistrations(new Date(Date.now() + 4 * 3600 * 1000)), 0);
  assert.equal((await Drive.findById(drive._id)).status, "registration_closed");
});

// ─── 8–10. Registration & withdrawal ─────────────────────────

test("registration: identity from the token, duplicates, deadline, drafts", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8.0 });
  const drive = await newDrive(O);
  const S = api(a.token);

  assert.equal((await S.post(`/student/drives/${drive._id}/register`)).status, 404, "draft is invisible");
  await open(O, drive._id);

  // Body cannot smuggle in academic data or another student.
  const other = await createStudent({ branch: "ME", cgpa: 5 });
  const r = await api(other.token).post(`/student/drives/${drive._id}/register`, { cgpa: 9.9, branch: "CSE", studentId: a.student._id });
  assert.equal(r.status, 403);

  const results = await Promise.all([1, 2, 3, 4].map(() => S.post(`/student/drives/${drive._id}/register`)));
  assert.equal(results.filter((x) => x.status === 201).length, 1);
  assert.ok(results.filter((x) => x.status === 409).every((x) => /Duplicate registration/.test(x.body.message)));
  assert.equal(await DriveParticipation.countDocuments({ driveId: drive._id }), 1);
  const p = await DriveParticipation.findOne({ driveId: drive._id });
  assert.equal(p.academicSnapshot.cgpa, 8);

  // Deadline passes: the API refuses even while status still says open.
  await Drive.updateOne({ _id: drive._id }, { registrationDeadline: new Date(Date.now() - 1000) });
  const late = await createStudent({ branch: "ISE", cgpa: 9 });
  await O.post(`/placement/drives/${drive._id}/eligibility/calculate`);
  const lr = await api(late.token).post(`/student/drives/${drive._id}/register`);
  assert.equal(lr.status, 409);
  assert.match(lr.body.message, /Registration closed/);
  // Officer can still view registrations.
  assert.equal((await O.get(`/placement/drives/${drive._id}/students?view=registered`)).body.total, 1);
});

test("withdrawal is a status, re-registration before the deadline, refused after entering a round", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8.0 });
  const drive = await newDrive(O);
  await open(O, drive._id);
  const S = api(a.token);
  await S.post(`/student/drives/${drive._id}/register`);
  const w = await S.post(`/student/drives/${drive._id}/withdraw`, { reason: "Exam clash" });
  assert.equal(w.status, 200);
  const p = await DriveParticipation.findOne({ driveId: drive._id });
  assert.equal(p.registrationStatus, "withdrawn");
  assert.equal((await O.get(`/placement/drives/${drive._id}/dashboard`)).body.dashboard.stats.withdrawn, 1);

  assert.equal((await S.post(`/student/drives/${drive._id}/register`)).status, 201);
  await close(O, drive._id);
  await start(O, drive._id);
  const w2 = await S.post(`/student/drives/${drive._id}/withdraw`);
  assert.equal(w2.status, 409);
});

// ─── 11–12. Interview process & scheduling ───────────────────

test("round configuration: predefined types, order, duplicates, locks after start", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8.0 });
  const drive = await newDrive(O, { rounds: [] });
  const url = `/placement/drives/${drive._id}/rounds`;
  assert.match((await O.put(url, { rounds: [] })).body.message, /No interview process selected/);
  assert.match((await O.put(url, { rounds: ["aptitude", "aptitude"] })).body.message, /Duplicate round/);
  assert.equal((await O.put(url, { rounds: ["typing_test"] })).status, 400);

  let r = await O.put(url, { rounds: ["aptitude", "group_discussion", "technical", "f2f", "hr"] });
  assert.equal(r.status, 200);
  // Reorder keeps round identities.
  const before = r.body.drive.rounds.find((x) => x.type === "technical")._id;
  r = await O.put(url, { rounds: ["aptitude", "technical", "group_discussion", "f2f", "hr"] });
  const tech = r.body.drive.rounds.find((x) => x.type === "technical");
  assert.equal(tech._id, before);
  assert.equal(tech.order, 2);

  await open(O, drive._id);
  await api(a.token).post(`/student/drives/${drive._id}/register`);
  await close(O, drive._id);
  await start(O, drive._id);
  // The started first round cannot move; later rounds can still change.
  assert.equal((await O.put(url, { rounds: ["technical", "aptitude"] })).status, 409);
  assert.equal((await O.put(url, { rounds: ["aptitude", "technical", "hr"] })).status, 200);

  const templates = await O.get("/placement/interview-templates");
  assert.ok(templates.body.templates.some((t) => t.name === "Software Recruitment"));
  const t = await O.post("/placement/interview-templates", { name: "Product", rounds: ["coding", "technical", "hr"] });
  assert.equal(t.status, 201);
  assert.equal((await O.post("/placement/interview-templates", { name: "Bad", rounds: ["hr", "hr"] })).status, 400);
});

test("round scheduling validates mode, venue, link, times and order", async () => {
  const { O } = await officerApi();
  const drive = await newDrive(O);
  const d = await Drive.findById(drive._id);
  const [r1, r2] = d.orderedRounds().map((r) => r._id);
  const url = (r) => `/placement/drives/${drive._id}/rounds/${r}/schedule`;
  assert.equal((await O.patch(url(r1), { date: days(10), startTime: "10:00", mode: "offline" })).status, 400);
  assert.equal((await O.patch(url(r1), { date: days(10), startTime: "10:00", mode: "online", meetingLink: "not a url" })).status, 400);
  assert.equal((await O.patch(url(r1), { date: days(10), startTime: "12:00", endTime: "11:00", venue: "Lab" })).status, 400);
  assert.equal((await O.patch(url(r1), { date: days(11), startTime: "10:00", venue: "Lab 1" })).status, 200);
  const early = await O.patch(url(r2), { date: days(10), startTime: "10:00", venue: "Lab 2" });
  assert.equal(early.status, 400);
  assert.match(early.body.message, /cannot be scheduled before/);
  assert.equal((await O.patch(url(r2), { date: days(12), startTime: "10:00", mode: "online", meetingLink: "https://meet.example.com/x" })).status, 200);
  assert.equal((await Drive.findById(drive._id)).orderedRounds()[0].status, "scheduled");
});

// ─── 13–21. Attendance, results, progression, finalization ───

test("attendance and results are separate; results need Appeared; incomplete rounds cannot finalize", async () => {
  const { O } = await officerApi();
  const s = await Promise.all([1, 2, 3].map(() => createStudent({ branch: "CSE", cgpa: 8 })));
  const { drive, rounds } = await runningDrive(O, s);
  const ids = s.map((x) => x.student._id);

  assert.match((await result(O, drive._id, rounds[0], [ids[0]], "passed")).body.message, /not marked Appeared/);
  await mark(O, drive._id, rounds[0], [ids[0], ids[1]], "appeared");
  let e = await RoundResult.findOne({ roundId: rounds[0], studentId: ids[0] });
  assert.equal(e.attendance, "appeared");
  assert.equal(e.result, "pending", "appearing is not passing");

  let fin = await finalize(O, drive._id, rounds[0]);
  assert.equal(fin.status, 409);
  assert.match(fin.body.message, /no attendance recorded/);
  await mark(O, drive._id, rounds[0], [ids[2]], "absent");
  fin = await finalize(O, drive._id, rounds[0]);
  assert.match(fin.body.message, /have no result/);

  await result(O, drive._id, rounds[0], [ids[0]], "passed");
  // Marking absent afterwards clears the result, and the history shows both.
  await mark(O, drive._id, rounds[0], [ids[0]], "absent");
  e = await RoundResult.findOne({ roundId: rounds[0], studentId: ids[0] });
  assert.equal(e.result, "pending");
  assert.deepEqual(e.history.map((h) => `${h.field}:${h.from}>${h.to}`), [
    "attendance:unmarked>appeared",
    "result:pending>passed",
    "attendance:appeared>absent",
    "result:passed>pending",
  ]);

  // A student not in the round is refused.
  const outsider = await createStudent({ branch: "CSE", cgpa: 8 });
  assert.match((await mark(O, drive._id, rounds[0], [outsider.student._id], "appeared")).body.message, /not participants/);
});

test("progression: only passes advance; failed, absent and repeated finalize create nothing extra", async () => {
  const { O } = await officerApi();
  const s = await Promise.all([1, 2, 3, 4].map(() => createStudent({ branch: "CSE", cgpa: 8 })));
  const { drive, rounds } = await runningDrive(O, s);
  const [pass, fail, absent, pass2] = s.map((x) => x.student._id);

  await mark(O, drive._id, rounds[0], [pass, fail, pass2], "appeared");
  await mark(O, drive._id, rounds[0], [absent], "absent");
  await result(O, drive._id, rounds[0], [pass, pass2], "passed");
  await result(O, drive._id, rounds[0], [fail], "failed");

  // Next round has nobody before finalization.
  assert.equal(await RoundResult.countDocuments({ roundId: rounds[1] }), 0);
  assert.equal((await mark(O, drive._id, rounds[1], [pass], "appeared")).status, 409);

  const results = await Promise.all([1, 2, 3].map(() => finalize(O, drive._id, rounds[0])));
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.body)));
  assert.equal(results.filter((r) => r.body.alreadyFinalized === false).length, 1);

  const next = await RoundResult.find({ roundId: rounds[1] }).lean();
  assert.deepEqual(next.map((n) => String(n.studentId)).sort(), [String(pass), String(pass2)].sort());

  // Qualification notification, once.
  assert.equal(await Notification.countDocuments({ userId: s[0].user._id, "metadata.kind": "round_entered" }), 2);
  assert.equal(await Notification.countDocuments({ userId: s[1].user._id, "metadata.kind": "round_entered" }), 1);

  // Finalized round is read-only.
  assert.equal((await result(O, drive._id, rounds[0], [fail], "passed")).status, 409);
  assert.equal((await mark(O, drive._id, rounds[0], [absent], "appeared")).status, 409);

  // Student history: failed student never shows round 2.
  const h = (await api(s[1].token).get("/student/placement/status")).body;
  assert.deepEqual(h.drives[0].rounds.map((r) => r.entered), [true, false, false]);
});

test("reopen: admin only, reason required, audited, refused when downstream has records", async () => {
  const { O } = await officerApi();
  const admin = await createUser("admin");
  const A = api(admin.token);
  const s = await Promise.all([1, 2].map(() => createStudent({ branch: "CSE", cgpa: 8 })));
  const { drive, rounds } = await runningDrive(O, s);
  const ids = s.map((x) => x.student._id);
  await mark(O, drive._id, rounds[0], ids, "appeared");
  await result(O, drive._id, rounds[0], ids, "passed");
  await finalize(O, drive._id, rounds[0]);

  const reopenUrl = `/placement/drives/${drive._id}/rounds/${rounds[0]}/reopen`;
  assert.equal((await O.post(reopenUrl, { reason: "x" })).status, 403, "officer cannot reopen");
  assert.equal((await A.post(reopenUrl, {})).status, 400, "reason required");

  await mark(O, drive._id, rounds[1], [ids[0]], "appeared");
  const blocked = await A.post(reopenUrl, { reason: "Wrong result" });
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /clear them before reopening/i);

  await mark(O, drive._id, rounds[1], [ids[0]], "unmarked");
  const ok = await A.post(reopenUrl, { reason: "Wrong result for one student" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.removedDownstream, 2);
  assert.equal(await RoundResult.countDocuments({ roundId: rounds[1] }), 0);
  const log = await AuditLog.findOne({ action: "round.reopened" });
  assert.equal(log.note, "Wrong result for one student");

  // Correct and finalize again: progression re-derived from the new results.
  await result(O, drive._id, rounds[0], [ids[1]], "failed");
  await finalize(O, drive._id, rounds[0]);
  assert.equal(await RoundResult.countDocuments({ roundId: rounds[1] }), 1);
  // Round history preserved across the reopen.
  const e = await RoundResult.findOne({ roundId: rounds[0], studentId: ids[1] });
  assert.deepEqual(e.history.filter((h) => h.field === "result").map((h) => h.to), ["passed", "failed"]);
});

// ─── 22–23. Final selection, offers, history ─────────────────

test("final selection only after the last round; offers; reopening the last round reverts it", async () => {
  const { O } = await officerApi();
  const admin = await createUser("admin");
  const s = await Promise.all([1, 2].map(() => createStudent({ branch: "CSE", cgpa: 8 })));
  const { drive, rounds } = await runningDrive(O, s, { rounds: ["aptitude", "hr"] });
  const [win, lose] = s.map((x) => x.student._id);
  await mark(O, drive._id, rounds[0], [win, lose], "appeared");
  await result(O, drive._id, rounds[0], [win, lose], "passed");
  await finalize(O, drive._id, rounds[0]);
  // Passing an intermediate round is not a selection.
  assert.equal(await DriveParticipation.countDocuments({ "stages.final.status": "selected" }), 0);

  await mark(O, drive._id, rounds[1], [win, lose], "appeared");
  await result(O, drive._id, rounds[1], [win], "passed");
  await result(O, drive._id, rounds[1], [lose], "failed");
  const fin = await finalize(O, drive._id, rounds[1]);
  assert.equal(fin.body.selected, 1);

  const pw = await DriveParticipation.findOne({ studentId: win });
  assert.equal(pw.stages.final.status, "selected");
  assert.equal(pw.stages.final.offer.ctc, 8);
  assert.equal(pw.stages.aptitude.status, "passed");
  const pl = await DriveParticipation.findOne({ studentId: lose });
  assert.equal(pl.stages.final.status, "rejected");
  assert.equal((await O.patch(`/placement/participations/${pl._id}/offer`, { ctc: 5 })).status, 409);
  assert.equal((await O.patch(`/placement/participations/${pw._id}/offer`, { status: "nonsense" })).status, 400);
  assert.equal((await O.patch(`/placement/participations/${pw._id}/offer`, { ctc: 12, status: "accepted" })).status, 200);
  assert.equal(await AuditLog.countDocuments({ action: "offer.updated" }), 1);

  const re = await api(admin.token).post(`/placement/drives/${drive._id}/rounds/${rounds[1]}/reopen`, { reason: "Company revised list" });
  assert.equal(re.body.finalSelectionsReverted, 1);
  const pw2 = await DriveParticipation.findOne({ studentId: win });
  assert.equal(pw2.stages.final.status, "not_reached");
  assert.ok(pw2.history.some((h) => h.stage === "final" && h.from === "selected"));
  assert.equal(await AuditLog.countDocuments({ action: "final_selection.reverted" }), 1);
  assert.equal((await O.patch(`/placement/drives/${drive._id}/status`, { status: "completed" })).status, 409);
});

// ─── 26–27. Authorization & privacy ──────────────────────────

test("students cannot reach officer actions or other students' data", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8 });
  const b = await createStudent({ branch: "ME", cgpa: 8 });
  const s = [a];
  const { drive, rounds } = await runningDrive(O, s);
  const S = api(a.token);

  for (const [m, p, body] of [
    ["post", `/placement/drives/${drive._id}/rounds/${rounds[0]}/attendance`, { studentIds: [a.student._id], attendance: "appeared" }],
    ["post", `/placement/drives/${drive._id}/rounds/${rounds[0]}/results`, { studentIds: [a.student._id], result: "passed" }],
    ["post", `/placement/drives/${drive._id}/rounds/${rounds[0]}/finalize`],
    ["put", `/placement/drives/${drive._id}/eligibility`, { minCgpa: 0, branches: ["CSE"] }],
    ["patch", `/placement/drives/${drive._id}/status`, { status: "completed" }],
    ["get", `/placement/drives/${drive._id}/students?view=eligible`],
    ["get", `/placement/drives/${drive._id}/audit`],
    ["post", "/placement/companies", { name: "Mine" }],
    ["put", "/placement/policy", { policy: "allow_all" }],
  ]) {
    const r = await S[m](p, body);
    assert.equal(r.status, 403, `${m} ${p}`);
  }
  assert.equal((await api(null).get("/student/drives")).status, 401);

  // Another student's drive they are neither eligible for nor registered in.
  assert.equal((await api(b.token).get(`/student/drives/${drive._id}`)).status, 404);
  // Unfinalized results are hidden from the student.
  await mark(O, drive._id, rounds[0], [a.student._id], "appeared");
  await result(O, drive._id, rounds[0], [a.student._id], "failed");
  const mine = (await S.get(`/student/drives/${drive._id}`)).body;
  assert.equal(mine.progress.rounds[0].result, undefined);
  assert.equal(mine.progress.rounds[0].entered, true);

  // Faculty and recruiters are not placement managers.
  const faculty = await createUser("faculty");
  assert.equal((await api(faculty.token).patch(`/placement/drives/${drive._id}/status`, { status: "completed" })).status, 403);
  const recruiter = await createUser("recruiter");
  assert.equal((await api(recruiter.token).get("/placement/statistics")).status, 403);
});

test("meeting links are shown only to students in that round", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8 });
  const drive = await newDrive(O, { rounds: ["aptitude", "technical"] });
  const d = await Drive.findById(drive._id);
  const [r1, r2] = d.orderedRounds().map((r) => r._id);
  await O.patch(`/placement/drives/${drive._id}/rounds/${r1}/schedule`, { date: days(10), startTime: "10:00", mode: "online", meetingLink: "https://meet.example.com/r1" });
  await O.patch(`/placement/drives/${drive._id}/rounds/${r2}/schedule`, { date: days(11), startTime: "10:00", mode: "online", meetingLink: "https://meet.example.com/r2" });
  await open(O, drive._id);
  await api(a.token).post(`/student/drives/${drive._id}/register`);
  await close(O, drive._id);
  await start(O, drive._id);
  const v = (await api(a.token).get(`/student/drives/${drive._id}`)).body;
  assert.equal(v.progress.rounds[0].schedule.meetingLink, "https://meet.example.com/r1");
  assert.equal(v.progress.rounds[1].schedule, undefined);
});

// ─── 28. Cloning ─────────────────────────────────────────────

test("clone copies configuration only", async () => {
  const { O } = await officerApi();
  const s = await Promise.all([1, 2].map(() => createStudent({ branch: "CSE", cgpa: 8 })));
  const { drive } = await runningDrive(O, s, { rounds: ["aptitude", "coding", "hr"] });

  const c = await O.post(`/placement/drives/${drive._id}/clone`, { driveDate: days(60).toISOString() });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const clone = await Drive.findById(c.body.drive._id);
  assert.notEqual(String(clone._id), String(drive._id));
  assert.equal(clone.status, "draft");
  assert.equal(String(clone.clonedFrom), String(drive._id));
  assert.equal(clone.role, drive.role);
  assert.equal(clone.eligibility.minCgpa, 7.5);
  assert.deepEqual(clone.orderedRounds().map((r) => r.type), ["aptitude", "coding", "hr"]);
  assert.ok(clone.orderedRounds().every((r) => r.status === "pending" && !r.participantsSeededAt && !r.schedule?.date));
  assert.equal(await DriveParticipation.countDocuments({ driveId: clone._id }), 0);
  assert.equal(await RoundResult.countDocuments({ driveId: clone._id }), 0);
  assert.equal(await Notification.countDocuments({ "metadata.driveId": clone._id }), 0);
  assert.equal(await DriveCandidate.countDocuments({ driveId: clone._id, notifiedAt: { $exists: true } }), 0);
  assert.equal((await O.post(`/placement/drives/${drive._id}/clone`, {})).status, 400);
});

// ─── 29. Participation policy ────────────────────────────────

test("participation policy: block, allow, higher package only", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8 });
  const { drive, rounds } = await runningDrive(O, [a], { rounds: ["hr"], ctc: 6 });
  await mark(O, drive._id, rounds[0], [a.student._id], "appeared");
  await result(O, drive._id, rounds[0], [a.student._id], "passed");
  await finalize(O, drive._id, rounds[0]);

  const company = await newCompany(O, "XYZ Corp");
  const low = await newDrive(O, { company, role: "Analyst", ctc: 5 });
  const high = await newDrive(O, { company, role: "Engineer", ctc: 12 });
  await open(O, low._id);
  await open(O, high._id);
  const S = api(a.token);

  assert.equal((await O.get("/placement/policy")).body.policy, "block_selected");
  // The student is told before trying: listed, not registrable, with the reason.
  const listed = (await S.get("/student/drives")).body.drives.find((d) => String(d._id) === String(high._id));
  assert.ok(listed, "a policy-blocked drive stays listed");
  assert.equal(listed.canRegister, false);
  assert.match(listed.blockedReason, /already selected elsewhere/);
  const detail = (await S.get(`/student/drives/${high._id}`)).body;
  assert.equal(detail.canRegister, false);
  assert.match(detail.blockedReason, /already selected elsewhere/);
  let r = await S.post(`/student/drives/${high._id}/register`);
  assert.equal(r.status, 409);
  assert.match(r.body.message, /already selected elsewhere/);

  assert.equal((await O.put("/placement/policy", { policy: "nope" })).status, 400);
  await O.put("/placement/policy", { policy: "higher_package_only" });
  assert.equal((await S.post(`/student/drives/${low._id}/register`)).status, 409);
  assert.equal((await S.post(`/student/drives/${high._id}/register`)).status, 201);

  await O.put("/placement/policy", { policy: "allow_all" });
  const lowNow = (await S.get(`/student/drives/${low._id}`)).body;
  assert.equal(lowNow.canRegister, true);
  assert.equal(lowNow.blockedReason, null);
  assert.equal((await S.post(`/student/drives/${low._id}/register`)).status, 201);
  assert.equal(await AuditLog.countDocuments({ action: "policy.changed" }), 2);
});

// ─── Drive lifecycle ─────────────────────────────────────────

test("drive status transitions are validated on the server", async () => {
  const { O } = await officerApi();
  const drive = await newDrive(O);
  const go = (status) => O.patch(`/placement/drives/${drive._id}/status`, { status });
  assert.match((await go("in_progress")).body.message, /Invalid status transition: draft → in_progress/);
  assert.equal((await go("completed")).status, 409);
  assert.equal((await go("open")).status, 200);
  assert.match((await go("open")).body.message, /Invalid status transition/);
  assert.equal((await go("registration_closed")).status, 200);
  assert.match((await go("in_progress")).body.message, /No students are registered/);
  assert.equal((await go("cancelled")).status, 200);
  assert.equal((await go("open")).status, 409);
  // Status cannot be changed through a plain edit either.
  assert.equal((await O.put(`/placement/drives/${drive._id}`, { status: "open" })).status, 409);
  assert.equal(await AuditLog.countDocuments({ action: "drive.status_changed" }), 3);
});

// ─── 30. Integrity ───────────────────────────────────────────

test("database constraints reject duplicates and audit records are immutable", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8 });
  const { drive, rounds } = await runningDrive(O, [a]);
  const entry = await RoundResult.findOne({ roundId: rounds[0] }).lean();
  await assert.rejects(
    RoundResult.create({ ...entry, _id: undefined }),
    (e) => e.code === 11000,
  );
  await assert.rejects(
    DriveParticipation.create({ driveId: drive._id, studentId: a.student._id }),
    (e) => e.code === 11000,
  );
  await assert.rejects(Company.create({ name: "abc technologies" }), (e) => e.code === 11000);

  const log = await AuditLog.findOne();
  await assert.rejects(AuditLog.updateOne({ _id: log._id }, { action: "forged" }), /cannot be modified/);
  await assert.rejects(AuditLog.deleteMany({}), /cannot be modified/);
  log.action = "forged";
  await assert.rejects(log.save(), /cannot be modified/);
});

// ─── 31. Regression: the original recorded-drive flow ────────

test("recorded drives keep working and refuse workflow-only operations", async () => {
  const { O } = await officerApi();
  const a = await createStudent({ branch: "CSE", cgpa: 8 });
  const legacy = await O.post("/placement/drives", {
    companyName: "Legacy Co",
    role: "Dev",
    driveDate: days(-30).toISOString(),
    stages: ["aptitude", "technical", "final"],
  });
  assert.equal(legacy.status, 201);
  const id = legacy.body.drive._id;
  assert.equal(legacy.body.drive.workflow, "recorded");
  // Recorded drives are linked to a company record, so company filters and
  // the company picker find them; renaming relinks.
  const legacyCo = await Company.findOne({ name: "Legacy Co" });
  assert.ok(legacyCo, "company record created for a recorded drive");
  assert.equal(String((await Drive.findById(id)).companyId), String(legacyCo._id));
  assert.equal((await O.put(`/placement/drives/${id}`, { companyName: "Legacy Renamed" })).status, 200);
  const renamed = await Company.findOne({ name: "Legacy Renamed" });
  assert.ok(renamed);
  assert.equal(String((await Drive.findById(id)).companyId), String(renamed._id));
  assert.equal((await O.put(`/placement/drives/${id}`, { companyName: "Legacy Co" })).status, 200);
  assert.equal((await O.post(`/placement/drives/${id}/participants`, { studentIds: [a.student._id] })).status, 201);
  const p = await DriveParticipation.findOne({ driveId: id });
  assert.equal((await O.patch(`/placement/participations/${p._id}/stage`, { stage: "aptitude", status: "passed" })).status, 200);
  assert.equal((await O.patch(`/placement/participations/${p._id}/stage`, { stage: "final", status: "selected" })).status, 400, "order still enforced");
  assert.equal((await O.get(`/placement/drives/${id}/dashboard`)).status, 409);
  const list = await O.get("/placement/drives");
  assert.equal(list.body.drives[0].participantCount, 1);
  assert.equal((await O.get("/placement/students")).status, 200);

  // A recorded drive can be cloned into the workflow, company linked.
  const c = await O.post(`/placement/drives/${id}/clone`, { driveDate: days(30).toISOString() });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.deepEqual(c.body.drive.rounds.map((r) => r.type), ["aptitude", "technical"]);
  assert.ok(await Company.findOne({ name: "Legacy Co" }));

  // Managed drives refuse the legacy write paths.
  const m = await newDrive(O);
  await open(O, m._id);
  assert.equal((await O.post(`/placement/drives/${m._id}/participants`, { studentIds: [a.student._id] })).status, 409);
  await api(a.token).post(`/student/drives/${m._id}/register`);
  const mp = await DriveParticipation.findOne({ driveId: m._id });
  assert.equal((await O.patch(`/placement/participations/${mp._id}/stage`, { stage: "aptitude", status: "passed" })).status, 409);

  assert.equal((await Student.countDocuments()), 1);
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown, createUser, createStudents, api, days } from "./helpers.js";
import Notification from "../models/Notification.js";
import RoundResult from "../models/RoundResult.js";
import AuditLog from "../models/AuditLog.js";

/**
 * The complete scenario from the requirements document, end to end through
 * the HTTP API with synthetic data:
 *
 *   500 students → 200 eligible → 200 notified → 150 registered
 *   Aptitude 150 / 145 appeared / 90 passed
 *   Coding    90 /  85 appeared / 60 passed
 *   Technical 60 /  58 appeared / 30 passed
 *   HR        30 /  30 appeared / 10 selected
 *
 * The figures are expectations of this test only — nothing in the
 * application knows them.
 */

before(setup);
after(teardown);

const ELIGIBLE_BRANCHES = ["CSE", "ISE", "ECE"];

const buildCohort = () => {
  const rows = [];
  // 200 eligible: CGPA >= 7.5, 0 backlogs, CSE/ISE/ECE
  for (let i = 0; i < 200; i++) {
    rows.push({ branch: ELIGIBLE_BRANCHES[i % 3], cgpa: 7.5 + (i % 25) / 10, backlogs: 0 });
  }
  // 300 ineligible for different reasons
  for (let i = 0; i < 100; i++) rows.push({ branch: ELIGIBLE_BRANCHES[i % 3], cgpa: 7.2, backlogs: 0 }); // CGPA
  for (let i = 0; i < 80; i++) rows.push({ branch: "CSE", cgpa: 8.4, backlogs: 1 + (i % 2) }); // backlogs
  for (let i = 0; i < 100; i++) rows.push({ branch: i % 2 ? "ME" : "CV", cgpa: 8.8, backlogs: 0 }); // branch
  for (let i = 0; i < 20; i++) rows.push({ branch: "EEE", cgpa: 6.1, backlogs: 3 }); // several
  return rows.map((r, i) => ({ ...r, usn: `4MT22TS${String(i + 1).padStart(3, "0")}`, name: `Student ${i + 1}` }));
};

const ids = (rows) => rows.map((r) => String(r.studentId));

test("complete recruitment workflow: 500 → 200 → 150 → 90 → 60 → 30 → 10", { timeout: 240000 }, async () => {
  const officer = await createUser("placement_officer", { name: "Officer A" });
  const admin = await createUser("admin");
  const O = api(officer.token);

  const cohort = await createStudents(buildCohort());
  const eligibleSet = cohort.slice(0, 200);

  // ── Company and drive ───────────────────────────────────────
  const company = await O.post("/placement/companies", { name: "ABC Technologies" });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  const companyId = company.body.company._id;

  const created = await O.post("/placement/drives", {
    workflow: "managed",
    companyId,
    role: "Software Engineer",
    driveDate: days(14).toISOString(),
    registrationDeadline: days(7).toISOString(),
    ctc: 9.5,
    location: "Bengaluru",
    minCgpa: 7.5,
    maxBacklogs: 0,
    branches: ELIGIBLE_BRANCHES,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const driveId = created.body.drive._id;
  assert.equal(created.body.drive.status, "draft");

  // ── Automatic eligibility calculation ───────────────────────
  assert.deepEqual(
    { total: created.body.eligibility.total, eligible: created.body.eligibility.eligible },
    { total: 500, eligible: 200 },
  );

  const ineligibleList = await O.get(`/placement/drives/${driveId}/students?view=ineligible&q=4MT22TS201`);
  assert.equal(ineligibleList.body.total, 1);
  assert.match(ineligibleList.body.students[0].reasons[0], /CGPA 7.2 is below 7.5/);

  // A draft notifies nobody.
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity" }), 0);

  // ── Interview process ───────────────────────────────────────
  const rounds = await O.put(`/placement/drives/${driveId}/rounds`, {
    rounds: ["aptitude", "coding", "technical", "hr"],
  });
  assert.equal(rounds.status, 200, JSON.stringify(rounds.body));
  const roundIds = rounds.body.drive.rounds.sort((a, b) => a.order - b.order).map((r) => r._id);
  for (const [i, rid] of roundIds.entries()) {
    const s = await O.patch(`/placement/drives/${driveId}/rounds/${rid}/schedule`, {
      date: days(14 + i).toISOString(),
      startTime: "10:00",
      endTime: "12:00",
      mode: i === 2 ? "online" : "offline",
      venue: i === 2 ? undefined : "Placement Cell Lab",
      meetingLink: i === 2 ? "https://meet.example.com/abc" : undefined,
    });
    assert.equal(s.status, 200, JSON.stringify(s.body));
  }

  // ── Publish → automatic notifications ───────────────────────
  const published = await O.patch(`/placement/drives/${driveId}/status`, { status: "open" });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.notified, 200);
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity", "metadata.kind": "opportunity" }), 200);
  const sample = await Notification.findOne({ type: "drive_opportunity" });
  assert.match(sample.title, /ABC Technologies — Placement Opportunity/);
  assert.match(sample.body, /CGPA ≥ 7.5/);
  assert.match(sample.body, /Aptitude Test → Coding Test → Technical Interview → HR Interview/);
  assert.equal(sample.link, `/student/drives/${driveId}`);

  // Recalculating does not notify anyone twice.
  const recalc = await O.post(`/placement/drives/${driveId}/eligibility/calculate`);
  assert.equal(recalc.status, 200);
  assert.equal(await Notification.countDocuments({ type: "drive_opportunity" }), 200);

  // ── Student registration ────────────────────────────────────
  const registering = eligibleSet.slice(0, 150);
  for (let i = 0; i < registering.length; i += 25) {
    const batch = registering.slice(i, i + 25);
    const results = await Promise.all(batch.map((s) => api(s.token).post(`/student/drives/${driveId}/register`)));
    results.forEach((r) => assert.equal(r.status, 201, JSON.stringify(r.body)));
  }
  // Duplicate and ineligible registrations are refused.
  const dup = await api(registering[0].token).post(`/student/drives/${driveId}/register`);
  assert.equal(dup.status, 409);
  const inel = await api(cohort[250].token).post(`/student/drives/${driveId}/register`);
  assert.equal(inel.status, 403);
  assert.match(inel.body.message, /not eligible/);

  // Student sees their own data, filled from the database.
  const view = await api(registering[0].token).get(`/student/drives/${driveId}`);
  assert.equal(view.status, 200);
  assert.equal(view.body.registration.status, "registered");
  assert.equal(view.body.me.usn, registering[0].student.usn);
  assert.deepEqual(view.body.drive.process, ["Aptitude Test", "Coding Test", "Technical Interview", "HR Interview"]);

  let dash = (await O.get(`/placement/drives/${driveId}/dashboard`)).body.dashboard;
  assert.equal(dash.stats.totalStudents, 500);
  assert.equal(dash.stats.eligible, 200);
  assert.equal(dash.stats.notified, 200);
  assert.equal(dash.stats.registered, 150);
  assert.equal(dash.stats.notRegistered, 50);
  assert.equal(dash.stats.viewed, 1);

  // ── Close registration, start the drive ─────────────────────
  assert.equal((await O.patch(`/placement/drives/${driveId}/status`, { status: "registration_closed" })).status, 200);
  const late = await api(eligibleSet[180].token).post(`/student/drives/${driveId}/register`);
  assert.equal(late.status, 409);
  assert.match(late.body.message, /Registration closed/);

  const started = await O.patch(`/placement/drives/${driveId}/status`, { status: "in_progress" });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.roundOneParticipants, 150);

  // ── Rounds: attendance → results → finalize → progression ──
  const runRound = async (rid, { appeared, passed }) => {
    const list = await O.get(`/placement/drives/${driveId}/rounds/${rid}/participants?limit=200`);
    assert.equal(list.status, 200);
    const all = ids(list.body.participants);
    const present = all.slice(0, appeared);
    const absent = all.slice(appeared);
    let r = await O.post(`/placement/drives/${driveId}/rounds/${rid}/attendance`, { studentIds: present, attendance: "appeared" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    if (absent.length) {
      // "Select all matching" across pages, using the attendance filter.
      r = await O.post(`/placement/drives/${driveId}/rounds/${rid}/attendance`, {
        all: true,
        filter: { attendance: "unmarked" },
        attendance: "absent",
      });
      assert.equal(r.body.updated, absent.length);
    }
    r = await O.post(`/placement/drives/${driveId}/rounds/${rid}/results`, { studentIds: present.slice(0, passed), result: "passed" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await O.post(`/placement/drives/${driveId}/rounds/${rid}/results`, { studentIds: present.slice(passed), result: "failed" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const fin = await O.post(`/placement/drives/${driveId}/rounds/${rid}/finalize`);
    assert.equal(fin.status, 200, JSON.stringify(fin.body));
    return { all, present, absent, passedIds: present.slice(0, passed), failedIds: present.slice(passed), fin: fin.body };
  };

  const apt = await runRound(roundIds[0], { appeared: 145, passed: 90 });
  assert.equal(apt.all.length, 150);
  assert.equal(apt.fin.counts.appeared, 145);
  assert.equal(apt.fin.counts.passed, 90);

  // Repeating the finalize creates nothing new.
  const again = await O.post(`/placement/drives/${driveId}/rounds/${roundIds[0]}/finalize`);
  assert.equal(again.body.alreadyFinalized, true);
  assert.equal(await RoundResult.countDocuments({ roundId: roundIds[1] }), 90);

  // Finalized results are read-only.
  const tamper = await O.post(`/placement/drives/${driveId}/rounds/${roundIds[0]}/results`, { studentIds: [apt.failedIds[0]], result: "passed" });
  assert.equal(tamper.status, 409);

  const cod = await runRound(roundIds[1], { appeared: 85, passed: 60 });
  assert.equal(cod.all.length, 90);
  // Exactly the aptitude passes entered coding.
  assert.deepEqual([...cod.all].sort(), [...apt.passedIds].sort());

  const tech = await runRound(roundIds[2], { appeared: 58, passed: 30 });
  assert.equal(tech.all.length, 60);
  // A coding failure never reaches the technical round.
  assert.ok(!tech.all.includes(cod.failedIds[0]));

  const hr = await runRound(roundIds[3], { appeared: 30, passed: 10 });
  assert.equal(hr.all.length, 30);
  assert.equal(hr.fin.selected, 10);

  // ── Complete the drive ──────────────────────────────────────
  const done = await O.patch(`/placement/drives/${driveId}/status`, { status: "completed" });
  assert.equal(done.status, 200, JSON.stringify(done.body));

  // ── Drive dashboard: every figure from the database ─────────
  dash = (await O.get(`/placement/drives/${driveId}/dashboard`)).body.dashboard;
  assert.equal(dash.stats.totalStudents, 500);
  assert.equal(dash.stats.eligible, 200);
  assert.equal(dash.stats.registered, 150);
  assert.equal(dash.stats.finalSelected, 10);
  const counts = dash.rounds.map((r) => [r.name, r.counts.participants, r.counts.appeared, r.counts.passed]);
  assert.deepEqual(counts, [
    ["Aptitude Test", 150, 145, 90],
    ["Coding Test", 90, 85, 60],
    ["Technical Interview", 60, 58, 30],
    ["HR Interview", 30, 30, 10],
  ]);

  // ── Clickable statistics open the matching lists ────────────
  const listTotal = async (q) => (await O.get(`/placement/drives/${driveId}${q}`)).body.total;
  assert.equal(await listTotal("/students?view=eligible"), 200);
  assert.equal(await listTotal("/students?view=registered"), 150);
  assert.equal(await listTotal("/students?view=notified"), 200);
  assert.equal(await listTotal("/students?view=not_registered"), 50);
  assert.equal(await listTotal(`/rounds/${roundIds[0]}/participants?result=passed`), 90);
  assert.equal(await listTotal(`/rounds/${roundIds[1]}/participants?result=passed`), 60);
  assert.equal(await listTotal(`/rounds/${roundIds[0]}/participants?attendance=absent`), 5);
  const selected = await O.get(`/placement/drives/${driveId}/students?view=selected`);
  assert.equal(selected.body.total, 10);
  assert.equal(selected.body.students[0].offer.ctc, 9.5);
  assert.equal(selected.body.students[0].offer.location, "Bengaluru");

  // ── Offer details ───────────────────────────────────────────
  const offerP = selected.body.students[0].participationId;
  const offer = await O.patch(`/placement/participations/${offerP}/offer`, { ctc: 10, status: "accepted", location: "Mangaluru" });
  assert.equal(offer.status, 200, JSON.stringify(offer.body));
  assert.equal(offer.body.offer.accepted, true);

  // ── Student history ─────────────────────────────────────────
  const selectedStudent = cohort.find((c) => String(c.student._id) === hr.passedIds[0]);
  const hist = await api(selectedStudent.token).get("/student/placement/status");
  assert.equal(hist.status, 200);
  assert.equal(hist.body.overall.state, "selected");
  const entry = hist.body.drives[0];
  assert.equal(entry.outcome, "selected");
  assert.deepEqual(entry.rounds.map((r) => r.result), ["passed", "passed", "passed", "passed"]);

  const codingFailer = cohort.find((c) => String(c.student._id) === cod.failedIds[0]);
  const hist2 = (await api(codingFailer.token).get("/student/placement/status")).body;
  assert.deepEqual(hist2.drives[0].rounds.map((r) => r.result ?? null), ["passed", "failed", null, null]);
  assert.equal(hist2.drives[0].outcome, "rejected");

  // Existing placement profile picks up the managed outcome (legacy mirror).
  const profile = await api(selectedStudent.token).get("/student/placement");
  assert.equal(profile.status, 200);
  assert.equal(profile.body.placementStatus, "placed");

  // ── Overall dashboard ───────────────────────────────────────
  const stats = (await O.get("/placement/statistics")).body;
  assert.equal(stats.totals.totalStudents, 500);
  assert.equal(stats.totals.placedStudents, 10);
  assert.equal(stats.totals.placementPercentage, 2);
  assert.equal(stats.totals.companiesVisited, 1);
  assert.equal(stats.offers.accepted, 1);
  assert.equal(stats.companyWise[0].selections, 10);
  const cse = stats.branchWise.find((b) => b.branch === "CSE");
  assert.ok(cse.total > 0);

  // ── Audit history ───────────────────────────────────────────
  const audit = await O.get(`/placement/drives/${driveId}/audit?action=round.finalized`);
  assert.equal(audit.body.total, 4);
  const resultChange = await AuditLog.findOne({ action: "round.result_changed", roundName: "Coding Test", to: "passed" });
  assert.equal(resultChange.actorName, "Officer A");
  assert.equal(resultChange.companyName, "ABC Technologies");
  assert.ok(resultChange.studentUsn);
  assert.equal(resultChange.from, "pending");

  // Admin-only reopen is refused on a completed drive.
  const reopen = await api(admin.token).post(`/placement/drives/${driveId}/rounds/${roundIds[3]}/reopen`, { reason: "late correction" });
  assert.equal(reopen.status, 409);
});

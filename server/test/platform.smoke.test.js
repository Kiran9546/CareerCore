import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setup, teardown, reset, createUser, createStudent, api, days, baseUrlForTests } from "./helpers.js";
import CareerPath from "../models/CareerPath.js";
import Student from "../models/Student.js";
import DriveParticipation from "../models/DriveParticipation.js";

/**
 * Regression smoke tests for the modules that existed before the
 * recruitment workflow: authentication, student profiles and PRS, job
 * postings and applications, the admin and faculty areas, the legacy result
 * pipeline, the Excel export and notifications. Each test drives the real
 * HTTP API against an in-memory database. The ML service is deliberately
 * unreachable here (see env.js).
 */

before(setup);
after(teardown);
beforeEach(reset);

test("auth: self-registration rules, login, session, deactivation", async () => {
  const anon = api(null);
  const reg = await anon.post("/auth/register", { name: "S One", email: "s1@x.local", password: "Password123!", role: "student" });
  assert.equal(reg.status, 201);
  assert.ok(reg.body.token);
  assert.equal(reg.body.user.passwordHash, undefined, "hash never returned");

  assert.equal((await anon.post("/auth/register", { name: "A", email: "a@x.local", password: "Password123!", role: "admin" })).status, 403);
  assert.equal((await anon.post("/auth/register", { name: "R", email: "r@x.local", password: "Password123!", role: "recruiter" })).status, 403);
  assert.equal((await anon.post("/auth/register", { name: "F", email: "f@x.local", password: "Password123!", role: "faculty" })).status, 400, "faculty need a department");
  assert.equal((await anon.post("/auth/register", { name: "S", email: "s1@x.local", password: "Password123!", role: "student" })).status, 409);
  assert.equal((await anon.post("/auth/register", { name: "S", email: "s2@x.local", password: "short", role: "student" })).status, 400);

  const login = await anon.post("/auth/login", { email: "s1@x.local", password: "Password123!" });
  assert.equal(login.status, 200);
  assert.equal((await anon.post("/auth/login", { email: "s1@x.local", password: "wrong-password" })).status, 401);
  assert.equal((await api(login.body.token).get("/auth/me")).body.user.email, "s1@x.local");
  assert.equal((await api("not-a-token").get("/auth/me")).status, 401);
  assert.equal((await anon.get("/auth/departments")).body.departments.length, 7);

  const admin = await createUser("admin");
  const t = await api(admin.token).patch(`/admin/users/${reg.body.user._id}/toggle`);
  assert.equal(t.status, 200);
  assert.equal((await api(login.body.token).get("/auth/me")).status, 403, "deactivated account is refused");
});

test("student profile, academic validation and role isolation", async () => {
  const { token } = await createUser("student");
  const S = api(token);
  assert.equal((await S.get("/student/profile")).status, 404);
  assert.equal((await S.post("/student/profile", { usn: "4MT22IS001", batch: "2026", branch: "ISE", cgpa: 11 })).status, 400);
  const created = await S.post("/student/profile", { usn: "4mt22is001", batch: "2026", branch: "ISE", cgpa: 8.1 });
  assert.equal(created.status, 201);
  assert.equal(created.body.student.usn, "4MT22IS001");
  assert.equal((await S.get("/student/profile")).status, 200);

  for (const p of ["/placement/statistics", "/faculty/overview", "/admin/stats"]) {
    assert.equal((await S.get(p)).status, 403, p);
  }
});

test("PRS is not computed — and not saved — while skill analysis is unavailable", async () => {
  const path = await CareerPath.create({
    name: "Full Stack Developer",
    code: "FSD",
    requiredSkills: [{ skillId: new mongoose.Types.ObjectId(), name: "React", weight: 1 }],
  });
  const { token, student } = await createStudent({ branch: "CSE", cgpa: 8 });
  await Student.updateOne({ _id: student._id }, { careerInterest: path._id, currentPRS: 64 });

  const t0 = Date.now();
  const dash = await api(token).get("/student/dashboard");
  assert.equal(dash.status, 200);
  assert.equal(dash.body.prs.computable, false);
  assert.match(dash.body.prs.message, /Skill analysis is unavailable/);
  assert.ok(Date.now() - t0 < 5000, "fails fast");

  const fresh = await Student.findById(student._id);
  assert.equal(fresh.currentPRS, 64, "last good score kept");
  assert.equal(fresh.prsHistory.length, 0, "no deflated snapshot recorded");

  const rec = await api(token).get("/student/recommendations");
  assert.equal(rec.status, 503);
});

test("retired areas are gone: job postings, missed-drives report, old overview, recruiters", async () => {
  const officer = await createUser("placement_officer");
  const O = api(officer.token);
  const { token } = await createStudent({ branch: "CSE", cgpa: 8 });
  const S = api(token);

  for (const [who, path] of [
    [O, "/placement/jobs"],
    [O, "/placement/missed"],
    [O, "/placement/overview"],
    [S, "/student/jobs"],
    [S, "/student/applications"],
  ]) {
    assert.equal((await who.get(path)).status, 404, path);
  }

  // Existing recruiter accounts cannot sign in, and old sessions are refused.
  const rec = await createUser("recruiter", { email: "recruiter.old@x.local" });
  const login = await api(null).post("/auth/login", { email: "recruiter.old@x.local", password: "Password123!" });
  assert.equal(login.status, 403);
  assert.match(login.body.message, /no longer supported/);
  assert.equal((await api(rec.token).get("/auth/me")).status, 403);
  assert.equal((await api(rec.token).get("/recruiter/company")).status, 404, "recruiter routes no longer exist");
});

test("admin and faculty areas are reachable only by their roles and scoped", async () => {
  const admin = await createUser("admin");
  const A = api(admin.token);
  assert.equal((await A.get("/admin/stats")).status, 200);
  assert.equal((await A.get("/admin/users")).status, 200);
  assert.equal((await A.get("/admin/skills")).status, 200);
  assert.equal((await A.get("/admin/questions")).status, 200);

  const path = await CareerPath.create({
    name: "Data Analyst",
    code: "DA",
    requiredSkills: [{ skillId: new mongoose.Types.ObjectId(), name: "SQL", weight: 1 }],
  });
  for (let i = 0; i < 3; i++) {
    const { student } = await createStudent({ branch: "ISE", cgpa: 8 });
    await Student.updateOne({ _id: student._id }, { careerInterest: path._id });
  }
  await createStudent({ branch: "CSE", cgpa: 8 });
  const faculty = await createUser("faculty"); // department ISE (helpers)
  const F = api(faculty.token);
  const list = await F.get("/faculty/students");
  assert.equal(list.status, 200);
  assert.ok(list.body.students.every((s) => s.branch === "ISE"), "faculty see only their department");
  assert.equal((await F.get("/faculty/overview")).status, 200);

  const t0 = Date.now();
  const gaps = await F.get("/faculty/skill-gaps");
  assert.equal(gaps.status, 200);
  // Unavailable analysis must not read as "no student has any gap".
  assert.equal(gaps.body.available, false);
  assert.ok(Date.now() - t0 < 5000, "skill-gap analytics fail fast without the ML service");
  assert.equal((await F.get("/placement/statistics")).status, 403);
});

test("legacy result pipeline, profiles, export and notifications still work", async () => {
  const officer = await createUser("placement_officer");
  const O = api(officer.token);
  const { token, student } = await createStudent({ branch: "ISE", cgpa: 8 });
  const drive = await O.post("/placement/drives", { companyName: "Recorded Co", role: "Dev", driveDate: days(-10).toISOString() });
  assert.equal(drive.status, 201);

  const applied = await O.post("/results/apply", {
    studentId: student._id,
    driveId: drive.body.drive._id,
    stages: { aptitude: { status: "passed" }, technical: { status: "passed" }, interview: { status: "passed" }, final: { status: "selected" } },
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.equal((await DriveParticipation.findOne({ studentId: student._id })).stages.final.status, "selected");

  const profile = await api(token).get("/student/placement");
  assert.equal(profile.body.placementStatus, "placed");
  assert.equal((await O.get(`/placement/students/${student._id}/profile`)).status, 200);
  assert.equal((await O.get("/placement/compare?ids=" + student._id)).status, 400);

  const res = await fetch(`${baseUrlForTests()}/placement/export`, {
    headers: { Authorization: `Bearer ${officer.token}` },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /spreadsheetml/);

  const notes = await api(token).get("/notifications");
  assert.equal(notes.status, 200);
  assert.ok(Array.isArray(notes.body.notifications));
});

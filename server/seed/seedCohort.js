import mongoose from "mongoose";
import dotenv from "dotenv";

import User from "../models/User.js";
import Student from "../models/Student.js";
import Skill from "../models/Skill.js";
import CareerPath from "../models/CareerPath.js";
import AptitudeAttempt from "../models/AptitudeAttempt.js";
import Resume from "../models/Resume.js";
import Application from "../models/Application.js";
import Notification from "../models/Notification.js";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import ResultSubmission from "../models/ResultSubmission.js";
import Job from "../models/Job.js";
import DriveCandidate from "../models/DriveCandidate.js";
import RoundResult from "../models/RoundResult.js";
import { computeAndSavePRS } from "../services/prsService.js";
import { buildPlacementProfile } from "../services/placementProfileService.js";
import { ROLES } from "../config/constants.js";
import {
  DRIVES, STUDENTS, FACULTY, OFFICER, OFFERS,
  SKILLS_BY_DEPT, PROJECTS_BY_DEPT, CERTIFICATIONS,
} from "./cohortData.js";

/**
 * CareerCore — demo roster
 * ========================
 *
 * Leaves the database with exactly ten sign-in accounts, all on one
 * password: one placement officer, three faculty (ISE, CSE, ECE) and six
 * students, two per department, each with a placement history. The roster
 * itself is defined in cohortData.js.
 *
 * ─── WHAT IT REMOVES ──────────────────────────────────────────────────
 *
 * Every user that is not on the roster and is not an admin — students,
 * faculty, placement officers and retired recruiter accounts — together
 * with the records that hang off them, so nothing is left pointing at a
 * user that no longer exists. Drives that a removed staff account created
 * (other than this seed's own drives) go too. Admin accounts are always
 * kept. Audit log entries are immutable by design and stay.
 *
 * Roster accounts that already exist are kept (so drives they created keep
 * their owner) and have their name, role and password reset.
 *
 * DEVELOPMENT DATA. Deterministic and idempotent: running it ten times
 * leaves the same database as running it once. Always try --dry-run first:
 * it lists exactly what would be removed and changes nothing.
 *
 * Usage:  npm run seed:cohort:dry   then   npm run seed:cohort
 *         (run `npm run seed` first)
 */

dotenv.config();

const PASSWORD = "12345678";
const DRY_RUN = process.argv.includes("--dry-run");

/** Every account that should exist after the seed, besides admins. */
const ROSTER = [
  { ...OFFICER, role: ROLES.PLACEMENT_OFFICER },
  ...FACULTY.map((f) => ({ email: f.email, name: f.name, role: ROLES.FACULTY, department: f.dept })),
  ...STUDENTS.map((st) => ({ email: st.email, name: st.name, role: ROLES.STUDENT })),
];
const ROSTER_EMAILS = ROSTER.map((r) => r.email);

const line = (label, n) => console.log(`  ${String(n).padStart(4)}  ${label}`);

/**
 * Deterministic pick — index-based rather than random, so the same student
 * gets the same skills every run and a re-seed does not quietly move PRS.
 *
 * Takes a contiguous run starting at an offset derived from the student's
 * position. An earlier version strode through the array by a fixed step,
 * which collapsed whenever the step shared a factor with the length — a
 * stride of 5 over ten skills yields two distinct values however many are
 * asked for, and every student ended up with the same pair.
 */
const pick = (arr, i, count) => {
  const out = [];
  const n = Math.min(count, arr.length);
  const offset = i % arr.length;
  for (let k = 0; k < n; k++) out.push(arr[(offset + k) % arr.length]);
  return out;
};

/**
 * Career interests that suit each department.
 *
 * PRS compares a student's skills against the required skills of the path
 * they are aiming at, so handing an ISE student a cybersecurity target
 * scores their web skills against a list they share nothing with and drags
 * the whole cohort's readiness down for no reason anyone could defend.
 *
 * The paths are all software-oriented, which is what the career model was
 * trained on. Mechanical and civil students are pointed at the closest
 * available fit; their skill component stays low, and that is honest rather
 * than hidden — the model has nothing to say about a civil engineer.
 */
const PATHS_BY_DEPT = {
  ISE: ["SWE", "WEB", "DA"],
  CSE: ["SWE", "DEVOPS", "MLE", "CLOUD"],
  ECE: ["SWE", "DEVOPS", "QA"],
  EEE: ["DA", "QA"],
  ME: ["DA", "QA"],
  CV: ["DA", "QA"],
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`\nConnected to ${mongoose.connection.name}\n`);

    const skills = await Skill.find({}).select("name");
    const paths = await CareerPath.find({}).select("name code requiredSkills");
    if (!skills.length || !paths.length) {
      throw new Error("Run `npm run seed` first — the skill taxonomy and career paths are missing");
    }
    const skillByName = new Map(skills.map((s) => [s.name.toLowerCase(), s]));
    const sortedPaths = [...paths].sort((a, b) => a.code.localeCompare(b.code));

    // ── What goes ────────────────────────────────────────────
    // Every non-admin account that is not on the roster, and everything
    // hanging off it, so the database is left with no rows pointing at users
    // that no longer exist.
    const admins = await User.find({ role: ROLES.ADMIN }).select("_id email");
    const doomedUsers = await User.find({
      role: { $ne: ROLES.ADMIN },
      email: { $nin: ROSTER_EMAILS },
    }).select("_id email role");
    const doomedUserIds = doomedUsers.map((u) => u._id);
    const doomedStudents = await Student.find({ userId: { $in: doomedUserIds } }).select("_id");
    const doomedStudentIds = doomedStudents.map((x) => x._id);
    const strayDrives = await Drive.find({
      createdBy: { $in: doomedUserIds },
      seedKey: { $exists: false },
    }).select("_id companyName role");
    const strayDriveIds = strayDrives.map((d) => d._id);

    console.log("KEEPING");
    for (const a of admins) console.log(`   ${a.email}  (admin)`);

    console.log("\nREMOVING");
    line("accounts", doomedUsers.length);
    for (const u of doomedUsers) console.log(`        ${u.role.padEnd(18)} ${u.email}`);
    line("student profiles", doomedStudents.length);
    line("drives created by removed accounts", strayDrives.length);
    for (const d of strayDrives) console.log(`        ${d.companyName} · ${d.role}`);

    console.log("\nROSTER (password for every account: " + PASSWORD + ")");
    for (const r of ROSTER) console.log(`   ${r.role.padEnd(18)} ${r.email}`);

    if (DRY_RUN) {
      console.log("\nDry run — nothing was changed.\n");
      process.exit(0);
    }

    // Student-owned records.
    await DriveParticipation.deleteMany({ studentId: { $in: doomedStudentIds } });
    await DriveCandidate.deleteMany({ studentId: { $in: doomedStudentIds } });
    await RoundResult.deleteMany({ studentId: { $in: doomedStudentIds } });
    await ResultSubmission.deleteMany({ studentId: { $in: doomedStudentIds } });
    await AptitudeAttempt.deleteMany({ studentId: { $in: doomedStudentIds } });
    await Application.deleteMany({ studentId: { $in: doomedStudentIds } });
    await Resume.deleteMany({ studentId: { $in: doomedStudentIds } });
    await Student.deleteMany({ _id: { $in: doomedStudentIds } });

    // Staff-owned records, and drives a removed staff account created.
    await ResultSubmission.deleteMany({ requestedBy: { $in: doomedUserIds } });
    await Job.deleteMany({ postedBy: { $in: doomedUserIds } });
    await DriveParticipation.deleteMany({ driveId: { $in: strayDriveIds } });
    await DriveCandidate.deleteMany({ driveId: { $in: strayDriveIds } });
    await RoundResult.deleteMany({ driveId: { $in: strayDriveIds } });
    await ResultSubmission.deleteMany({ driveId: { $in: strayDriveIds } });
    await Drive.deleteMany({ _id: { $in: strayDriveIds } });

    await Notification.deleteMany({ userId: { $in: doomedUserIds } });
    await User.deleteMany({ _id: { $in: doomedUserIds } });

    // ── Roster accounts ──────────────────────────────────────
    // Created if missing; otherwise name, role and password are reset so
    // every account ends up on the one password.
    console.log("\nAccounts...");
    const userByEmail = new Map();
    for (const r of ROSTER) {
      let user = await User.findOne({ email: r.email });
      if (!user) user = new User({ email: r.email });
      user.name = r.name;
      user.role = r.role;
      user.department = r.department;
      user.passwordHash = PASSWORD; // hashed by the pre-save hook
      user.isActive = true;
      user.isVerified = true;
      await user.save();
      userByEmail.set(r.email, user);
      console.log(`  ${r.role.padEnd(18)} ${r.email}`);
    }
    const officer = userByEmail.get(OFFICER.email);

    // ── Drives ───────────────────────────────────────────────
    console.log("\nDrives...");
    const driveByKey = new Map();
    for (const d of DRIVES) {
      const drive = await Drive.findOneAndUpdate(
        { seedKey: d.seedKey },
        { ...d, status: "completed", stages: ["aptitude", "technical", "interview", "final"], createdBy: officer._id },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      driveByKey.set(d.seedKey, drive);
      console.log(
        `  ${drive.companyName.padEnd(18)} ${drive.role.padEnd(26)} ` +
          `${(drive.eligibility.branches ?? []).join(",").padEnd(18)} CGPA ≥ ${drive.eligibility.minCgpa}`,
      );
    }

    // ── Students ─────────────────────────────────────────────
    console.log("\nStudents...");
    const studentByUsn = new Map();
    const missingSkills = new Set();

    for (const [i, spec] of STUDENTS.entries()) {
      const user = userByEmail.get(spec.email);

      // Skills, projects and certifications drawn deterministically from the
      // department's own pools, so a mechanical student is not carrying React.
      const pool = SKILLS_BY_DEPT[spec.dept] ?? SKILLS_BY_DEPT.ISE;
      const skillDocs = [];
      for (const [k, name] of pick(pool, i, spec.skills).entries()) {
        const doc = skillByName.get(name.toLowerCase());
        if (!doc) { missingSkills.add(name); continue; }
        skillDocs.push({
          skillId: doc._id,
          name: doc.name,
          // Spread 3–5 so the skill component of PRS varies between students.
          proficiency: 3 + ((i + k) % 3),
        });
      }

      const projectPool = PROJECTS_BY_DEPT[spec.dept] ?? PROJECTS_BY_DEPT.ISE;
      const projects = pick(projectPool.map((p) => p[0]), i, spec.projects).map((title) => {
        const found = projectPool.find((p) => p[0] === title);
        return { title, description: "Academic project", techStack: found?.[1] ?? [] };
      });

      const certifications = pick(CERTIFICATIONS.map((c) => c[0]), i, spec.certs).map((name) => {
        const found = CERTIFICATIONS.find((c) => c[0] === name);
        return { name, issuer: found?.[1] ?? "NPTEL", issueDate: new Date("2025-03-01T00:00:00Z") };
      });

      let student = await Student.findOne({ userId: user._id });
      if (!student) {
        // A profile left behind under this USN by a removed account would
        // block the unique index.
        await Student.deleteOne({ usn: spec.usn, userId: { $ne: user._id } });
        student = new Student({ userId: user._id, usn: spec.usn });
      }

      student.usn = spec.usn;
      student.batch = "2026";
      student.branch = spec.dept;
      student.cgpa = spec.cgpa;
      student.backlogs = spec.backlogs;
      student.skills = skillDocs;
      student.projects = projects;
      student.certifications = certifications;
      const wanted = PATHS_BY_DEPT[spec.dept] ?? ["SWE"];
      const path =
        sortedPaths.find((p) => p.code === wanted[i % wanted.length]) ?? sortedPaths[0];
      student.careerInterest = path._id;
      student.profileCompleteness = student.computeCompleteness();
      await student.save();

      const total = Math.round(
        (spec.apt.quantitative + spec.apt.logical + spec.apt.verbal + spec.apt.technical) / 4,
      );
      await AptitudeAttempt.findOneAndUpdate(
        { studentId: student._id, status: "submitted" },
        {
          studentId: student._id,
          sectionScores: spec.apt,
          totalScore: total,
          status: "submitted",
          startedAt: new Date("2025-08-01T09:00:00Z"),
          submittedAt: new Date("2025-08-01T09:28:00Z"),
          durationSeconds: 1680,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      studentByUsn.set(spec.usn, student);
    }

    if (missingSkills.size) {
      console.warn(`\n  WARNING: skills not in the taxonomy, skipped: ${[...missingSkills].join(", ")}`);
    }

    const byDept = STUDENTS.reduce((acc, s) => {
      acc[s.dept] = (acc[s.dept] || 0) + 1;
      return acc;
    }, {});
    for (const [dept, n] of Object.entries(byDept)) line(`${dept} students`, n);

    // ── Participations ───────────────────────────────────────
    console.log("\nDrive participations...");
    // The seed's own drives are rebuilt from the roster each run. Only those:
    // registrations in drives run through the recruitment workflow are real
    // records and are left alone.
    await DriveParticipation.deleteMany({
      studentId: { $in: [...studentByUsn.values()].map((s) => s._id) },
      driveId: { $in: [...driveByKey.values()].map((d) => d._id) },
    });

    let written = 0;
    for (const spec of STUDENTS) {
      const student = studentByUsn.get(spec.usn);
      for (const [driveKey, apt, tech, intv, fin] of spec.drives ?? []) {
        const drive = driveByKey.get(driveKey);
        if (!drive) continue;
        const offer = OFFERS[`${spec.usn}:${driveKey}`];

        await DriveParticipation.create({
          driveId: drive._id,
          studentId: student._id,
          registeredAt: drive.driveDate,
          registeredBy: officer._id,
          stages: {
            aptitude: { status: apt, updatedBy: officer._id, updatedAt: drive.driveDate },
            technical: { status: tech, updatedBy: officer._id, updatedAt: drive.driveDate },
            interview: { status: intv, updatedBy: officer._id, updatedAt: drive.driveDate },
            final: {
              status: fin,
              updatedBy: officer._id,
              updatedAt: drive.driveDate,
              ...(offer
                ? {
                    offer: {
                      ctc: offer.ctc ?? drive.ctc,
                      role: drive.role,
                      offerDate: drive.driveDate,
                      accepted: false,
                    },
                  }
                : {}),
            },
          },
          history: [{
            stage: "seed",
            from: null,
            to: "seeded",
            changedAt: drive.driveDate,
            changedBy: officer._id,
            note: "Cohort seed data",
          }],
        });
        written++;
      }
    }
    line("participation records", written);

    // ── PRS, using the existing engine untouched ─────────────
    console.log("\nComputing PRS...");
    for (const [usn, s] of studentByUsn) {
      const fresh = await Student.findById(s._id);
      await computeAndSavePRS(fresh);
      process.stdout.write(".");
    }
    console.log();

    // ── What the rule engine makes of the contrast group ─────
    console.log("\nThe contrast, derived from the records — not written down:");
    for (const usn of STUDENTS.map((st) => st.usn)) {
      const s = studentByUsn.get(usn);
      const p = await buildPlacementProfile(s._id);
      const m = p.metrics;
      console.log(`\n  ${usn}  ${p.student.name.padEnd(16)} PRS ${String(p.student.prs).padEnd(6)} ${p.placementStatus}`);
      console.log(
        `     apt ${m.aptitude.passed}/${m.aptitude.attempts} · tech ${m.technical.passed}/${m.technical.attempts} · ` +
          `interviews ${m.interview.reached} · offers ${m.offers}`,
      );
      console.log(`     ${p.insights.summary}`);
    }

    // ── Summary ──────────────────────────────────────────────
    const placed = [];
    for (const [usn, s] of studentByUsn) {
      const p = await buildPlacementProfile(s._id, { includeStudent: false });
      if (p.metrics.offers > 0) placed.push(usn);
    }

    console.log("\n\nFINAL STATE");
    line("users", await User.countDocuments());
    line("students", await Student.countDocuments());
    line("drives", await Drive.countDocuments());
    line("participations", await DriveParticipation.countDocuments());
    line("students with an offer", placed.length);

    console.log(`\nSIGN-IN ACCOUNTS — every one uses the password: ${PASSWORD}\n`);
    for (const r of ROSTER) console.log(`   ${r.role.padEnd(18)} ${r.email}`);
    for (const a of admins) console.log(`   ${"admin".padEnd(18)} ${a.email}  (existing, password unchanged)`);
    console.log("");

    process.exit(0);
  } catch (err) {
    console.error(`\nCohort seed failed: ${err.message}\n`);
    console.error(err);
    process.exit(1);
  }
};

run();

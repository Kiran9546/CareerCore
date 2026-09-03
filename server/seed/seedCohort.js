import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";

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
import { computeAndSavePRS } from "../services/prsService.js";
import { buildPlacementProfile } from "../services/placementProfileService.js";
import { ROLES, JOB_SOURCE } from "../config/constants.js";
import {
  DRIVES, STUDENTS, FACULTY, OFFERS,
  SKILLS_BY_DEPT, PROJECTS_BY_DEPT, CERTIFICATIONS,
} from "./cohortData.js";

/**
 * CareerCore — build the student cohort
 * =====================================
 *
 * Replaces the placeholder students with a small, real-looking
 * multi-department roll and gives every one of them a placement history,
 * and puts one faculty account in charge of each department on it.
 *
 * ─── WHAT IT LEAVES ALONE ─────────────────────────────────────────────
 *
 * The three sign-in accounts are not to be disturbed:
 *
 *     student.a@mite.ac.in       faculty.demo@mite.ac.in
 *     officer@mite.ac.in         (and the admin account)
 *
 * The student account among them keeps its email and its password exactly
 * as they are; only its USN is brought in line with the rest of the roll,
 * so it does not sit among real identifiers looking obviously invented.
 * Every other student account is replaced.
 *
 * ─── HOW BIG, AND WHY ─────────────────────────────────────────────────
 *
 * Twelve students and five faculty. Department scoping cannot be seen when
 * every student is in one department, nor when there is only one faculty
 * account to sign in as — so the roll spans five departments and each has
 * a faculty member over it, which is the difference between a rule that is
 * implemented and a rule that is demonstrated.
 *
 * It stops there deliberately. This seed exists to be shown and explained,
 * so it is sized to be read in one screen rather than to look like a real
 * institution's database. Every account below, including the four faculty
 * this seed creates, uses the same password, so there is only ever one to
 * remember.
 *
 * DEVELOPMENT DATA. Deterministic and idempotent: no Math.random(), fixed
 * identifiers, every write an upsert. Running it ten times leaves the same
 * database as running it once.
 *
 * Usage:  npm run seed:cohort      (run `npm run seed` first)
 */

dotenv.config();

const PASSWORD = "Demo2026";
const DRY_RUN = process.argv.includes("--dry-run");

/** Accounts that must survive untouched. */
const PROTECTED_EMAILS = [
  ...STUDENTS.filter((s) => s.keepAccount).map((s) => s.keepAccount),
  ...FACULTY.filter((f) => f.keepAccount).map((f) => f.email),
  "officer@mite.ac.in",
];

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

    const officer = await User.findOne({ email: "officer@mite.ac.in" });
    if (!officer) throw new Error("The placement officer account is missing — run `npm run seed:cohort` after creating it");

    // ── What goes ────────────────────────────────────────────
    // Every student account except the protected one. Their profiles and
    // everything hanging off them go too, or the database is left with rows
    // pointing at users that no longer exist.
    const keepUsers = await User.find({ email: { $in: PROTECTED_EMAILS } }).select("_id email");
    const admins = await User.find({ role: ROLES.ADMIN }).select("_id email");
    const protectedIds = [...keepUsers, ...admins].map((u) => u._id);

    const doomedUsers = await User.find({
      role: ROLES.STUDENT,
      _id: { $nin: protectedIds },
    }).select("_id email");
    const doomedStudents = await Student.find({
      userId: { $in: doomedUsers.map((u) => u._id) },
    }).select("_id");

    // Staff accounts accumulate the same way student ones do — a
    // registration made while testing the sign-up form is a real account
    // afterwards, on whatever password was typed at the time, and a suite
    // that creates an officer to act as leaves it behind. Anything not on
    // the roll goes, so what is left is exactly the accounts listed below
    // and every one of them is on the same password.
    const rollFacultyEmails = FACULTY.map((f) => f.email);
    const doomedStaff = await User.find({
      role: { $in: [ROLES.FACULTY, ROLES.PLACEMENT_OFFICER] },
      email: { $nin: [...PROTECTED_EMAILS, ...rollFacultyEmails] },
      _id: { $nin: protectedIds },
    }).select("_id email role");

    console.log("KEEPING");
    for (const u of keepUsers) console.log(`   ${u.email}`);
    for (const a of admins) console.log(`   ${a.email}  (admin)`);

    console.log("\nREPLACING");
    line("student accounts removed", doomedUsers.length);
    line("student profiles removed", doomedStudents.length);
    line("stray staff accounts removed", doomedStaff.length);
    for (const f of doomedStaff) console.log(`        ${f.role.padEnd(18)} ${f.email}`);
    line("students to create", STUDENTS.length);
    line("faculty on the roll", FACULTY.length);
    line("drives", DRIVES.length);

    if (DRY_RUN) {
      console.log("\nDry run — nothing was changed.\n");
      process.exit(0);
    }

    const doomedStudentIds = doomedStudents.map((s) => s._id);
    await DriveParticipation.deleteMany({ studentId: { $in: doomedStudentIds } });
    await ResultSubmission.deleteMany({ studentId: { $in: doomedStudentIds } });
    await AptitudeAttempt.deleteMany({ studentId: { $in: doomedStudentIds } });
    await Application.deleteMany({ studentId: { $in: doomedStudentIds } });
    await Resume.deleteMany({ studentId: { $in: doomedStudentIds } });
    await Notification.deleteMany({ userId: { $in: doomedUsers.map((u) => u._id) } });
    await Student.deleteMany({ _id: { $in: doomedStudentIds } });
    await User.deleteMany({ _id: { $in: doomedUsers.map((u) => u._id) } });

    const doomedStaffIds = doomedStaff.map((u) => u._id);
    await ResultSubmission.deleteMany({ requestedBy: { $in: doomedStaffIds } });
    await Notification.deleteMany({ userId: { $in: doomedStaffIds } });
    await Job.deleteMany({ postedBy: { $in: doomedStaffIds } });

    // Drives a test run created are not part of the roll and only clutter
    // the officer's list. Their participations go first, or the rows outlive
    // the drive they belong to.
    const strayDrives = await Drive.find({
      createdBy: { $in: doomedStaffIds },
      seedKey: { $exists: false },
    }).select("_id");
    const strayDriveIds = strayDrives.map((d) => d._id);
    await DriveParticipation.deleteMany({ driveId: { $in: strayDriveIds } });
    await ResultSubmission.deleteMany({ driveId: { $in: strayDriveIds } });
    await Drive.deleteMany({ _id: { $in: strayDriveIds } });

    await User.deleteMany({ _id: { $in: doomedStaffIds } });

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

    // ── Faculty ──────────────────────────────────────────────
    // One per department on the roll. The department is what every scoped
    // query reads from, so a faculty account without one would see nothing
    // at all; it is set here rather than left to whoever registered.
    console.log("\nFaculty...");
    for (const f of FACULTY) {
      let user = await User.findOne({ email: f.email });
      if (!user) {
        user = await User.create({
          name: f.name,
          email: f.email,
          passwordHash: PASSWORD,
          role: ROLES.FACULTY,
          department: f.dept,
          isVerified: true,
        });
      } else if (!f.keepAccount) {
        user.name = f.name;
        user.department = f.dept;
        await user.save({ validateBeforeSave: false });
      }
      const held = STUDENTS.filter((x) => x.dept === f.dept).length;
      console.log(
        `  ${f.email.padEnd(28)} ${String(user.department ?? f.dept).padEnd(5)} ` +
          `${held} student${held === 1 ? "" : "s"}${f.keepAccount ? "   (unchanged)" : ""}`,
      );
    }

    // ── Students ─────────────────────────────────────────────
    console.log("\nStudents...");
    const studentByUsn = new Map();
    const missingSkills = new Set();

    for (const [i, spec] of STUDENTS.entries()) {
      const email = spec.keepAccount ?? spec.email ?? `${spec.usn.toLowerCase()}@mite.ac.in`;

      let user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          name: spec.name,
          email,
          passwordHash: PASSWORD,
          role: ROLES.STUDENT,
          isVerified: true,
        });
      } else if (!spec.keepAccount) {
        // A regenerated account may have had its name edited; the roll wins.
        user.name = spec.name;
        await user.save({ validateBeforeSave: false });
      }

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
      if (!student) student = new Student({ userId: user._id, usn: spec.usn });

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
    // Cleared wholesale first: a student whose history shrank between runs
    // would otherwise keep the rows the new roll no longer lists.
    await DriveParticipation.deleteMany({
      studentId: { $in: [...studentByUsn.values()].map((s) => s._id) },
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

    // ── An open posting, so the Jobs page is not empty ────────
    await Job.findOneAndUpdate(
      { companyName: "Zoho", title: "Member Technical Staff", source: JOB_SOURCE.PLACEMENT_CELL },
      {
        companyName: "Zoho",
        title: "Member Technical Staff",
        source: JOB_SOURCE.PLACEMENT_CELL,
        postedBy: officer._id,
        role: "Software Engineer",
        location: "Chennai",
        ctc: 900000,
        companyLevel: "dream",
        companyAbout:
          "Product company building business software in-house. Hires for " +
          "long-term product teams rather than for client projects.",
        requirements:
          "Written round followed by two technical rounds and an HR round. " +
          "No bond. Relocation to Chennai required.",
        minCgpa: 7.5,
        maxBacklogs: 0,
        eligibleBranches: ["ISE", "CSE"],
        eligibleBatches: ["2026"],
        openings: 12,
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

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
    for (const usn of ["4MT22IS001", "4MT22IS014", "4MT22IS022", "4MT22IS033", "4MT22IS041"]) {
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

    console.log(`\nSIGN-IN ACCOUNTS — all of them use the one password: ${PASSWORD}`);
    console.log("\n   placement officer   officer@mite.ac.in            (unchanged)");
    for (const f of FACULTY) {
      console.log(
        `   faculty · ${f.dept.padEnd(4)}      ${f.email.padEnd(29)}` +
          (f.keepAccount ? "(unchanged)" : ""),
      );
    }
    console.log("");
    for (const spec of STUDENTS) {
      const email = spec.keepAccount ?? spec.email ?? `${spec.usn.toLowerCase()}@mite.ac.in`;
      console.log(
        `   student · ${spec.dept.padEnd(4)}      ${email.padEnd(29)}` +
          `${spec.usn}${spec.keepAccount ? "  (unchanged)" : ""}`,
      );
    }
    console.log("");

    process.exit(0);
  } catch (err) {
    console.error(`\nCohort seed failed: ${err.message}\n`);
    console.error(err);
    process.exit(1);
  }
};

run();

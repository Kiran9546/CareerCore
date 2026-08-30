import mongoose from "mongoose";
import dotenv from "dotenv";

import User from "../models/User.js";
import Student from "../models/Student.js";
import Skill from "../models/Skill.js";
import CareerPath from "../models/CareerPath.js";
import AptitudeAttempt from "../models/AptitudeAttempt.js";
import Drive from "../models/Drive.js";
import DriveParticipation from "../models/DriveParticipation.js";
import { computeAndSavePRS } from "../services/prsService.js";
import { buildPlacementProfile } from "../services/placementProfileService.js";
import { ROLES, DRIVE_STATUS } from "../config/constants.js";

/**
 * CareerCore — Placement journey demonstration data
 * =================================================
 *
 * DEVELOPMENT DATA ONLY. Nothing here belongs in a production database;
 * real placement results are entered by authorized placement cell staff
 * through the API, which is the only write path to a stage result.
 *
 * ─── WHAT THIS DEMONSTRATES ────────────────────────────────────────────
 *
 * Five students with deliberately SIMILAR academic profiles and similar
 * PRS, and deliberately DIFFERENT placement outcomes:
 *
 *   A  strong CGPA, strong profile — blocked at the aptitude round every
 *      time, zero offers. Never sits a technical round at all.
 *   B  moderate CGPA, good profile — clears aptitude consistently, fails
 *      the technical round repeatedly, zero offers.
 *   C  good profile — clears aptitude and technical, reaches interviews,
 *      converts one into an offer.
 *   D  high performer — clears every stage across several drives, two offers.
 *   E  sparse history — one drive only, so the system must decline to draw
 *      a conclusion.
 *
 * NO CONCLUSION IS HARDCODED. This file writes drive records and nothing
 * else. Every strength, weak area and verdict shown in the UI is produced
 * by placementRuleEngine.js reading those records back — the engine has no
 * idea these five students exist. Change a result below and the narrative
 * changes with it, which is the point.
 *
 * ─── DETERMINISTIC AND IDEMPOTENT ──────────────────────────────────────
 *
 * There is not a single Math.random() call in this file. Fixed emails,
 * fixed USNs, fixed drive seedKeys, fixed stage outcomes. Every write is an
 * upsert keyed on a stable identifier, so running it ten times produces the
 * same database as running it once — no duplicate students, no duplicate
 * drives, no accumulating participations.
 *
 * Usage:  npm run seed:placement     (run `npm run seed` first)
 * ──────────────────────────────────────────────────────────────────────
 */

dotenv.config();

const PASSWORD = "Demo2026";
const OFFICER_EMAIL = "officer@mite.ac.in";
const FACULTY_EMAIL = "faculty.demo@mite.ac.in";

// ─────────────────────────────────────────────────────────────
// STUDENTS — similar on paper, different in practice
// ─────────────────────────────────────────────────────────────
// Skills are named against the seeded taxonomy; any name that does not
// resolve is skipped with a warning rather than silently dropped.

const STUDENTS = [
  {
    key: "A",
    name: "Aarav Shetty",
    email: "student.a@mite.ac.in",
    usn: "4MTPJ26A01",
    branch: "ISE",
    batch: "2026",
    cgpa: 9.1,
    backlogs: 0,
    careerPathCode: null, // resolved to the first available path at runtime
    skills: [
      ["Java", 4], ["Python", 4], ["SQL", 4], ["Data Structures", 5],
      ["Git", 4], ["React", 3], ["Node.js", 3],
    ],
    projects: [
      ["Library Management System", ["Java", "SQL"]],
      ["Portfolio Website", ["React", "Git"]],
      ["Expense Tracker", ["Node.js", "SQL"]],
    ],
    certifications: [
      ["AWS Cloud Practitioner", "Amazon Web Services"],
      ["Python for Everybody", "Coursera"],
      ["NPTEL DBMS", "NPTEL"],
      ["Azure Fundamentals", "Microsoft"],
    ],
    // A practice aptitude score can be high while the real, timed,
    // company-run round is not cleared — that gap is exactly the story.
    aptitude: { quantitative: 74, logical: 78, verbal: 80, technical: 76 },
  },
  {
    key: "B",
    name: "Bhavya Kamath",
    email: "student.b@mite.ac.in",
    usn: "4MTPJ26B01",
    branch: "ISE",
    batch: "2026",
    cgpa: 8.2,
    backlogs: 0,
    careerPathCode: null,
    skills: [
      ["Java", 3], ["Python", 4], ["SQL", 3], ["Data Structures", 3],
      ["Git", 4], ["React", 3], ["HTML", 4], ["CSS", 4],
    ],
    projects: [
      ["Chat Application", ["Node.js", "React"]],
      ["Weather Forecast Dashboard", ["React", "Python"]],
      ["Student Attendance System", ["Java", "SQL"]],
    ],
    certifications: [
      ["Meta Front-End Developer", "Coursera"],
      ["Google Data Analytics", "Google"],
      ["Python for Everybody", "Coursera"],
      ["NPTEL DBMS", "NPTEL"],
    ],
    aptitude: { quantitative: 72, logical: 74, verbal: 70, technical: 66 },
  },
  {
    key: "C",
    name: "Chetan Rao",
    email: "student.c@mite.ac.in",
    usn: "4MTPJ26C01",
    branch: "ISE",
    batch: "2026",
    cgpa: 8.0,
    backlogs: 0,
    careerPathCode: null,
    skills: [
      ["Java", 4], ["Python", 3], ["SQL", 4], ["Data Structures", 4],
      ["Git", 4], ["React", 4], ["Node.js", 3], ["MongoDB", 3],
    ],
    projects: [
      ["E-Commerce Web Application", ["React", "Node.js", "MongoDB"]],
      ["Blood Bank Management", ["Java", "SQL"]],
      ["Food Delivery Clone", ["React", "Node.js"]],
    ],
    certifications: [
      ["AWS Cloud Practitioner", "Amazon Web Services"],
      ["Meta Front-End Developer", "Coursera"],
      ["NPTEL DBMS", "NPTEL"],
      ["Python for Everybody", "Coursera"],
    ],
    aptitude: { quantitative: 70, logical: 72, verbal: 74, technical: 72 },
  },
  {
    key: "D",
    name: "Divya Nayak",
    email: "student.d@mite.ac.in",
    usn: "4MTPJ26D01",
    branch: "ISE",
    batch: "2026",
    cgpa: 8.6,
    backlogs: 0,
    careerPathCode: null,
    skills: [
      ["Java", 5], ["Python", 4], ["SQL", 4], ["Data Structures", 5],
      ["Git", 5], ["React", 4], ["Node.js", 4], ["MongoDB", 4], ["Docker", 3],
    ],
    projects: [
      ["Sentiment Analysis Tool", ["Python"]],
      ["E-Commerce Web Application", ["React", "Node.js", "MongoDB"]],
      ["IoT Home Automation", ["Python", "Docker"]],
    ],
    certifications: [
      ["Machine Learning Specialization", "DeepLearning.AI"],
      ["AWS Cloud Practitioner", "Amazon Web Services"],
      ["Google Data Analytics", "Google"],
      ["Azure Fundamentals", "Microsoft"],
    ],
    aptitude: { quantitative: 84, logical: 86, verbal: 80, technical: 84 },
  },
  {
    key: "E",
    name: "Eshan Prabhu",
    email: "student.e@mite.ac.in",
    usn: "4MTPJ26E01",
    branch: "ISE",
    batch: "2026",
    cgpa: 8.3,
    backlogs: 0,
    careerPathCode: null,
    skills: [
      ["Java", 4], ["Python", 3], ["SQL", 3], ["Data Structures", 4],
      ["Git", 3], ["React", 3],
    ],
    projects: [
      ["Portfolio Website", ["React", "Git"]],
      ["Library Management System", ["Java", "SQL"]],
      ["Expense Tracker", ["Java", "SQL"]],
    ],
    certifications: [
      ["Python for Everybody", "Coursera"],
      ["NPTEL DBMS", "NPTEL"],
      ["Azure Fundamentals", "Microsoft"],
      ["Cisco CCNA", "Cisco"],
    ],
    aptitude: { quantitative: 72, logical: 76, verbal: 72, technical: 74 },
  },
];

// ─────────────────────────────────────────────────────────────
// DRIVES — fixed dates so the seed is reproducible
// ─────────────────────────────────────────────────────────────

const DRIVES = [
  {
    seedKey: "demo-drive-infosys",
    companyName: "Infosys",
    role: "Systems Engineer",
    driveDate: new Date("2025-09-12T00:00:00Z"),
    ctc: 4.5,
    location: "Mysuru",
    stages: ["aptitude", "technical", "interview", "final"],
    status: DRIVE_STATUS.COMPLETED,
    eligibility: { minCgpa: 6.5, maxBacklogs: 0, branches: ["ISE", "CSE"], batches: ["2026"] },
  },
  {
    seedKey: "demo-drive-tcs",
    companyName: "TCS Digital",
    role: "Digital Engineer",
    driveDate: new Date("2025-10-08T00:00:00Z"),
    ctc: 7.0,
    location: "Bengaluru",
    stages: ["aptitude", "technical", "interview", "final"],
    status: DRIVE_STATUS.COMPLETED,
    eligibility: { minCgpa: 7.0, maxBacklogs: 0, branches: ["ISE", "CSE"], batches: ["2026"] },
  },
  {
    seedKey: "demo-drive-wipro",
    companyName: "Wipro",
    role: "Project Engineer",
    driveDate: new Date("2025-11-04T00:00:00Z"),
    ctc: 3.8,
    location: "Bengaluru",
    stages: ["aptitude", "technical", "interview", "final"],
    status: DRIVE_STATUS.COMPLETED,
    eligibility: { minCgpa: 6.0, maxBacklogs: 0, branches: ["ISE", "CSE", "ECE"], batches: ["2026"] },
  },
  {
    seedKey: "demo-drive-zoho",
    companyName: "Zoho",
    role: "Member Technical Staff",
    driveDate: new Date("2025-12-02T00:00:00Z"),
    ctc: 9.0,
    location: "Chennai",
    stages: ["aptitude", "technical", "interview", "final"],
    status: DRIVE_STATUS.COMPLETED,
    eligibility: { minCgpa: 7.5, maxBacklogs: 0, branches: ["ISE", "CSE"], batches: ["2026"] },
  },
];

// ─────────────────────────────────────────────────────────────
// PARTICIPATIONS — the only thing that differs between A–E
// ─────────────────────────────────────────────────────────────
//
// Shorthand: [aptitude, technical, interview, final].
//   p = passed   f = failed   n = not_reached
//   s = selected r = rejected            (final stage only)
//
// Read down a student's column and the pattern is visible in the raw data,
// which is precisely how the rule engine reads it too.

const P = "passed", F = "failed", N = "not_reached";
const SEL = "selected", REJ = "rejected";

const PARTICIPATIONS = {
  // A: registers everywhere, never gets past the aptitude round.
  // Technical/interview stay not_reached — they are not failures.
  A: {
    "demo-drive-infosys": [F, N, N, N],
    "demo-drive-tcs":     [F, N, N, N],
    "demo-drive-wipro":   [F, N, N, N],
    "demo-drive-zoho":    [F, N, N, N],
  },

  // B: clears aptitude every time, then the technical round stops them.
  // Interview stays not_reached throughout.
  B: {
    "demo-drive-infosys": [P, F, N, N],
    "demo-drive-tcs":     [P, F, N, N],
    "demo-drive-wipro":   [P, F, N, N],
    "demo-drive-zoho":    [P, F, N, N],
  },

  // C: gets through, reaches interviews, converts one.
  C: {
    "demo-drive-infosys": [P, P, P, SEL],
    "demo-drive-tcs":     [P, P, F, N],
    "demo-drive-wipro":   [P, F, N, N],
  },

  // D: clears nearly everything; two offers.
  D: {
    "demo-drive-infosys": [P, P, P, SEL],
    "demo-drive-tcs":     [P, P, P, SEL],
    "demo-drive-wipro":   [P, P, P, REJ],
    "demo-drive-zoho":    [P, P, F, N],
  },

  // E: one drive, one result. Not enough for any conclusion.
  E: {
    "demo-drive-wipro":   [F, N, N, N],
  },
};

// Offer terms, applied only where the final status is `selected`.
const OFFERS = {
  "C:demo-drive-infosys": { ctc: 4.5, offerDate: new Date("2025-09-20T00:00:00Z") },
  "D:demo-drive-infosys": { ctc: 4.5, offerDate: new Date("2025-09-20T00:00:00Z") },
  "D:demo-drive-tcs": { ctc: 7.0, offerDate: new Date("2025-10-16T00:00:00Z") },
};

// ─────────────────────────────────────────────────────────────

/**
 * Create the account if it is missing, refresh it if it is not. The
 * plaintext password is handed to the model so the existing pre-save hook
 * does the hashing — there is deliberately no second bcrypt call in this
 * file to drift out of step with User.js.
 *
 * An existing account keeps its current password: re-running the seed must
 * not silently reset a password someone has since changed.
 */
const upsertUser = async (email, name, role) => {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    existing.name = name;
    existing.role = role;
    existing.isActive = true;
    existing.isVerified = true;
    await existing.save({ validateBeforeSave: false });
    return existing;
  }
  return User.create({
    email,
    name,
    role,
    passwordHash: PASSWORD,
    isActive: true,
    isVerified: true,
  });
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`\nConnected to ${mongoose.connection.name}\n`);

    const skills = await Skill.find({}).select("name");
    const paths = await CareerPath.find({}).select("name code requiredSkills");
    if (!skills.length || !paths.length) {
      throw new Error(
        "Run `npm run seed` first — the skill taxonomy and career paths are missing",
      );
    }

    const skillByName = new Map(skills.map((s) => [s.name.toLowerCase(), s]));

    // Deterministic career path choice: the first path by code, so every run
    // picks the same one and PRS is reproducible.
    const defaultPath = [...paths].sort((a, b) =>
      a.code.localeCompare(b.code),
    )[0];

    // ── Staff accounts ───────────────────────────────────────
    console.log("Staff accounts...");
    const officer = await upsertUser(
      OFFICER_EMAIL,
      "Priya Kulkarni",
      ROLES.PLACEMENT_OFFICER,
    );
    const faculty = await upsertUser(
      FACULTY_EMAIL,
      "Dr. Suresh Hegde",
      ROLES.FACULTY,
    );
    console.log(`  ${officer.email.padEnd(28)} placement_officer`);
    console.log(`  ${faculty.email.padEnd(28)} faculty`);

    // ── Students ─────────────────────────────────────────────
    console.log("\nStudents...");
    const studentByKey = new Map();
    const missingSkills = new Set();

    for (const s of STUDENTS) {
      const user = await upsertUser(s.email, s.name, ROLES.STUDENT);

      const skillDocs = [];
      for (const [name, proficiency] of s.skills) {
        const doc = skillByName.get(name.toLowerCase());
        if (!doc) {
          missingSkills.add(name);
          continue;
        }
        skillDocs.push({ skillId: doc._id, name: doc.name, proficiency });
      }

      const path = s.careerPathCode
        ? paths.find((p) => p.code === s.careerPathCode) || defaultPath
        : defaultPath;

      // Upsert on userId so a re-run overwrites rather than duplicating.
      let student = await Student.findOne({ userId: user._id });

      // USN carries a unique index. If some other account already holds this
      // one, stop with an explanation rather than letting a raw duplicate-key
      // error surface — the demo USNs use their own 4MTPJ26* namespace
      // precisely so the random demo generator cannot reach them.
      const usnOwner = await Student.findOne({ usn: s.usn });
      if (usnOwner && String(usnOwner.userId) !== String(user._id)) {
        throw new Error(
          `USN ${s.usn} is already assigned to a different account. ` +
            "Free it, or change this student's USN in seedPlacementDemo.js.",
        );
      }

      if (!student) student = new Student({ userId: user._id, usn: s.usn });

      student.usn = s.usn;
      student.batch = s.batch;
      student.branch = s.branch;
      student.cgpa = s.cgpa;
      student.backlogs = s.backlogs;
      student.skills = skillDocs;
      student.projects = s.projects.map(([title, techStack]) => ({
        title,
        description: "Academic project",
        techStack,
      }));
      student.certifications = s.certifications.map(([name, issuer]) => ({
        name,
        issuer,
        issueDate: new Date("2025-03-01T00:00:00Z"),
      }));
      student.careerInterest = path._id;
      student.profileCompleteness = student.computeCompleteness();
      await student.save();

      // One submitted aptitude attempt each, with fixed section scores.
      // Replaced rather than appended, so re-running does not stack attempts.
      const total = Math.round(
        (s.aptitude.quantitative +
          s.aptitude.logical +
          s.aptitude.verbal +
          s.aptitude.technical) /
          4,
      );
      await AptitudeAttempt.findOneAndUpdate(
        { studentId: student._id, status: "submitted" },
        {
          studentId: student._id,
          sectionScores: s.aptitude,
          totalScore: total,
          status: "submitted",
          startedAt: new Date("2025-08-01T09:00:00Z"),
          submittedAt: new Date("2025-08-01T09:28:00Z"),
          durationSeconds: 1680,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      studentByKey.set(s.key, student);
      console.log(`  ${s.key}  ${s.name.padEnd(18)} ${s.email.padEnd(24)} CGPA ${s.cgpa}`);
    }

    if (missingSkills.size) {
      console.warn(
        `\n  WARNING: skills not found in the taxonomy, skipped: ${[...missingSkills].join(", ")}`,
      );
    }

    // ── Drives ───────────────────────────────────────────────
    console.log("\nDrives...");
    const driveByKey = new Map();

    for (const d of DRIVES) {
      const drive = await Drive.findOneAndUpdate(
        { seedKey: d.seedKey },
        { ...d, createdBy: officer._id },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      driveByKey.set(d.seedKey, drive);
      console.log(
        `  ${drive.companyName.padEnd(14)} ${drive.role.padEnd(26)} ` +
          `CGPA ≥ ${drive.eligibility.minCgpa}`,
      );
    }

    // ── Participations ───────────────────────────────────────
    console.log("\nParticipations...");
    let written = 0;

    for (const [studentKey, byDrive] of Object.entries(PARTICIPATIONS)) {
      const student = studentByKey.get(studentKey);

      for (const [driveKey, [apt, tech, intv, fin]] of Object.entries(byDrive)) {
        const drive = driveByKey.get(driveKey);
        const offer =
          fin === SEL ? OFFERS[`${studentKey}:${driveKey}`] || {} : undefined;

        const stages = {
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
                    offerDate: offer.offerDate ?? drive.driveDate,
                    accepted: false,
                  },
                }
              : {}),
          },
        };

        await DriveParticipation.findOneAndUpdate(
          { driveId: drive._id, studentId: student._id },
          {
            driveId: drive._id,
            studentId: student._id,
            registeredAt: drive.driveDate,
            registeredBy: officer._id,
            stages,
            // Reset rather than append, so repeated runs do not grow the
            // audit trail with identical entries.
            history: [
              {
                stage: "seed",
                from: null,
                to: "seeded",
                changedAt: drive.driveDate,
                changedBy: officer._id,
                note: "Development seed data",
              },
            ],
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        written++;
      }
    }
    console.log(`  ${written} participation records written`);

    // ── PRS (existing engine, formula untouched) ─────────────
    console.log("\nComputing PRS with the existing engine...");
    for (const [key, student] of studentByKey) {
      const fresh = await Student.findById(student._id);
      const result = await computeAndSavePRS(fresh);
      console.log(
        `  ${key}  PRS ${String(result.total ?? "n/a").padEnd(6)} ` +
          `${result.readinessLevel ?? result.message ?? ""}`,
      );
    }

    // ── Verification: what the rule engine actually concludes ─
    console.log("\nDerived placement profiles (generated, not hardcoded):");
    for (const [key, student] of studentByKey) {
      const profile = await buildPlacementProfile(student._id);
      const m = profile.metrics;
      console.log(`\n  ${key} — ${profile.student.name}  (PRS ${profile.student.prs})`);
      console.log(
        `     drives ${m.drivesAttended}/${m.drivesRegistered} · ` +
          `apt ${m.aptitude.passed}/${m.aptitude.attempts} · ` +
          `tech ${m.technical.passed}/${m.technical.attempts} · ` +
          `interviews ${m.interview.reached} · offers ${m.offers}`,
      );
      console.log(`     status: ${profile.placementStatus}`);
      console.log(`     ${profile.insights.summary}`);
      for (const w of profile.insights.weakAreas) console.log(`     weak:     ${w.title}`);
      for (const s of profile.insights.strengths) console.log(`     strength: ${s.title}`);
      for (const o of profile.insights.observations) console.log(`     note:     ${o.title}`);
    }

    console.log(`\n\nAll demo accounts use password: ${PASSWORD}`);
    console.log(`  Placement officer : ${OFFICER_EMAIL}`);
    console.log(`  Faculty           : ${FACULTY_EMAIL}`);
    console.log(`  Students          : student.a@mite.ac.in … student.e@mite.ac.in\n`);

    process.exit(0);
  } catch (err) {
    console.error(`\nSeed failed: ${err.message}\n`);
    console.error(err);
    process.exit(1);
  }
};

run();

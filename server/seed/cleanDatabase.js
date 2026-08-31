import mongoose from "mongoose";
import dotenv from "dotenv";

import User from "../models/User.js";
import Student from "../models/Student.js";
import Resume from "../models/Resume.js";
import AptitudeAttempt from "../models/AptitudeAttempt.js";
import Application from "../models/Application.js";
import Notification from "../models/Notification.js";
import DriveParticipation from "../models/DriveParticipation.js";
import Drive from "../models/Drive.js";
import Job from "../models/Job.js";
import Company from "../models/Company.js";
import { ROLES } from "../config/constants.js";

/**
 * CareerCore — development database cleanup
 * =========================================
 *
 * Reduces a database cluttered by demo generation and test runs back to a
 * deliberate, presentable state:
 *
 *   KEPT   the three sign-in accounts, one per role:
 *            student.a@mite.ac.in     Aarav Shetty
 *            faculty.demo@mite.ac.in  Dr. Suresh Hegde
 *            officer@mite.ac.in       Priya Kulkarni
 *
 *          students B–E and all of their drive records. They carry no login
 *          anyone uses, but they are the evidence behind the project's
 *          central claim — that similar profiles and similar PRS can end in
 *          completely different outcomes. Deleting them would leave the
 *          comparison, the funnel, the roster bands and the not-registered
 *          report with nothing to show.
 *
 *          the four seeded drives and their sixteen participations.
 *
 *   REMOVED every randomly generated demo student, every account left behind
 *          by a test run, and the orphaned rows that pointed at them.
 *
 * DEVELOPMENT ONLY. This deletes user records. It refuses to run against a
 * database whose name does not look like a development one unless --force is
 * passed, because the same connection string style is used in production.
 *
 * Usage:
 *   node seed/cleanDatabase.js --dry-run    show what would go, change nothing
 *   node seed/cleanDatabase.js              perform the cleanup
 */

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

/** The accounts that survive, by email. */
const KEEP_EMAILS = [
  "student.a@mite.ac.in",
  "faculty.demo@mite.ac.in",
  "officer@mite.ac.in",
];

/** Demo students kept as data but not as sign-ins. */
const KEEP_DATA_EMAILS = [
  "student.b@mite.ac.in",
  "student.c@mite.ac.in",
  "student.d@mite.ac.in",
  "student.e@mite.ac.in",
];

const ALL_KEEP = [...KEEP_EMAILS, ...KEEP_DATA_EMAILS];

const line = (label, n) => console.log(`  ${String(n).padStart(5)}  ${label}`);

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const dbName = mongoose.connection.name;
    console.log(`\nConnected to ${dbName}`);

    if (!/dev|test|local|careercore/i.test(dbName) && !FORCE) {
      throw new Error(
        `Refusing to clean "${dbName}" — the name does not look like a ` +
          "development database. Re-run with --force if that is wrong.",
      );
    }

    if (DRY_RUN) console.log("\nDRY RUN — nothing will be deleted.\n");

    // ── Who goes ─────────────────────────────────────────────
    const keepUsers = await User.find({ email: { $in: ALL_KEEP } }).select(
      "_id email role name",
    );
    const keepIds = keepUsers.map((u) => u._id);

    if (keepUsers.length !== ALL_KEEP.length) {
      const found = new Set(keepUsers.map((u) => u.email));
      const missing = ALL_KEEP.filter((e) => !found.has(e));
      console.warn(
        `\n  WARNING: these accounts were expected but not found: ${missing.join(", ")}`,
      );
      console.warn("  Run `npm run seed:placement` first if the demo set is missing.\n");
    }

    // Admin is kept: it is provisioned outside the app and is the only way
    // back in if the other three are ever locked out.
    const admins = await User.find({ role: ROLES.ADMIN }).select("_id email");
    const protectedIds = [...keepIds, ...admins.map((a) => a._id)];

    const doomedUsers = await User.find({
      _id: { $nin: protectedIds },
    }).select("_id email role");

    const doomedUserIds = doomedUsers.map((u) => u._id);
    const doomedStudents = await Student.find({
      userId: { $in: doomedUserIds },
    }).select("_id");
    const doomedStudentIds = doomedStudents.map((s) => s._id);

    console.log("\nKEEPING");
    for (const u of keepUsers) {
      const signIn = KEEP_EMAILS.includes(u.email) ? "  ← sign-in" : "  (data only)";
      console.log(`   ${u.role.padEnd(18)} ${u.email.padEnd(26)}${signIn}`);
    }
    for (const a of admins) console.log(`   ${"admin".padEnd(18)} ${a.email}`);

    console.log("\nREMOVING");
    const byRole = doomedUsers.reduce((acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});
    for (const [role, n] of Object.entries(byRole)) line(`${role} accounts`, n);
    line("student profiles", doomedStudents.length);

    // ── Rows that belong to the removed students ─────────────
    const counts = {
      resumes: await Resume.countDocuments({ studentId: { $in: doomedStudentIds } }),
      aptitude: await AptitudeAttempt.countDocuments({
        studentId: { $in: doomedStudentIds },
      }),
      applications: await Application.countDocuments({
        studentId: { $in: doomedStudentIds },
      }),
      participations: await DriveParticipation.countDocuments({
        studentId: { $in: doomedStudentIds },
      }),
      notifications: await Notification.countDocuments({
        userId: { $in: doomedUserIds },
      }),
    };
    for (const [k, n] of Object.entries(counts)) line(k, n);

    // ── The retired recruiter branch ─────────────────────────
    // Recruiters no longer post; the placement cell does. Removing the
    // account while leaving its Company and Jobs behind would strand a
    // company nobody owns and adverts nobody can edit, so the branch goes
    // as a unit. Placement-cell postings are untouched.
    const doomedCompanies = await Company.find({
      recruiterUserId: { $in: doomedUserIds },
    }).select("_id name");
    const doomedCompanyIds = doomedCompanies.map((c) => c._id);
    const doomedJobs = await Job.find({
      companyId: { $in: doomedCompanyIds },
    }).select("_id title");

    if (doomedCompanies.length) {
      line("recruiter companies", doomedCompanies.length);
      line("their job postings", doomedJobs.length);
    }

    if (DRY_RUN) {
      console.log("\nDry run complete — nothing was changed.\n");
      process.exit(0);
    }

    await Application.deleteMany({ jobId: { $in: doomedJobs.map((j) => j._id) } });
    await Job.deleteMany({ _id: { $in: doomedJobs.map((j) => j._id) } });
    await Company.deleteMany({ _id: { $in: doomedCompanyIds } });

    // ── Delete, children before parents ──────────────────────
    await Resume.deleteMany({ studentId: { $in: doomedStudentIds } });
    await AptitudeAttempt.deleteMany({ studentId: { $in: doomedStudentIds } });
    await Application.deleteMany({ studentId: { $in: doomedStudentIds } });
    await DriveParticipation.deleteMany({ studentId: { $in: doomedStudentIds } });
    await Notification.deleteMany({ userId: { $in: doomedUserIds } });
    await Student.deleteMany({ _id: { $in: doomedStudentIds } });
    await User.deleteMany({ _id: { $in: doomedUserIds } });

    // ── Sweep orphans left by earlier partial deletions ──────
    // A row whose owner no longer exists renders as a blank line in every
    // list that touches it, so these are cleared regardless of who removed
    // the parent.
    const liveStudentIds = (await Student.find({}).select("_id")).map((s) => s._id);
    const liveUserIds = (await User.find({}).select("_id")).map((u) => u._id);
    const liveDriveIds = (await Drive.find({}).select("_id")).map((d) => d._id);

    const orphans = {
      participations: (
        await DriveParticipation.deleteMany({
          $or: [
            { studentId: { $nin: liveStudentIds } },
            { driveId: { $nin: liveDriveIds } },
          ],
        })
      ).deletedCount,
      applications: (
        await Application.deleteMany({ studentId: { $nin: liveStudentIds } })
      ).deletedCount,
      resumes: (await Resume.deleteMany({ studentId: { $nin: liveStudentIds } }))
        .deletedCount,
      aptitude: (
        await AptitudeAttempt.deleteMany({ studentId: { $nin: liveStudentIds } })
      ).deletedCount,
      notifications: (
        await Notification.deleteMany({ userId: { $nin: liveUserIds } })
      ).deletedCount,
    };
    const orphanTotal = Object.values(orphans).reduce((a, b) => a + b, 0);
    if (orphanTotal) {
      console.log("\nORPHANS SWEPT");
      for (const [k, n] of Object.entries(orphans)) if (n) line(k, n);
    }

    // ── Result ───────────────────────────────────────────────
    console.log("\nFINAL STATE");
    const final = {
      users: await User.countDocuments(),
      students: await Student.countDocuments(),
      drives: await Drive.countDocuments(),
      driveParticipations: await DriveParticipation.countDocuments(),
      jobs: await Job.countDocuments(),
      companies: await Company.countDocuments(),
      applications: await Application.countDocuments(),
      aptitudeAttempts: await AptitudeAttempt.countDocuments(),
      resumes: await Resume.countDocuments(),
      notifications: await Notification.countDocuments(),
    };
    for (const [k, n] of Object.entries(final)) line(k, n);

    console.log("\nSIGN-IN ACCOUNTS — password Demo2026");
    for (const email of KEEP_EMAILS) {
      const u = await User.findOne({ email }).select("email role name");
      if (u) console.log(`   ${u.role.padEnd(18)} ${u.email.padEnd(26)} ${u.name}`);
    }
    console.log();

    process.exit(0);
  } catch (err) {
    console.error(`\nCleanup failed: ${err.message}\n`);
    process.exit(1);
  }
};

run();

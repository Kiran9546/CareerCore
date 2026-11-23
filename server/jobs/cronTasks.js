import cron from "node-cron";
import { runExclusive } from "./jobLock.js";
import Student from "../models/Student.js";
import Notification from "../models/Notification.js";
import { notify } from "../services/notificationService.js";
import { computePRS } from "../services/prsService.js";
import {
  closeExpiredRegistrations,
  remindRegistrationDeadlines,
  remindUpcomingRounds,
} from "./recruitmentTasks.js";
import {
  LOW_PRS_THRESHOLD,
  LOW_PRS_DAYS,
} from "../config/constants.js";

const runLowPrsCheck = async () => {
  const cutoff = new Date(Date.now() - LOW_PRS_DAYS * 24 * 60 * 60 * 1000);

  const students = await Student.find({
    currentPRS: { $gt: 0, $lt: LOW_PRS_THRESHOLD },
    lastPrsComputedAt: { $lt: cutoff },
  }).select("userId currentPRS prsBreakdown careerInterest");

  let sent = 0;

  for (const s of students) {
    const recent = await Notification.findOne({
      userId: s.userId,
      type: "low_prs",
      createdAt: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });
    if (recent) continue;

    const weakest = Object.entries(s.prsBreakdown.toObject?.() ?? s.prsBreakdown)
      .sort((a, b) => a[1] - b[1])[0];

    await notify({
      userId: s.userId,
      type: "low_prs",
      title: `Your readiness score is ${s.currentPRS}`,
      body: `Your Placement Readiness Score has stayed below ${LOW_PRS_THRESHOLD} for over ${LOW_PRS_DAYS} days. Your weakest area is ${weakest[0]} at ${weakest[1]}. Check your recommended resources to improve it.`,
      link: "/student/learn",
      metadata: { prs: s.currentPRS },
    });
    sent++;
  }

  console.log(`[cron] low-PRS alerts sent: ${sent}`);
};

const runSkillReminder = async () => {
  const students = await Student.find({ careerInterest: { $ne: null } })
    .select("userId")
    .limit(200);

  let sent = 0;

  for (const s of students) {
    const recent = await Notification.findOne({
      userId: s.userId,
      type: "skill_reminder",
      createdAt: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });
    if (recent) continue;

    const full = await Student.findById(s._id);
    const prs = await computePRS(full);
    if (!prs.computable || !prs.skillAnalysis.available) continue;

    const top = prs.skillAnalysis.gaps[0];
    if (!top) continue;

    await notify({
      userId: s.userId,
      type: "skill_reminder",
      title: `Focus this week: ${top.skill}`,
      body: `${top.skill} is your highest-priority gap for ${prs.careerPath.name}. You're at level ${top.currentLevel} against a target of ${top.targetLevel}.`,
      link: "/student/learn",
      metadata: { skill: top.skill, priority: top.priority },
    });
    sent++;
  }

  console.log(`[cron] skill reminders sent: ${sent}`);
};

const MINUTE = 60 * 1000;

/** Live cron tasks, so a graceful shutdown can stop them. */
const tasks = [];

/**
 * Schedule `fn` under a cluster-wide lease. Every instance schedules every
 * job, but only the one that wins the lease for a tick runs it, so adding
 * API instances never duplicates notifications.
 */
const schedule = (expression, name, leaseMs, fn) => {
  tasks.push(
    cron.schedule(expression, async () => {
      try {
        const n = await runExclusive(`cron:${name}`, leaseMs, fn);
        if (n) console.log(`[cron] ${name}: ${n}`);
      } catch (err) {
        console.error(`[cron] ${name} failed: ${err.message}`);
      }
    })
  );
};

export const startCronJobs = () => {
  if (process.env.DISABLE_CRON === "true") {
    console.log("[cron] disabled via DISABLE_CRON");
    return;
  }

  // Mondays 09:00 / Wednesdays 09:00
  schedule("0 9 * * 1", "low-PRS alerts", 60 * MINUTE, runLowPrsCheck);
  schedule("0 9 * * 3", "skill reminders", 60 * MINUTE, runSkillReminder);

  // Recruitment workflow: close registration at the deadline (every 10 min),
  // deadline reminders (hourly), upcoming-round reminders (daily 6pm).
  schedule("*/10 * * * *", "registrations closed", 5 * MINUTE, closeExpiredRegistrations);
  schedule("15 * * * *", "registration deadline reminders", 30 * MINUTE, remindRegistrationDeadlines);
  schedule("0 18 * * *", "upcoming round reminders", 60 * MINUTE, remindUpcomingRounds);

  console.log("[cron] scheduled: low-PRS (Mon 9am), skill reminders (Wed 9am), recruitment workflow");
};

export const stopCronJobs = () => {
  for (const t of tasks.splice(0)) t.stop();
};

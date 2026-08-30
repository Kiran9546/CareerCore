import cron from "node-cron";
import Student from "../models/Student.js";
import Job from "../models/Job.js";
import Application from "../models/Application.js";
import Notification from "../models/Notification.js";
import { notify } from "../services/notificationService.js";
import { computeMatch } from "../services/matchingService.js";
import { computePRS } from "../services/prsService.js";
import {
  LOW_PRS_THRESHOLD,
  LOW_PRS_DAYS,
  JOB_ALERT_MATCH_THRESHOLD,
} from "../config/constants.js";

export const notifyMatchingStudents = async (job) => {
  const students = await Student.find({ careerInterest: { $ne: null } })
    .select("userId cgpa backlogs branch batch skills currentPRS");

  let sent = 0;

  for (const s of students) {
    const m = computeMatch(s, job);
    if (!m.eligible || m.matchPercent < JOB_ALERT_MATCH_THRESHOLD) continue;

    await notify({
      userId: s.userId,
      type: "new_job",
      title: `New role matching your profile — ${m.matchPercent}%`,
      body: `${job.title} is now open. Based on your skills and PRS, you're a ${m.matchPercent}% match.`,
      link: "/student/jobs",
      metadata: { jobId: job._id, matchPercent: m.matchPercent },
    });
    sent++;
  }

  return sent;
};

/**
 * Announce a placement-cell posting to every ELIGIBLE student.
 *
 * Deliberately different from notifyMatchingStudents() above, which only
 * reaches students clearing JOB_ALERT_MATCH_THRESHOLD. That gate is right
 * for a recruiter's own advert — a low-match student does not want it. It
 * is wrong for the placement cell, whose job is to tell everyone eligible
 * that a drive is open; filtering by skill match would quietly hide the
 * announcement from exactly the students who most need to see it.
 *
 * Match percent is still computed and carried in the notification so the
 * student sees how well they fit, but it never decides who is told.
 */
export const notifyEligibleStudents = async (job, companyName) => {
  const students = await Student.find({})
    .select("userId cgpa backlogs branch batch skills currentPRS");

  const items = [];
  for (const s of students) {
    const m = computeMatch(s, job);
    if (!m.eligible) continue;
    items.push({
      userId: s.userId,
      type: "new_job",
      title: `New opening — ${companyName}`,
      body:
        `The placement cell has posted ${job.title} at ${companyName}` +
        `${job.ctc ? ` (₹${(job.ctc / 100000).toFixed(1)} LPA)` : ""}. ` +
        `You meet the eligibility criteria and are a ${m.matchPercent}% skill match.`,
      link: "/student/jobs",
      metadata: { jobId: job._id, matchPercent: m.matchPercent, source: job.source },
    });
  }

  // Settled in parallel: one student's failed email must not stop the rest
  // of the batch from being told.
  const results = await Promise.allSettled(items.map((i) => notify(i)));
  return results.filter((r) => r.status === "fulfilled").length;
};

export const notifyApplicationStatus = async (application, job, companyName) => {
  const student = await Student.findById(application.studentId).select("userId");
  if (!student) return;

  const messages = {
    shortlisted: ["You've been shortlisted", `${companyName} has shortlisted you for ${job.title}.`],
    interview_scheduled: ["Interview scheduled", `${companyName} has moved you to the interview stage for ${job.title}.`],
    offered: ["Offer received", `${companyName} has extended an offer for ${job.title}.`],
    rejected: ["Application update", `Your application for ${job.title} at ${companyName} was not taken forward.`],
  };

  const m = messages[application.status];
  if (!m) return;

  await notify({
    userId: student.userId,
    type: "application_status",
    title: m[0],
    body: m[1],
    link: "/student/applications",
    metadata: { applicationId: application._id, status: application.status },
  });
};

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

const runDeadlineCheck = async () => {
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const jobs = await Job.find({
    isActive: true,
    deadline: { $gte: new Date(), $lte: soon },
  }).populate("companyId", "name");

  let sent = 0;

  for (const job of jobs) {
    const applied = await Application.find({ jobId: job._id }).distinct("studentId");

    const students = await Student.find({
      _id: { $nin: applied },
      careerInterest: { $ne: null },
    }).select("userId cgpa backlogs branch batch skills currentPRS");

    for (const s of students) {
      const m = computeMatch(s, job);
      if (!m.eligible || m.matchPercent < JOB_ALERT_MATCH_THRESHOLD) continue;

      const recent = await Notification.findOne({
        userId: s.userId,
        type: "new_job",
        "metadata.jobId": job._id,
        createdAt: { $gt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      });
      if (recent) continue;

      const days = Math.ceil((job.deadline - Date.now()) / (24 * 60 * 60 * 1000));

      await notify({
        userId: s.userId,
        type: "new_job",
        title: `Deadline in ${days} day${days > 1 ? "s" : ""}`,
        body: `Applications for ${job.title} at ${job.companyId?.name} close soon. You're a ${m.matchPercent}% match and haven't applied yet.`,
        link: "/student/jobs",
        metadata: { jobId: job._id, matchPercent: m.matchPercent },
      });
      sent++;
    }
  }

  console.log(`[cron] deadline reminders sent: ${sent}`);
};

export const startCronJobs = () => {
  if (process.env.DISABLE_CRON === "true") {
    console.log("[cron] disabled via DISABLE_CRON");
    return;
  }

  // Mondays 09:00
  cron.schedule("0 9 * * 1", runLowPrsCheck);

  // Wednesdays 09:00
  cron.schedule("0 9 * * 3", runSkillReminder);

  // Daily 08:00
  cron.schedule("0 8 * * *", runDeadlineCheck);

  console.log("[cron] scheduled: low-PRS (Mon 9am), skill reminders (Wed 9am), deadlines (daily 8am)");
};

// Exported for manual triggering from the admin panel
export const cronTasks = {
  lowPrs: runLowPrsCheck,
  skillReminder: runSkillReminder,
  deadlines: runDeadlineCheck,
};
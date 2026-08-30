import Job from "../models/Job.js";
import Application from "../models/Application.js";
import { resolveSkills, resolveSkill } from "../services/skillNormalizer.js";
import { notifyEligibleStudents } from "../jobs/cronTasks.js";
import { toAttachments, removeJobDoc } from "../middleware/uploadJobDoc.js";
import { JOB_SOURCE, COMPANY_LEVELS } from "../config/constants.js";

/**
 * Job postings created by the placement cell.
 *
 * Kept separate from recruiter.controller.js rather than bolted onto it:
 * that controller scopes every query by `Company.recruiterUserId`, which is
 * exactly the ownership model that does not apply here. The placement
 * officer relays openings for companies that have no account at all, so
 * ownership is `postedBy` and the company is a name plus whatever material
 * the company sent.
 *
 * The Job documents produced here are ordinary jobs. Students browse,
 * match against and apply to them through the existing student routes with
 * no special-casing — the only thing that differs is who created them and
 * that they may carry attachments.
 */

/**
 * Parse a field that arrives either as JSON (multipart form-data can only
 * carry strings) or as a real value (a plain JSON request body).
 */
const parseMaybeJson = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    // A bare comma-separated string is a reasonable thing for a form to send.
    return value.includes(",")
      ? value.split(",").map((v) => v.trim()).filter(Boolean)
      : value;
  }
};

const asArray = (value) => {
  const parsed = parseMaybeJson(value, []);
  if (Array.isArray(parsed)) return parsed;
  return parsed ? [parsed] : [];
};

const toNumberOrUndefined = (v) =>
  v === undefined || v === null || v === "" ? undefined : Number(v);

/**
 * Job.ctc is stored in rupees — that is the unit the recruiter path has
 * always written and the unit the student jobs page divides by 100000 to
 * render. Officers think and type in LPA, so the conversion happens here,
 * once, rather than letting two units share one field.
 */
const LPA_TO_RUPEES = 100000;
const ctcFromLpa = (v) => {
  const n = toNumberOrUndefined(v);
  return n === undefined ? undefined : Math.round(n * LPA_TO_RUPEES);
};

/**
 * Resolve the skill list against the taxonomy, preserving the mandatory
 * flag across alias normalisation. Mirrors the recruiter path: the flag is
 * keyed by the resolved skill id, not the raw text, so "reactjs" flagged
 * mandatory still lands on "React".
 */
const buildRequiredSkills = async (input) => {
  const list = asArray(input).filter((s) => s && s.name);
  if (!list.length) return { skills: [], unresolved: [] };

  const { resolved, unresolved } = await resolveSkills(
    list.map((s) => ({ name: s.name, proficiency: 3 })),
  );

  const mandatoryBySkillId = new Map();
  for (const s of list) {
    const skill = await resolveSkill(s.name);
    if (!skill) continue;
    const id = String(skill._id);
    mandatoryBySkillId.set(id, mandatoryBySkillId.get(id) || !!s.isMandatory);
  }

  return {
    skills: resolved.map((r) => ({
      skillId: r.skillId,
      name: r.name,
      isMandatory: mandatoryBySkillId.get(String(r.skillId)) ?? false,
    })),
    unresolved,
  };
};

/** GET /api/placement/jobs — postings, newest first, with applicant counts. */
export const listJobs = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.source) filter.source = req.query.source;
    if (req.query.active === "true") filter.isActive = true;
    if (req.query.active === "false") filter.isActive = false;

    const jobs = await Job.find(filter)
      .populate("companyId", "name industry location logoUrl")
      .populate("postedBy", "name")
      .sort("-createdAt")
      .limit(200);

    const counts = await Application.aggregate([
      { $match: { jobId: { $in: jobs.map((j) => j._id) } } },
      { $group: { _id: "$jobId", applicants: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.applicants]));

    res.json({
      jobs: jobs.map((j) => ({
        ...j.toJSON(),
        company: j.companyLabel,
        applicantCount: countMap.get(String(j._id)) || 0,
      })),
      total: jobs.length,
      companyLevels: COMPANY_LEVELS,
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/placement/jobs/:id */
export const getJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("companyId", "name industry location logoUrl")
      .populate("postedBy", "name");
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({ job: { ...job.toJSON(), company: job.companyLabel } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/placement/jobs
 *
 * Accepts multipart/form-data so the JD can be uploaded in the same
 * request as the details. Array and object fields therefore arrive as JSON
 * strings and are parsed defensively above.
 */
export const createJob = async (req, res, next) => {
  try {
    const { title, companyName } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ message: "Job title is required" });
    }
    if (!companyName?.trim()) {
      return res.status(400).json({ message: "Company name is required" });
    }

    const { skills, unresolved } = await buildRequiredSkills(req.body.requiredSkills);

    const job = await Job.create({
      companyName: companyName.trim(),
      source: JOB_SOURCE.PLACEMENT_CELL,
      postedBy: req.user._id,
      title: title.trim(),
      description: req.body.description,
      role: req.body.role,
      location: req.body.location,
      ctc: ctcFromLpa(req.body.ctc),
      companyLevel: req.body.companyLevel || undefined,
      companyAbout: req.body.companyAbout,
      requirements: req.body.requirements,
      requiredSkills: skills,
      minCgpa: toNumberOrUndefined(req.body.minCgpa) ?? 0,
      maxBacklogs: toNumberOrUndefined(req.body.maxBacklogs) ?? 99,
      eligibleBranches: asArray(req.body.eligibleBranches),
      eligibleBatches: asArray(req.body.eligibleBatches),
      deadline: req.body.deadline || undefined,
      openings: toNumberOrUndefined(req.body.openings) ?? 1,
      attachments: toAttachments(req.files),
    });

    // Announce to every eligible student, not only high matches — see
    // notifyEligibleStudents() for why the placement cell needs the wider net.
    const notified = await notifyEligibleStudents(job, job.companyName);

    res.status(201).json({
      job: { ...job.toJSON(), company: job.companyLabel },
      unresolvedSkills: unresolved,
      studentsNotified: notified,
      message:
        `Posted. ${notified} eligible student${notified === 1 ? "" : "s"} notified.` +
        (unresolved.length
          ? ` ${unresolved.length} skill name(s) were not recognised.`
          : ""),
    });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/placement/jobs/:id — edit, optionally adding more documents. */
export const updateJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // The placement cell owns its own postings. A recruiter's advert stays
    // the recruiter's to edit, even though staff can see it in the list.
    if (job.source !== JOB_SOURCE.PLACEMENT_CELL) {
      return res.status(403).json({
        message:
          "This job was posted by a recruiter through their own account and " +
          "cannot be edited from the placement cell.",
      });
    }

    for (const f of [
      "title", "description", "role", "location",
      "companyName", "companyAbout", "requirements", "companyLevel",
    ]) {
      if (req.body[f] !== undefined) job[f] = req.body[f];
    }
    if (req.body.ctc !== undefined) job.ctc = ctcFromLpa(req.body.ctc);
    for (const f of ["minCgpa", "maxBacklogs", "openings"]) {
      if (req.body[f] !== undefined) job[f] = toNumberOrUndefined(req.body[f]);
    }
    if (req.body.deadline !== undefined) {
      job.deadline = req.body.deadline || undefined;
    }
    if (req.body.eligibleBranches !== undefined) {
      job.eligibleBranches = asArray(req.body.eligibleBranches);
    }
    if (req.body.eligibleBatches !== undefined) {
      job.eligibleBatches = asArray(req.body.eligibleBatches);
    }
    if (req.body.requiredSkills !== undefined) {
      const { skills } = await buildRequiredSkills(req.body.requiredSkills);
      job.requiredSkills = skills;
    }
    if (req.files?.length) {
      job.attachments.push(...toAttachments(req.files));
    }

    await job.save();
    res.json({ job: { ...job.toJSON(), company: job.companyLabel } });
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/placement/jobs/:id/toggle — open or close applications. */
export const toggleJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.source !== JOB_SOURCE.PLACEMENT_CELL) {
      return res
        .status(403)
        .json({ message: "Only placement cell postings can be toggled here" });
    }

    job.isActive = !job.isActive;
    await job.save();
    res.json({ job: { ...job.toJSON(), company: job.companyLabel } });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/placement/jobs/:id/attachments/:attachmentId */
export const removeAttachment = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.source !== JOB_SOURCE.PLACEMENT_CELL) {
      return res
        .status(403)
        .json({ message: "Only placement cell postings can be edited here" });
    }

    const doc = job.attachments.id(req.params.attachmentId);
    if (!doc) return res.status(404).json({ message: "Attachment not found" });

    removeJobDoc(doc.filename);
    job.attachments.pull({ _id: req.params.attachmentId });
    await job.save();

    res.json({ attachments: job.attachments });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/placement/jobs/:id */
export const deleteJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.source !== JOB_SOURCE.PLACEMENT_CELL) {
      return res
        .status(403)
        .json({ message: "Only placement cell postings can be deleted here" });
    }

    // Students who already applied have this posting in their history.
    // Closing it keeps that history readable; deleting it would orphan them.
    const applicants = await Application.countDocuments({ jobId: job._id });
    if (applicants > 0) {
      return res.status(409).json({
        message:
          `${applicants} student(s) have already applied to this posting. ` +
          "Close it to new applications instead of deleting it.",
      });
    }

    for (const a of job.attachments) removeJobDoc(a.filename);
    await job.deleteOne();

    res.json({ message: "Posting deleted" });
  } catch (err) {
    next(err);
  }
};

/** GET /api/placement/jobs/:id/applicants */
export const listApplicants = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const applications = await Application.find({ jobId: job._id })
      .populate({
        path: "studentId",
        select: "usn batch branch cgpa backlogs currentPRS readinessLevel userId",
        populate: { path: "userId", select: "name email" },
      })
      .sort("-matchPercent");

    res.json({
      job: { _id: job._id, title: job.title, company: job.companyLabel },
      applicants: applications
        .filter((a) => a.studentId)
        .map((a) => ({
          _id: a._id,
          status: a.status,
          matchPercent: a.matchPercent,
          appliedAt: a.appliedAt,
          student: {
            _id: a.studentId._id,
            name: a.studentId.userId?.name,
            email: a.studentId.userId?.email,
            usn: a.studentId.usn,
            branch: a.studentId.branch,
            batch: a.studentId.batch,
            cgpa: a.studentId.cgpa,
          },
        })),
      total: applications.length,
    });
  } catch (err) {
    next(err);
  }
};

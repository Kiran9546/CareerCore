import Company from "../models/Company.js";
import Job from "../models/Job.js";
import Application from "../models/Application.js";
import Student from "../models/Student.js";
import { computeMatch } from "../services/matchingService.js";
import { resolveSkill, resolveSkills } from "../services/skillNormalizer.js";
import { APPLICATION_STATUS } from "../config/constants.js";
import { notifyMatchingStudents, notifyApplicationStatus } from "../jobs/cronTasks.js";

export const getCompany = async (req, res, next) => {
  try {
    const company = await Company.findOne({ recruiterUserId: req.user._id });
    if (!company)
      return res
        .status(404)
        .json({ message: "Company profile not created", hasCompany: false });
    res.json({ company, hasCompany: true });
  } catch (err) {
    next(err);
  }
};

export const createCompany = async (req, res, next) => {
  try {
    const existing = await Company.findOne({ recruiterUserId: req.user._id });
    if (existing)
      return res
        .status(409)
        .json({ message: "Company profile already exists" });

    const { name, industry, website, description, location } = req.body;
    if (!name)
      return res.status(400).json({ message: "Company name is required" });

    const company = await Company.create({
      recruiterUserId: req.user._id,
      name,
      industry,
      website,
      description,
      location,
    });
    res.status(201).json({ company });
  } catch (err) {
    next(err);
  }
};

export const updateCompany = async (req, res, next) => {
  try {
    const company = await Company.findOne({ recruiterUserId: req.user._id });
    if (!company)
      return res.status(404).json({ message: "Company profile not found" });

    for (const f of [
      "name",
      "industry",
      "website",
      "description",
      "location",
    ]) {
      if (req.body[f] !== undefined) company[f] = req.body[f];
    }
    await company.save();
    res.json({ company });
  } catch (err) {
    next(err);
  }
};

export const listJobs = async (req, res, next) => {
  try {
    const company = await Company.findOne({ recruiterUserId: req.user._id });
    if (!company)
      return res
        .status(404)
        .json({ message: "Create your company profile first" });

    const jobs = await Job.find({ companyId: company._id }).sort("-createdAt");

    const counts = await Application.aggregate([
      { $match: { jobId: { $in: jobs.map((j) => j._id) } } },
      { $group: { _id: "$jobId", total: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.total]));

    res.json({
      jobs: jobs.map((j) => ({
        ...j.toObject(),
        applicantCount: countMap.get(String(j._id)) || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
};

export const createJob = async (req, res, next) => {
  try {
    const company = await Company.findOne({ recruiterUserId: req.user._id });
    if (!company)
      return res
        .status(404)
        .json({ message: "Create your company profile first" });

    const {
      title,
      description,
      role,
      location,
      ctc,
      requiredSkills = [],
      minCgpa,
      maxBacklogs,
      eligibleBranches,
      eligibleBatches,
      deadline,
      openings,
    } = req.body;

    if (!title)
      return res.status(400).json({ message: "Job title is required" });

    const { resolved, unresolved } = await resolveSkills(
      requiredSkills.map((s) => ({ name: s.name, proficiency: 3 })),
    );

    // Key the mandatory flags by resolved skill id, not by what the recruiter
    // typed: resolveSkills() returns the CANONICAL name, so keying on the raw
    // input silently dropped isMandatory whenever an alias was entered
    // ("reactjs" -> "React", "mongo db" -> "MongoDB").
    const mandatoryBySkillId = new Map();
    for (const s of requiredSkills) {
      const skill = await resolveSkill(s.name);
      if (!skill) continue;
      const id = String(skill._id);
      // If any spelling of the skill was flagged mandatory, it stays mandatory.
      mandatoryBySkillId.set(id, mandatoryBySkillId.get(id) || !!s.isMandatory);
    }

    const job = await Job.create({
      companyId: company._id,
      title,
      description,
      role,
      location,
      ctc,
      requiredSkills: resolved.map((r) => ({
        skillId: r.skillId,
        name: r.name,
        isMandatory: mandatoryBySkillId.get(String(r.skillId)) ?? false,
      })),
      minCgpa: minCgpa ?? 0,
      maxBacklogs: maxBacklogs ?? 99,
      eligibleBranches: eligibleBranches ?? [],
      eligibleBatches: eligibleBatches ?? [],
      deadline,
      openings: openings ?? 1,
    });

    const notified = await notifyMatchingStudents(job);
    res.status(201).json({ job, unresolvedSkills: unresolved, studentsNotified: notified });
  } catch (err) {
    next(err);
  }
};

export const toggleJob = async (req, res, next) => {
  try {
    const company = await Company.findOne({ recruiterUserId: req.user._id });
    const job = await Job.findOne({
      _id: req.params.id,
      companyId: company?._id,
    });
    if (!job) return res.status(404).json({ message: "Job not found" });

    job.isActive = !job.isActive;
    await job.save();
    res.json({ job });
  } catch (err) {
    next(err);
  }
};

export const searchCandidates = async (req, res, next) => {
  try {
    const company = await Company.findOne({ recruiterUserId: req.user._id });
    const job = await Job.findOne({
      _id: req.params.jobId,
      companyId: company?._id,
    });
    if (!job) return res.status(404).json({ message: "Job not found" });

    const filter = {};
    if (req.query.branch) filter.branch = req.query.branch;
    if (req.query.batch) filter.batch = req.query.batch;
    if (req.query.minPRS)
      filter.currentPRS = { $gte: Number(req.query.minPRS) };

    const students = await Student.find(filter)
      .populate("userId", "name email")
      .select(
        "usn batch branch cgpa backlogs skills currentPRS readinessLevel projects certifications",
      );

    const scored = students
      .map((s) => {
        const m = computeMatch(s, job);
        return {
          studentId: s._id,
          name: s.userId?.name,
          email: s.userId?.email,
          usn: s.usn,
          batch: s.batch,
          branch: s.branch,
          cgpa: s.cgpa,
          backlogs: s.backlogs,
          prs: s.currentPRS,
          readinessLevel: s.readinessLevel,
          skillCount: s.skills.length,
          projectCount: s.projects.length,
          ...m,
        };
      })
      .sort((a, b) => b.matchPercent - a.matchPercent);

    const applications = await Application.find({ jobId: job._id }).select(
      "studentId status",
    );
    const appMap = new Map(
      applications.map((a) => [String(a.studentId), a.status]),
    );

    res.json({
      job: {
        id: job._id,
        title: job.title,
        minCgpa: job.minCgpa,
        maxBacklogs: job.maxBacklogs,
      },
      candidates: scored.map((c) => ({
        ...c,
        applicationStatus: appMap.get(String(c.studentId)) || null,
      })),
      eligibleCount: scored.filter((c) => c.eligible).length,
      totalCount: scored.length,
    });
  } catch (err) {
    next(err);
  }
};

export const listApplicants = async (req, res, next) => {
  try {
    const company = await Company.findOne({ recruiterUserId: req.user._id });
    const job = await Job.findOne({
      _id: req.params.jobId,
      companyId: company?._id,
    });
    if (!job) return res.status(404).json({ message: "Job not found" });

    const apps = await Application.find({ jobId: job._id })
      .populate({
        path: "studentId",
        select:
          "usn batch branch cgpa backlogs currentPRS readinessLevel skills",
        populate: { path: "userId", select: "name email" },
      })
      .sort("-matchPercent");

    res.json({ job: { id: job._id, title: job.title }, applications: apps });
  } catch (err) {
    next(err);
  }
};

export const updateApplicationStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    if (!Object.values(APPLICATION_STATUS).includes(status)) {
      return res
        .status(400)
        .json({
          message: `status must be one of: ${Object.values(APPLICATION_STATUS).join(", ")}`,
        });
    }

    const company = await Company.findOne({ recruiterUserId: req.user._id });
    const app = await Application.findById(req.params.id).populate("jobId");
    if (!app || String(app.jobId.companyId) !== String(company?._id)) {
      return res.status(404).json({ message: "Application not found" });
    }

    app.status = status;
    app.statusHistory.push({ status, note, changedAt: new Date() });
    await app.save();

   const companyDoc = await Company.findById(app.jobId.companyId).select("name");
   await notifyApplicationStatus(app, app.jobId, companyDoc?.name || "The company");

    res.json({ application: app });
  } catch (err) {
    next(err);
  }
};

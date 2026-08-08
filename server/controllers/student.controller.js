import Student from "../models/Student.js";
import CareerPath from "../models/CareerPath.js";
import {
  resolveSkills,
  searchSkills as searchSkillsService,
} from "../services/skillNormalizer.js";
import {
  computePRS,
  computeAndSavePRS,
  computePRSAllSchemes,
} from "../services/prsService.js";
import { predictCareer } from "../services/mlClient.js";
import AptitudeAttempt from "../models/AptitudeAttempt.js";
import Job from "../models/Job.js";
import Application from "../models/Application.js";
import { computeMatch } from "../services/matchingService.js";

/** GET /api/student/profile */
export const getProfile = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id }).populate(
      "careerInterest",
      "name code description",
    );

    if (!student) {
      return res.status(404).json({
        message: "Profile not created yet",
        hasProfile: false,
      });
    }

    res.json({ student, hasProfile: true });
  } catch (err) {
    next(err);
  }
};

/** POST /api/student/profile — create the profile (once per user) */
export const createProfile = async (req, res, next) => {
  try {
    const existing = await Student.findOne({ userId: req.user._id });
    if (existing) {
      return res
        .status(409)
        .json({ message: "Profile already exists — use PUT to update" });
    }

    const { usn, batch, branch, cgpa, backlogs, phone } = req.body;

    if (!usn || !batch || !branch || cgpa === undefined) {
      return res
        .status(400)
        .json({ message: "usn, batch, branch and cgpa are required" });
    }
    if (cgpa < 0 || cgpa > 10) {
      return res.status(400).json({ message: "cgpa must be between 0 and 10" });
    }

    const usnTaken = await Student.findOne({ usn: usn.toUpperCase() });
    if (usnTaken) {
      return res
        .status(409)
        .json({ message: "This USN is already registered" });
    }

    const student = await Student.create({
      userId: req.user._id,
      usn,
      batch,
      branch,
      cgpa,
      backlogs: backlogs ?? 0,
      phone,
    });

    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.status(201).json({ student });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/student/profile — update academic details */
export const updateProfile = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const allowed = [
      "batch",
      "branch",
      "cgpa",
      "backlogs",
      "phone",
      "githubUsername",
      "linkedinUrl",
    ];
    for (const f of allowed) {
      if (req.body[f] !== undefined) student[f] = req.body[f];
    }

    if (req.body.careerInterest) {
      const path = await CareerPath.findById(req.body.careerInterest);
      if (!path)
        return res.status(400).json({ message: "Invalid career path" });
      student.careerInterest = path._id;
    }

    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.json({ student });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// SKILLS
// ─────────────────────────────────────────────────────────────

/** PUT /api/student/skills — replace the whole skill list */
export const updateSkills = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const { skills } = req.body;
    if (!Array.isArray(skills)) {
      return res.status(400).json({ message: "skills must be an array" });
    }

    // Normalization happens HERE — never store raw user input
    const { resolved, unresolved } = await resolveSkills(skills);

    student.skills = resolved;
    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.json({
      skills: student.skills,
      unresolved, // UI shows "we didn't recognise these"
      message: unresolved.length
        ? `${resolved.length} skills saved, ${unresolved.length} not recognised`
        : `${resolved.length} skills saved`,
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/student/skills/search?q=reac */
export const searchSkills = async (req, res, next) => {
  try {
    const results = await searchSkillsService(req.query.q || "", 10);
    res.json({ results });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────

/** POST /api/student/projects */
export const addProject = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const { title, description, techStack, githubUrl, liveUrl } = req.body;
    if (!title) return res.status(400).json({ message: "title is required" });

    student.projects.push({
      title,
      description,
      techStack: Array.isArray(techStack) ? techStack : [],
      githubUrl,
      liveUrl,
    });

    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.status(201).json({ projects: student.projects });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/student/projects/:id */
export const deleteProject = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const before = student.projects.length;
    student.projects.pull({ _id: req.params.id });
    if (student.projects.length === before) {
      return res.status(404).json({ message: "Project not found" });
    }

    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.json({ projects: student.projects });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// CERTIFICATIONS
// ─────────────────────────────────────────────────────────────

/** POST /api/student/certifications */
export const addCertification = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const { name, issuer, issueDate, expiryDate, credentialUrl } = req.body;
    if (!name || !issuer) {
      return res.status(400).json({ message: "name and issuer are required" });
    }

    student.certifications.push({
      name,
      issuer,
      issueDate,
      expiryDate,
      credentialUrl,
    });
    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.status(201).json({ certifications: student.certifications });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/student/certifications/:id */
export const deleteCertification = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const before = student.certifications.length;
    student.certifications.pull({ _id: req.params.id });
    if (student.certifications.length === before) {
      return res.status(404).json({ message: "Certification not found" });
    }

    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.json({ certifications: student.certifications });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────

/** GET /api/student/career-paths — for the interest dropdown */
export const getCareerPaths = async (req, res, next) => {
  try {
    const paths = await CareerPath.find({ isActive: true })
      .select("name code description typicalCgpaRange")
      .sort("name");
    res.json({ careerPaths: paths });
  } catch (err) {
    next(err);
  }
};

export const getPRS = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const result = await computeAndSavePRS(student);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getPRSHistory = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id }).select(
      "prsHistory currentPRS readinessLevel lastPrsComputedAt",
    );
    if (!student) return res.status(404).json({ message: "Profile not found" });

    res.json({
      currentPRS: student.currentPRS,
      readinessLevel: student.readinessLevel,
      lastComputedAt: student.lastPrsComputedAt,
      history: student.prsHistory,
    });
  } catch (err) {
    next(err);
  }
};

export const getPRSSensitivity = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const result = await computePRSAllSchemes(student);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getSkillGapAnalysis = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const result = await computePRS(student);
    if (!result.computable) {
      return res.status(400).json({ message: result.message });
    }

    res.json({
      careerPath: result.careerPath,
      ...result.skillAnalysis,
    });
  } catch (err) {
    next(err);
  }
};

export const getCareerPrediction = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const attempt = await AptitudeAttempt.findOne({
      studentId: student._id,
      status: "submitted",
    }).sort("-submittedAt");

    const profile = {
      cgpa: student.cgpa,
      backlogs: student.backlogs,
      aptQuantitative: attempt?.sectionScores?.quantitative ?? 0,
      aptLogical: attempt?.sectionScores?.logical ?? 0,
      aptVerbal: attempt?.sectionScores?.verbal ?? 0,
      aptTechnical: attempt?.sectionScores?.technical ?? 0,
      numProjects: student.projects?.length ?? 0,
      numCertifications: student.certifications?.length ?? 0,
      skills: (student.skills || []).map((s) => ({
        name: s.name,
        proficiency: s.proficiency,
      })),
    };

    const result = await predictCareer(profile);

    if (result.available && result.predictions?.length) {
      const paths = await CareerPath.find({
        name: { $in: result.predictions.map((p) => p.careerPath) },
      }).select("name code");

      const pathMap = new Map(paths.map((p) => [p.name, p]));

      student.predictedCareers = result.predictions.map((p) => ({
        pathId: pathMap.get(p.careerPath)?._id,
        name: p.careerPath,
        confidence: p.confidence,
      }));
      student.lastPredictionAt = new Date();
      await student.save();
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getDashboard = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id }).populate(
      "careerInterest",
      "name code",
    );
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const prs = await computeAndSavePRS(student);

    res.json({
      profile: {
        name: req.user.name,
        usn: student.usn,
        batch: student.batch,
        branch: student.branch,
        cgpa: student.cgpa,
        backlogs: student.backlogs,
        completeness: student.profileCompleteness,
        careerInterest: student.careerInterest,
      },
      counts: {
        skills: student.skills?.length ?? 0,
        projects: student.projects?.length ?? 0,
        certifications: student.certifications?.length ?? 0,
      },
      prs,
      predictedCareers: student.predictedCareers,
      prsHistory: student.prsHistory.slice(-10),
    });
  } catch (err) {
    next(err);
  }
};
export const browseJobs = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const jobs = await Job.find({
      isActive: true,
      $or: [{ deadline: null }, { deadline: { $gte: new Date() } }],
    }).populate("companyId", "name industry location logoUrl");

    const applications = await Application.find({
      studentId: student._id,
    }).select("jobId status");
    const appMap = new Map(
      applications.map((a) => [String(a.jobId), a.status]),
    );

    const scored = jobs
      .map((job) => {
        const m = computeMatch(student, job);
        return {
          _id: job._id,
          title: job.title,
          description: job.description,
          location: job.location,
          ctc: job.ctc,
          deadline: job.deadline,
          openings: job.openings,
          company: job.companyId,
          minCgpa: job.minCgpa,
          maxBacklogs: job.maxBacklogs,
          requiredSkills: job.requiredSkills,
          ...m,
          applicationStatus: appMap.get(String(job._id)) || null,
        };
      })
      .sort((a, b) => b.matchPercent - a.matchPercent);

    res.json({
      jobs: scored,
      eligibleCount: scored.filter((j) => j.eligible).length,
      totalCount: scored.length,
    });
  } catch (err) {
    next(err);
  }
};

export const applyToJob = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const job = await Job.findById(req.params.jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!job.isActive)
      return res
        .status(400)
        .json({ message: "This job is no longer accepting applications" });
    if (job.deadline && job.deadline < new Date()) {
      return res
        .status(400)
        .json({ message: "The application deadline has passed" });
    }

    const match = computeMatch(student, job);
    if (!match.eligible) {
      return res.status(403).json({
        message: `You are not eligible for this role — ${match.ineligibleReason}`,
      });
    }

    const existing = await Application.findOne({
      studentId: student._id,
      jobId: job._id,
    });
    if (existing)
      return res
        .status(409)
        .json({ message: "You have already applied to this job" });

    const application = await Application.create({
      studentId: student._id,
      jobId: job._id,
      matchPercent: match.matchPercent,
      prsAtApplication: student.currentPRS,
      statusHistory: [{ status: "applied", changedAt: new Date() }],
    });

    res.status(201).json({ application, matchPercent: match.matchPercent });
  } catch (err) {
    next(err);
  }
};

export const myApplications = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const applications = await Application.find({ studentId: student._id })
      .populate({
        path: "jobId",
        select: "title location ctc deadline isActive",
        populate: { path: "companyId", select: "name industry" },
      })
      .sort("-appliedAt");

    const byStatus = applications.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {});

    res.json({ applications, total: applications.length, byStatus });
  } catch (err) {
    next(err);
  }
};

import fs from "fs";
import path from "path";
import { UPLOAD_DIR } from "../middleware/upload.js";
import Resume from "../models/Resume.js";
import Student from "../models/Student.js";
import {
  buildTechnicalSkills,
  buildProjects,
  buildCertifications,
} from "../services/resumeService.js";

/** GET /api/student/resume — returns saved resume merged with live profile data */
export const getResume = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student)
      return res.status(404).json({ message: "Create your profile first" });

    let resume = await Resume.findOne({ studentId: student._id });

    if (!resume) {
      resume = await Resume.create({
        studentId: student._id,
        phone: student.phone,
        githubUrl: student.githubUsername
          ? `https://github.com/${student.githubUsername}`
          : "",
        linkedinUrl: student.linkedinUrl,
        education: {
          degree: {
            course: `Bachelors of Engineering – ${student.branch}`,
            institution: "Mangalore Institute of Technology & Engineering.",
            yearRange: `${Number(student.batch) - 4}-Present`,
            cgpa: student.cgpa,
          },
        },
        technicalSkills: await buildTechnicalSkills(student.skills),
        projects: buildProjects(student.projects),
        certifications: buildCertifications(student.certifications),
      });
    }

    // Refresh auto-generated sections unless the student has edited them
    const patch = {};

    if (!resume.skillsManuallyEdited) {
      patch.technicalSkills = await buildTechnicalSkills(student.skills);
    }
    if (!resume.projectsManuallyEdited) {
      patch.projects = buildProjects(student.projects);
    }
    if (resume.education?.degree) {
      patch["education.degree.cgpa"] = student.cgpa;
    }

    if (Object.keys(patch).length) {
      resume = await Resume.findByIdAndUpdate(
        resume._id,
        { $set: patch },
        { new: true },
      );
    }

    res.json({
      resume,
      profile: {
        name: req.user.name,
        email: req.user.email,
        usn: student.usn,
        branch: student.branch,
        batch: student.batch,
        cgpa: student.cgpa,
      },
      autoFilled: {
        skills: !resume.skillsManuallyEdited,
        projects: !resume.projectsManuallyEdited,
      },
    });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/student/resume — save any subset of fields */
export const updateResume = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const resume = await Resume.findOne({ studentId: student._id });
    if (!resume)
      return res.status(404).json({ message: "Resume not initialised" });

    const fields = [
      "phone",
      "address",
      "linkedinUrl",
      "githubUrl",
      "portfolioUrl",
      "summary",
      "education",
      "internships",
      "certifications",
      "achievements",
      "positions",
      "languagesKnown",
      "sectionOrder",
      "hiddenSections",
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) resume[f] = req.body[f];
    }

    // Editing these marks them as manual so auto-refresh stops
    if (req.body.technicalSkills !== undefined) {
      resume.technicalSkills = req.body.technicalSkills;
      resume.skillsManuallyEdited = true;
    }
    if (req.body.projects !== undefined) {
      resume.projects = req.body.projects;
      resume.projectsManuallyEdited = true;
    }

    await resume.save();
    res.json({ resume });
  } catch (err) {
    next(err);
  }
};

/** POST /api/student/resume/reset/:section — revert a section to profile data */
export const resetSection = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const resume = await Resume.findOne({ studentId: student._id });
    if (!resume)
      return res.status(404).json({ message: "Resume not initialised" });

    const { section } = req.params;

    if (section === "skills") {
      resume.technicalSkills = await buildTechnicalSkills(student.skills);
      resume.skillsManuallyEdited = false;
    } else if (section === "projects") {
      resume.projects = buildProjects(student.projects);
      resume.projectsManuallyEdited = false;
    } else if (section === "certifications") {
      resume.certifications = buildCertifications(student.certifications);
    } else {
      return res
        .status(400)
        .json({
          message: "section must be skills, projects or certifications",
        });
    }

    await resume.save();
    res.json({ resume });
  } catch (err) {
    next(err);
  }
};
export const uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file received" });
    }

    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const resume = await Resume.findOne({ studentId: student._id });
    if (!resume) return res.status(404).json({ message: "Resume not initialised" });

    // Remove an older file with a different extension
    if (resume.photoFilename && resume.photoFilename !== req.file.filename) {
      const oldPath = path.join(UPLOAD_DIR, resume.photoFilename);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
      }
    }

    resume.photoFilename = req.file.filename;
    resume.photoUrl = `/uploads/resume-photos/${req.file.filename}?v=${Date.now()}`;
    await resume.save();

    res.json({ photoUrl: resume.photoUrl, message: "Photo uploaded" });
  } catch (err) { next(err); }
};

export const deletePhoto = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const resume = await Resume.findOne({ studentId: student._id });
    if (!resume) return res.status(404).json({ message: "Resume not initialised" });

    if (resume.photoFilename) {
      const filePath = path.join(UPLOAD_DIR, resume.photoFilename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }

    resume.photoUrl = undefined;
    resume.photoFilename = undefined;
    await resume.save();

    res.json({ message: "Photo removed" });
  } catch (err) { next(err); }
};
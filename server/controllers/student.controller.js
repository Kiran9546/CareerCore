import Student from "../models/Student.js";
import CareerPath from "../models/CareerPath.js";
import { resolveSkills, searchSkills as searchSkillsService } from "../services/skillNormalizer.js";

/** GET /api/student/profile */
export const getProfile = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id })
      .populate("careerInterest", "name code description");

    if (!student) {
      return res.status(404).json({
        message: "Profile not created yet",
        hasProfile: false,
      });
    }

    res.json({ student, hasProfile: true });
  } catch (err) { next(err); }
};

/** POST /api/student/profile — create the profile (once per user) */
export const createProfile = async (req, res, next) => {
  try {
    const existing = await Student.findOne({ userId: req.user._id });
    if (existing) {
      return res.status(409).json({ message: "Profile already exists — use PUT to update" });
    }

    const { usn, batch, branch, cgpa, backlogs, phone } = req.body;

    if (!usn || !batch || !branch || cgpa === undefined) {
      return res.status(400).json({ message: "usn, batch, branch and cgpa are required" });
    }
    if (cgpa < 0 || cgpa > 10) {
      return res.status(400).json({ message: "cgpa must be between 0 and 10" });
    }

    const usnTaken = await Student.findOne({ usn: usn.toUpperCase() });
    if (usnTaken) {
      return res.status(409).json({ message: "This USN is already registered" });
    }

    const student = await Student.create({
      userId: req.user._id,
      usn, batch, branch, cgpa,
      backlogs: backlogs ?? 0,
      phone,
    });

    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.status(201).json({ student });
  } catch (err) { next(err); }
};

/** PUT /api/student/profile — update academic details */
export const updateProfile = async (req, res, next) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(404).json({ message: "Profile not found" });

    const allowed = ["batch", "branch", "cgpa", "backlogs", "phone", "githubUsername", "linkedinUrl"];
    for (const f of allowed) {
      if (req.body[f] !== undefined) student[f] = req.body[f];
    }

    if (req.body.careerInterest) {
      const path = await CareerPath.findById(req.body.careerInterest);
      if (!path) return res.status(400).json({ message: "Invalid career path" });
      student.careerInterest = path._id;
    }

    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.json({ student });
  } catch (err) { next(err); }
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
      unresolved,                            // UI shows "we didn't recognise these"
      message: unresolved.length
        ? `${resolved.length} skills saved, ${unresolved.length} not recognised`
        : `${resolved.length} skills saved`,
    });
  } catch (err) { next(err); }
};

/** GET /api/student/skills/search?q=reac */
export const searchSkills = async (req, res, next) => {
  try {
    const results = await searchSkillsService(req.query.q || "", 10);
    res.json({ results });
  } catch (err) { next(err); }
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
      title, description,
      techStack: Array.isArray(techStack) ? techStack : [],
      githubUrl, liveUrl,
    });

    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.status(201).json({ projects: student.projects });
  } catch (err) { next(err); }
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
  } catch (err) { next(err); }
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

    student.certifications.push({ name, issuer, issueDate, expiryDate, credentialUrl });
    student.profileCompleteness = student.computeCompleteness();
    await student.save();

    res.status(201).json({ certifications: student.certifications });
  } catch (err) { next(err); }
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
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────

/** GET /api/student/career-paths — for the interest dropdown */
export const getCareerPaths = async (req, res, next) => {
  try {
    const paths = await CareerPath.find({ isActive: true })
      .select("name code description typicalCgpaRange")
      .sort("name");
    res.json({ careerPaths: paths });
  } catch (err) { next(err); }
};
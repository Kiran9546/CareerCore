import User from "../models/User.js";
import Student from "../models/Student.js";
import Company from "../models/Company.js";
import Job from "../models/Job.js";
import Application from "../models/Application.js";
import Skill from "../models/Skill.js";
import CareerPath from "../models/CareerPath.js";
import AptitudeQuestion from "../models/AptitudeQuestion.js";
import { invalidateAliasMap } from "../services/skillNormalizer.js";
import { ROLES, APTITUDE_SECTIONS } from "../config/constants.js";

const normalize = (s) => String(s).toLowerCase().trim().replace(/\s+/g, " ");

export const getPlatformStats = async (req, res, next) => {
  try {
    const [users, students, companies, jobs, applications, skills, paths, questions] =
      await Promise.all([
        User.countDocuments(),
        Student.countDocuments(),
        Company.countDocuments(),
        Job.countDocuments(),
        Application.countDocuments(),
        Skill.countDocuments(),
        CareerPath.countDocuments(),
        AptitudeQuestion.countDocuments(),
      ]);

    const byRole = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);

    const byStatus = await Application.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const pendingRecruiters = await User.countDocuments({
      role: ROLES.RECRUITER,
      isVerified: false,
    });

    res.json({
      counts: { users, students, companies, jobs, applications, skills, careerPaths: paths, questions },
      usersByRole: byRole.map((r) => ({ role: r._id, count: r.count })),
      applicationsByStatus: byStatus.map((r) => ({ status: r._id, count: r.count })),
      pendingRecruiters,
    });
  } catch (err) { next(err); }
};

export const listUsers = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.active === "false") filter.isActive = false;
    if (req.query.unverified === "true") filter.isVerified = false;

    const users = await User.find(filter).sort("-createdAt").limit(500);
    res.json({ users, total: users.length });
  } catch (err) { next(err); }
};

export const toggleUserActive = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: "You cannot deactivate your own account" });
    }

    user.isActive = !user.isActive;
    await user.save();
    res.json({ user });
  } catch (err) { next(err); }
};

export const verifyRecruiter = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== ROLES.RECRUITER) {
      return res.status(400).json({ message: "Only recruiter accounts require verification" });
    }

    user.isVerified = !user.isVerified;
    await user.save();

    await Company.findOneAndUpdate(
      { recruiterUserId: user._id },
      { isVerified: user.isVerified }
    );

    res.json({ user });
  } catch (err) { next(err); }
};

export const listSkills = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;

    const skills = await Skill.find(filter).sort("name");
    const categories = await Skill.distinct("category");

    res.json({ skills, categories: categories.sort(), total: skills.length });
  } catch (err) { next(err); }
};

export const createSkill = async (req, res, next) => {
  try {
    const { name, category, aliases = [] } = req.body;
    if (!name || !category) {
      return res.status(400).json({ message: "name and category are required" });
    }

    const normalizedName = normalize(name);
    const normalizedAliases = aliases.map(normalize);

    const clash = await Skill.findOne({
      $or: [
        { normalizedName },
        { normalizedName: { $in: normalizedAliases } },
        { aliases: normalizedName },
        { aliases: { $in: normalizedAliases } },
      ],
    });

    if (clash) {
      return res.status(409).json({
        message: `Conflicts with existing skill "${clash.name}" — aliases must be unique across the taxonomy`,
      });
    }

    const skill = await Skill.create({ name, normalizedName, aliases: normalizedAliases, category });
    invalidateAliasMap();

    res.status(201).json({ skill });
  } catch (err) { next(err); }
};

export const updateSkill = async (req, res, next) => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill) return res.status(404).json({ message: "Skill not found" });

    if (req.body.aliases) {
      const normalizedAliases = req.body.aliases.map(normalize);
      const clash = await Skill.findOne({
        _id: { $ne: skill._id },
        $or: [
          { normalizedName: { $in: normalizedAliases } },
          { aliases: { $in: normalizedAliases } },
        ],
      });
      if (clash) {
        return res.status(409).json({ message: `Alias conflicts with "${clash.name}"` });
      }
      skill.aliases = normalizedAliases;
    }

    if (req.body.category) skill.category = req.body.category;

    await skill.save();
    invalidateAliasMap();

    res.json({ skill });
  } catch (err) { next(err); }
};

export const deleteSkill = async (req, res, next) => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill) return res.status(404).json({ message: "Skill not found" });

    const inUse = await Student.countDocuments({ "skills.skillId": skill._id });
    const inPath = await CareerPath.countDocuments({ "requiredSkills.skillId": skill._id });

    if (inUse || inPath) {
      return res.status(409).json({
        message: `Cannot delete — used by ${inUse} student(s) and ${inPath} career path(s)`,
      });
    }

    await skill.deleteOne();
    invalidateAliasMap();

    res.json({ message: "Skill deleted" });
  } catch (err) { next(err); }
};

export const listCareerPaths = async (req, res, next) => {
  try {
    const paths = await CareerPath.find({}).sort("name");
    res.json({ careerPaths: paths });
  } catch (err) { next(err); }
};

export const updateCareerPathWeights = async (req, res, next) => {
  try {
    const path = await CareerPath.findById(req.params.id);
    if (!path) return res.status(404).json({ message: "Career path not found" });

    const { requiredSkills } = req.body;
    if (!Array.isArray(requiredSkills)) {
      return res.status(400).json({ message: "requiredSkills array is required" });
    }

    for (const rs of requiredSkills) {
      const existing = path.requiredSkills.find((s) => s.name === rs.name);
      if (existing) existing.weight = Math.max(0, Math.min(1, Number(rs.weight)));
    }

    await path.save();

    res.json({
      careerPath: path,
      warning: "Weight changes invalidate the trained model — regenerate the dataset and retrain before relying on career predictions.",
    });
  } catch (err) { next(err); }
};

export const listQuestions = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.section) filter.section = req.query.section;

    const questions = await AptitudeQuestion.find(filter)
      .select("+correctOption +explanation")
      .sort("section");

    const bySection = await AptitudeQuestion.aggregate([
      { $group: { _id: "$section", count: { $sum: 1 } } },
    ]);

    res.json({
      questions,
      bySection: bySection.map((s) => ({ section: s._id, count: s.count })),
      total: questions.length,
    });
  } catch (err) { next(err); }
};

export const createQuestion = async (req, res, next) => {
  try {
    const { section, questionText, options, correctOption, explanation, difficulty } = req.body;

    if (!section || !questionText || !options?.length || !correctOption) {
      return res.status(400).json({ message: "section, questionText, options and correctOption are required" });
    }
    if (!APTITUDE_SECTIONS.includes(section)) {
      return res.status(400).json({ message: `section must be one of: ${APTITUDE_SECTIONS.join(", ")}` });
    }
    if (!options.some((o) => o.label === correctOption)) {
      return res.status(400).json({ message: "correctOption must match one of the option labels" });
    }

    const question = await AptitudeQuestion.create({
      section, questionText, options, correctOption, explanation,
      difficulty: difficulty || "medium",
    });

    res.status(201).json({ question });
  } catch (err) { next(err); }
};

export const toggleQuestion = async (req, res, next) => {
  try {
    const q = await AptitudeQuestion.findById(req.params.id);
    if (!q) return res.status(404).json({ message: "Question not found" });

    q.isActive = !q.isActive;
    await q.save();
    res.json({ question: q });
  } catch (err) { next(err); }
};

export const deleteQuestion = async (req, res, next) => {
  try {
    const q = await AptitudeQuestion.findById(req.params.id);
    if (!q) return res.status(404).json({ message: "Question not found" });

    await q.deleteOne();
    res.json({ message: "Question deleted" });
  } catch (err) { next(err); }
};
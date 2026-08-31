import Student from "../models/Student.js";
import Application from "../models/Application.js";
import CareerPath from "../models/CareerPath.js";
import { getSkillGap } from "../services/mlClient.js";
import { READINESS_LEVELS, ROLES } from "../config/constants.js";

/**
 * The branch filter a faculty request is locked to.
 *
 * Faculty only ever see their own department. This is taken from
 * req.user.department and then OVERWRITES anything the caller sent, rather
 * than merely defaulting when `branch` is absent — a default would be
 * bypassed by passing ?branch=CSE. Admins keep the unscoped view they had.
 *
 * Returns null for a faculty account with no department, which every caller
 * turns into an empty result. Showing nothing is the safe failure here;
 * showing everything is not.
 */
const scopeToDepartment = (req, match) => {
  if (req.user.role !== ROLES.FACULTY) return match;
  if (!req.user.department) return null;
  return { ...match, branch: req.user.department };
};

const NO_DEPARTMENT = {
  message:
    "Your faculty account has no department set, so no students are in " +
    "scope. Ask an administrator to set it.",
};

export const getBatchOverview = async (req, res, next) => {
  try {
    const match = {};
    if (req.query.batch) match.batch = req.query.batch;
    if (req.query.branch) match.branch = req.query.branch;

    const scoped = scopeToDepartment(req, match);
    if (!scoped) return res.status(403).json(NO_DEPARTMENT);

    const stats = await Student.aggregate([
      { $match: scoped },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: 1 },
          avgPRS: { $avg: "$currentPRS" },
          avgCGPA: { $avg: "$cgpa" },
          avgSkills: { $avg: { $size: "$skills" } },
          avgProjects: { $avg: { $size: "$projects" } },
          totalBacklogs: { $sum: "$backlogs" },
          notReady: { $sum: { $cond: [{ $lte: ["$currentPRS", 40] }, 1, 0] } },
          developing: { $sum: { $cond: [{ $and: [{ $gt: ["$currentPRS", 40] }, { $lte: ["$currentPRS", 60] }] }, 1, 0] } },
          ready: { $sum: { $cond: [{ $and: [{ $gt: ["$currentPRS", 60] }, { $lte: ["$currentPRS", 75] }] }, 1, 0] } },
          highlyReady: { $sum: { $cond: [{ $gt: ["$currentPRS", 75] }, 1, 0] } },
        },
      },
    ]);

    const s = stats[0] || {
      totalStudents: 0, avgPRS: 0, avgCGPA: 0, avgSkills: 0,
      avgProjects: 0, totalBacklogs: 0,
      notReady: 0, developing: 0, ready: 0, highlyReady: 0,
    };

    const round = (n) => Math.round((n || 0) * 100) / 100;

    res.json({
      summary: {
        totalStudents: s.totalStudents,
        avgPRS: round(s.avgPRS),
        avgCGPA: round(s.avgCGPA),
        avgSkills: round(s.avgSkills),
        avgProjects: round(s.avgProjects),
        totalBacklogs: s.totalBacklogs,
        placementReadyCount: s.ready + s.highlyReady,
        placementReadyPercent: s.totalStudents
          ? round(((s.ready + s.highlyReady) / s.totalStudents) * 100)
          : 0,
      },
      distribution: [
        { level: "Not Ready", count: s.notReady, color: READINESS_LEVELS[0].color },
        { level: "Developing", count: s.developing, color: READINESS_LEVELS[1].color },
        { level: "Placement Ready", count: s.ready, color: READINESS_LEVELS[2].color },
        { level: "Highly Ready", count: s.highlyReady, color: READINESS_LEVELS[3].color },
      ],
    });
  } catch (err) { next(err); }
};

export const getBranchComparison = async (req, res, next) => {
  try {
    const match = {};
    if (req.query.batch) match.batch = req.query.batch;

    const scoped = scopeToDepartment(req, match);
    if (!scoped) return res.status(403).json(NO_DEPARTMENT);

    const rows = await Student.aggregate([
      { $match: scoped },
      {
        $group: {
          _id: "$branch",
          students: { $sum: 1 },
          avgPRS: { $avg: "$currentPRS" },
          avgCGPA: { $avg: "$cgpa" },
          placementReady: { $sum: { $cond: [{ $gt: ["$currentPRS", 60] }, 1, 0] } },
        },
      },
      { $sort: { avgPRS: -1 } },
    ]);

    res.json({
      branches: rows.map((r) => ({
        branch: r._id,
        students: r.students,
        avgPRS: Math.round(r.avgPRS * 100) / 100,
        avgCGPA: Math.round(r.avgCGPA * 100) / 100,
        placementReady: r.placementReady,
        readyPercent: Math.round((r.placementReady / r.students) * 10000) / 100,
      })),
    });
  } catch (err) { next(err); }
};

export const getComponentAverages = async (req, res, next) => {
  try {
    const match = { currentPRS: { $gt: 0 } };
    if (req.query.batch) match.batch = req.query.batch;
    if (req.query.branch) match.branch = req.query.branch;

    const scoped = scopeToDepartment(req, match);
    if (!scoped) return res.status(403).json(NO_DEPARTMENT);

    const rows = await Student.aggregate([
      { $match: scoped },
      {
        $group: {
          _id: null,
          academic: { $avg: "$prsBreakdown.academic" },
          skills: { $avg: "$prsBreakdown.skills" },
          certifications: { $avg: "$prsBreakdown.certifications" },
          projects: { $avg: "$prsBreakdown.projects" },
          aptitude: { $avg: "$prsBreakdown.aptitude" },
        },
      },
    ]);

    const r = rows[0] || {};
    const round = (n) => Math.round((n || 0) * 100) / 100;

    res.json({
      components: [
        { component: "Academic", value: round(r.academic) },
        { component: "Skills", value: round(r.skills) },
        { component: "Certifications", value: round(r.certifications) },
        { component: "Projects", value: round(r.projects) },
        { component: "Aptitude", value: round(r.aptitude) },
      ],
    });
  } catch (err) { next(err); }
};

export const getTopSkillGaps = async (req, res, next) => {
  try {
    const match = { careerInterest: { $ne: null } };
    if (req.query.batch) match.batch = req.query.batch;
    if (req.query.branch) match.branch = req.query.branch;

    const scoped = scopeToDepartment(req, match);
    if (!scoped) return res.status(403).json(NO_DEPARTMENT);

    const students = await Student.find(scoped)
      .select("skills careerInterest")
      .limit(200);

    const paths = await CareerPath.find({}).select("name requiredSkills");
    const pathMap = new Map(paths.map((p) => [String(p._id), p]));

    const gapCount = new Map();

    for (const st of students) {
      const path = pathMap.get(String(st.careerInterest));
      if (!path) continue;

      const result = await getSkillGap(
        st.skills.map((s) => ({ name: s.name, proficiency: s.proficiency })),
        path.requiredSkills.map((s) => ({ name: s.name, weight: s.weight })),
        5
      );

      for (const g of result.gaps || []) {
        const cur = gapCount.get(g.skill) || { count: 0, totalPriority: 0 };
        cur.count += 1;
        cur.totalPriority += g.priority;
        gapCount.set(g.skill, cur);
      }
    }

    const gaps = [...gapCount.entries()]
      .map(([skill, v]) => ({
        skill,
        studentsAffected: v.count,
        percentAffected: students.length
          ? Math.round((v.count / students.length) * 10000) / 100
          : 0,
        avgPriority: Math.round((v.totalPriority / v.count) * 1000) / 1000,
      }))
      .sort((a, b) => b.studentsAffected - a.studentsAffected)
      .slice(0, 12);

    res.json({ gaps, studentsAnalysed: students.length });
  } catch (err) { next(err); }
};

export const listStudents = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.batch) filter.batch = req.query.batch;
    if (req.query.branch) filter.branch = req.query.branch;
    if (req.query.level) filter.readinessLevel = req.query.level;

    const scoped = scopeToDepartment(req, filter);
    if (!scoped) return res.status(403).json(NO_DEPARTMENT);

    const students = await Student.find(scoped)
      .populate("userId", "name email")
      .populate("careerInterest", "name code")
      .select("usn batch branch cgpa backlogs currentPRS readinessLevel skills projects certifications profileCompleteness")
      .sort("-currentPRS")
      .limit(300);

    res.json({
      students: students.map((s) => ({
        _id: s._id,
        name: s.userId?.name,
        email: s.userId?.email,
        usn: s.usn,
        batch: s.batch,
        branch: s.branch,
        cgpa: s.cgpa,
        backlogs: s.backlogs,
        prs: s.currentPRS,
        readinessLevel: s.readinessLevel,
        careerInterest: s.careerInterest?.name,
        skillCount: s.skills.length,
        projectCount: s.projects.length,
        certCount: s.certifications.length,
        completeness: s.profileCompleteness,
      })),
      total: students.length,
    });
  } catch (err) { next(err); }
};

export const getStudentDetail = async (req, res, next) => {
  try {
    const scoped = scopeToDepartment(req, { _id: req.params.id });
    if (!scoped) return res.status(403).json(NO_DEPARTMENT);

    // Scoped in the query rather than checked after loading, so a student in
    // another department is indistinguishable from one that does not exist.
    const student = await Student.findOne(scoped)
      .populate("userId", "name email")
      .populate("careerInterest", "name code");

    if (!student) return res.status(404).json({ message: "Student not found" });

    const applications = await Application.find({ studentId: student._id })
      .populate({ path: "jobId", select: "title", populate: { path: "companyId", select: "name" } })
      .select("status matchPercent appliedAt");

    res.json({ student, applications });
  } catch (err) { next(err); }
};

export const getFilters = async (req, res, next) => {
  try {
    const scoped = scopeToDepartment(req, {});
    if (!scoped) return res.status(403).json(NO_DEPARTMENT);

    const batches = await Student.distinct("batch", scoped);
    const branches = await Student.distinct("branch", scoped);
    res.json({
      batches: batches.sort(),
      branches: branches.sort(),
      department: req.user.department ?? null,
    });
  } catch (err) { next(err); }
};
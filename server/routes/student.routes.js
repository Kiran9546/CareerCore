import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ROLES } from "../config/constants.js";
import {
  getResume,
  updateResume,
  resetSection,
} from "../controllers/resume.controller.js";

import {
  getProfile,
  createProfile,
  updateProfile,
  updateSkills,
  searchSkills,
  addProject,
  deleteProject,
  addCertification,
  deleteCertification,
  getCareerPaths,
  getPRS,
  getPRSHistory,
  getPRSSensitivity,
  getSkillGapAnalysis,
  getCareerPrediction,
  getDashboard,
  browseJobs,
  applyToJob,
  myApplications,
  getRecommendationsForStudent,
} from "../controllers/student.controller.js";

import {
  startTest,
  submitTest,
  getHistory,
  reviewAttempt,
} from "../controllers/aptitude.controller.js";

const router = express.Router();

router.use(protect, requireRole(ROLES.STUDENT));

// ─── Profile ─────────────────────────────────────────────────
router.get("/profile", getProfile);
router.post("/profile", createProfile);
router.put("/profile", updateProfile);

router.get("/resume", getResume);
router.put("/resume", updateResume);
router.post("/resume/reset/:section", resetSection);

// ─── Skills ──────────────────────────────────────────────────
router.put("/skills", updateSkills);
router.get("/skills/search", searchSkills);

// ─── Projects & certifications ───────────────────────────────
router.post("/projects", addProject);
router.delete("/projects/:id", deleteProject);
router.post("/certifications", addCertification);
router.delete("/certifications/:id", deleteCertification);

router.get("/career-paths", getCareerPaths);

// ─── Aptitude ────────────────────────────────────────────────
router.post("/aptitude/start", startTest);
router.post("/aptitude/submit", submitTest);
router.get("/aptitude/history", getHistory);
router.get("/aptitude/review/:attemptId", reviewAttempt);

// ─── PRS & analysis ──────────────────────────────────────────
router.get("/dashboard", getDashboard);
router.get("/prs", getPRS);
router.get("/prs/history", getPRSHistory);
router.get("/prs/sensitivity", getPRSSensitivity);
router.get("/skill-gap", getSkillGapAnalysis);
router.get("/career-prediction", getCareerPrediction);
router.get("/recommendations", getRecommendationsForStudent);

// ─── Jobs & applications ─────────────────────────────────────
router.get("/jobs", browseJobs);
router.post("/jobs/:jobId/apply", applyToJob);
router.get("/applications", myApplications);

export default router;

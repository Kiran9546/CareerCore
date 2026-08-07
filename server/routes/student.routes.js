import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ROLES } from "../config/constants.js";
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
} from "../controllers/student.controller.js";

import {
  startTest,
  submitTest,
  getHistory,
  reviewAttempt,
} from "../controllers/aptitude.controller.js";

import {
  getPRS,
  getPRSHistory,
  getPRSSensitivity,
  getSkillGapAnalysis,
  getCareerPrediction,
  getDashboard,
} from "../controllers/student.controller.js";

const router = express.Router();

// Every route below requires a logged-in student
router.use(protect, requireRole(ROLES.STUDENT));

router.get("/profile", getProfile);
router.post("/profile", createProfile);
router.put("/profile", updateProfile);

router.put("/skills", updateSkills);
router.get("/skills/search", searchSkills);

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
router.get("/dashboard", getDashboard);
router.get("/prs", getPRS);
router.get("/prs/history", getPRSHistory);
router.get("/prs/sensitivity", getPRSSensitivity);
router.get("/skill-gap", getSkillGapAnalysis);
router.get("/career-prediction", getCareerPrediction);

export default router;

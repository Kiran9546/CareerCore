import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ROLES } from "../config/constants.js";
import {
  getProfile, createProfile, updateProfile,
  updateSkills, searchSkills,
  addProject, deleteProject,
  addCertification, deleteCertification,
  getCareerPaths,
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

export default router;
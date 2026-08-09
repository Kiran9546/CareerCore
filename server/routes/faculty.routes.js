import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ROLES } from "../config/constants.js";
import {
  getBatchOverview, getBranchComparison, getComponentAverages,
  getTopSkillGaps, listStudents, getStudentDetail, getFilters,
} from "../controllers/faculty.controller.js";

const router = express.Router();

router.use(protect, requireRole(ROLES.FACULTY, ROLES.ADMIN));

router.get("/overview", getBatchOverview);
router.get("/branches", getBranchComparison);
router.get("/components", getComponentAverages);
router.get("/skill-gaps", getTopSkillGaps);
router.get("/students", listStudents);
router.get("/students/:id", getStudentDetail);
router.get("/filters", getFilters);

export default router;
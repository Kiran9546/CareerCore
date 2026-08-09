import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ROLES } from "../config/constants.js";
import {
  getPlatformStats,
  listUsers, toggleUserActive, verifyRecruiter,
  listSkills, createSkill, updateSkill, deleteSkill,
  listCareerPaths, updateCareerPathWeights,
  listQuestions, createQuestion, toggleQuestion, deleteQuestion,
} from "../controllers/admin.controller.js";

const router = express.Router();

router.use(protect, requireRole(ROLES.ADMIN));

router.get("/stats", getPlatformStats);

router.get("/users", listUsers);
router.patch("/users/:id/toggle", toggleUserActive);
router.patch("/users/:id/verify", verifyRecruiter);

router.get("/skills", listSkills);
router.post("/skills", createSkill);
router.put("/skills/:id", updateSkill);
router.delete("/skills/:id", deleteSkill);

router.get("/career-paths", listCareerPaths);
router.put("/career-paths/:id/weights", updateCareerPathWeights);

router.get("/questions", listQuestions);
router.post("/questions", createQuestion);
router.patch("/questions/:id/toggle", toggleQuestion);
router.delete("/questions/:id", deleteQuestion);

export default router;
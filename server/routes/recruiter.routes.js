import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ROLES } from "../config/constants.js";
import {
  getCompany,
  createCompany,
  updateCompany,
  listJobs,
  createJob,
  toggleJob,
  searchCandidates,
  listApplicants,
  updateApplicationStatus,
} from "../controllers/recruiter.controller.js";

const router = express.Router();

router.use(protect, requireRole(ROLES.RECRUITER));

router.get("/company", getCompany);
router.post("/company", createCompany);
router.put("/company", updateCompany);

router.get("/jobs", listJobs);
router.post("/jobs", createJob);
router.patch("/jobs/:id/toggle", toggleJob);

router.get("/jobs/:jobId/candidates", searchCandidates);
router.get("/jobs/:jobId/applicants", listApplicants);
router.patch("/applications/:id/status", updateApplicationStatus);

export default router;

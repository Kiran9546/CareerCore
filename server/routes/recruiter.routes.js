import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireVerified } from "../middleware/requireVerified.js";
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

// Everything past this point exposes student data or reaches students,
// so it stays closed until an admin approves the recruiter. Company profile
// setup above is deliberately left open so they can prepare while waiting.
router.get("/jobs", requireVerified, listJobs);
router.post("/jobs", requireVerified, createJob);
router.patch("/jobs/:id/toggle", requireVerified, toggleJob);

router.get("/jobs/:jobId/candidates", requireVerified, searchCandidates);
router.get("/jobs/:jobId/applicants", requireVerified, listApplicants);
router.patch("/applications/:id/status", requireVerified, updateApplicationStatus);

export default router;

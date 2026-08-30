import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  DRIVE_MANAGER_ROLES,
  RESULT_EDITOR_ROLES,
  PLACEMENT_VIEWER_ROLES,
} from "../config/constants.js";
import { handleJobDocUpload } from "../middleware/uploadJobDoc.js";
import {
  listJobs,
  getJob,
  createJob,
  updateJob,
  toggleJob,
  deleteJob,
  removeAttachment,
  listApplicants,
} from "../controllers/placementJob.controller.js";
import { exportPlacementData } from "../controllers/placement.controller.js";
import {
  listDrives,
  getDrive,
  createDrive,
  updateDrive,
  deleteDrive,
  listEligibleStudents,
  listParticipants,
  registerParticipants,
  removeParticipant,
  updateStageResult,
  getStudentPlacementProfile,
  compareStudents,
  getPlacementOverview,
  listStudentsWithOutcomes,
} from "../controllers/placement.controller.js";

/**
 * /api/placement — the placement cell's own section.
 *
 * Permissions are enforced here, per endpoint, rather than once on the
 * router, because the three staff roles genuinely differ:
 *
 *   viewer  (faculty, placement officer, admin)
 *       read drives, participants, placement profiles, comparisons
 *   editor  (faculty, placement officer, admin)
 *       record and correct official stage results
 *   manager (placement officer, admin)
 *       create, edit, cancel drives and register participants
 *
 * Faculty deliberately sit in viewer + editor but NOT manager: they hold
 * authorized placement information for their students and may correct it,
 * but the drive calendar itself belongs to the placement cell.
 *
 * The student role appears nowhere in this file. Students read their own
 * placement journey through GET /api/student/placement, which has no write
 * counterpart anywhere in the API — official results are staff-entered by
 * construction, not by convention.
 */

const router = express.Router();

router.use(protect);

const canView = requireRole(...PLACEMENT_VIEWER_ROLES);
const canEditResults = requireRole(...RESULT_EDITOR_ROLES);
const canManageDrives = requireRole(...DRIVE_MANAGER_ROLES);

// ─── Overview & student lists (read) ─────────────────────────
router.get("/overview", canView, getPlacementOverview);
router.get("/students", canView, listStudentsWithOutcomes);
router.get("/students/:studentId/profile", canView, getStudentPlacementProfile);
router.get("/compare", canView, compareStudents);

// ─── Drives ──────────────────────────────────────────────────
router.get("/drives", canView, listDrives);
router.get("/drives/:id", canView, getDrive);
router.post("/drives", canManageDrives, createDrive);
router.put("/drives/:id", canManageDrives, updateDrive);
router.delete("/drives/:id", canManageDrives, deleteDrive);

// ─── Participants ────────────────────────────────────────────
router.get("/drives/:id/participants", canView, listParticipants);
router.get("/drives/:id/eligible", canManageDrives, listEligibleStudents);
router.post("/drives/:id/participants", canManageDrives, registerParticipants);
router.delete("/participations/:id", canManageDrives, removeParticipant);

// ─── Official stage results ──────────────────────────────────
router.patch("/participations/:id/stage", canEditResults, updateStageResult);

// ─── Excel export ────────────────────────────────────────────
router.get("/export", canView, exportPlacementData);

// ─── Job postings ────────────────────────────────────────────
// The placement cell posts openings companies send to the college. These
// become ordinary Job documents, so students browse and apply to them
// through the existing student routes with no special-casing.
//
// The create and update handlers sit behind the multipart parser so the
// JD can be uploaded in the same request as the details.
router.get("/jobs", canView, listJobs);
router.get("/jobs/:id", canView, getJob);
router.get("/jobs/:id/applicants", canView, listApplicants);
router.post("/jobs", canManageDrives, handleJobDocUpload, createJob);
router.put("/jobs/:id", canManageDrives, handleJobDocUpload, updateJob);
router.patch("/jobs/:id/toggle", canManageDrives, toggleJob);
router.delete("/jobs/:id/attachments/:attachmentId", canManageDrives, removeAttachment);
router.delete("/jobs/:id", canManageDrives, deleteJob);

export default router;

import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  DRIVE_MANAGER_ROLES,
  RESULT_EDITOR_ROLES,
  PLACEMENT_VIEWER_ROLES,
  ROUND_REOPEN_ROLES,
  POLICY_EDITOR_ROLES,
} from "../config/constants.js";
import * as recruitment from "../controllers/recruitment.controller.js";
import * as delivery from "../controllers/notificationDelivery.controller.js";
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
  listStudentsWithOutcomes,
} from "../controllers/placement.controller.js";

/**
 * /api/placement — the placement cell's own section.
 *
 * Permissions are enforced here, per endpoint, using the role lists in
 * config/constants.js:
 *
 *   canView        PLACEMENT_VIEWER_ROLES  (placement officer, admin)
 *   canEditResults RESULT_EDITOR_ROLES     (placement officer, admin)
 *   canManageDrives DRIVE_MANAGER_ROLES    (placement officer, admin)
 *   canReopen      ROUND_REOPEN_ROLES      (admin only)
 *
 * The lists are kept separate so they can diverge without touching every
 * route. Faculty are deliberately absent: they work with their department
 * through /api/faculty and the result pipeline in /api/results.
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

// ─── Student lists (read) ────────────────────────────────────
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

// ─── Recruitment workflow (managed drives) ───────────────────
// Drives created with workflow: "managed" run the full process — company
// list, calculated eligibility, automatic notifications, student
// self-registration, configurable rounds with attendance, results and
// progression. POST/PUT/DELETE /drives above delegate to it for those drives.
const canReopen = requireRole(...ROUND_REOPEN_ROLES);
const canSetPolicy = requireRole(...POLICY_EDITOR_ROLES);

router.get("/companies", canView, recruitment.listCompanies);
router.post("/companies", canManageDrives, recruitment.createCompany);
router.get("/companies/:id", canView, recruitment.getCompany);

router.get("/round-types", canView, recruitment.listRoundTypes);
router.get("/interview-templates", canView, recruitment.listTemplates);
router.post("/interview-templates", canManageDrives, recruitment.createTemplate);
router.put("/interview-templates/:id", canManageDrives, recruitment.updateTemplate);
router.delete("/interview-templates/:id", canManageDrives, recruitment.deleteTemplate);

router.get("/policy", canView, recruitment.getPolicy);
router.put("/policy", canSetPolicy, recruitment.setPolicy);

router.get("/statistics", canView, recruitment.statistics);
router.get("/audit", canManageDrives, recruitment.auditHistory);
router.get("/students/:studentId/recruitment", canView, recruitment.studentHistory);

router.get("/drives/:id/dashboard", canView, recruitment.getManagedDrive);
router.patch("/drives/:id/status", canManageDrives, recruitment.changeStatus);
router.post("/drives/:id/clone", canManageDrives, recruitment.cloneDrive);
router.put("/drives/:id/eligibility", canManageDrives, recruitment.setEligibility);
router.post("/drives/:id/eligibility/calculate", canManageDrives, recruitment.recalculateEligibility);
router.get("/drives/:id/students", canView, recruitment.listStudents);
router.get("/drives/:id/audit", canManageDrives, recruitment.auditHistory);

// Notification delivery report (in-app, email, WhatsApp). Addresses are
// masked; retrying only re-queues rows that failed.
router.get("/drives/:id/notifications/summary", canView, delivery.deliverySummary);
router.get("/drives/:id/notifications/deliveries", canView, delivery.deliveryList);
router.post("/drives/:id/notifications/retry", canManageDrives, delivery.retryDeliveries);

router.put("/drives/:id/rounds", canManageDrives, recruitment.setRounds);
router.patch("/drives/:id/rounds/:roundId/schedule", canManageDrives, recruitment.setSchedule);
router.get("/drives/:id/rounds/:roundId/participants", canView, recruitment.roundParticipants);
router.post("/drives/:id/rounds/:roundId/attendance", canEditResults, recruitment.recordAttendance);
router.post("/drives/:id/rounds/:roundId/results", canEditResults, recruitment.recordResults);
router.post("/drives/:id/rounds/:roundId/finalize", canEditResults, recruitment.finalizeRound);
router.post("/drives/:id/rounds/:roundId/reopen", canReopen, recruitment.reopenRound);

router.patch("/participations/:id/offer", canEditResults, recruitment.updateOffer);
router.patch("/participations/:id/eligibility-override", canManageDrives, recruitment.overrideEligibility);

// ─── Excel export ────────────────────────────────────────────
router.get("/export", canView, exportPlacementData);

export default router;

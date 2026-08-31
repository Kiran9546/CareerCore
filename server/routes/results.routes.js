import express from "express";
import { protect } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { handleSpreadsheetUpload } from "../middleware/uploadSpreadsheet.js";
import { ROLES } from "../config/constants.js";
import {
  requestResults,
  requestResultsBulk,
  myResultRequests,
  submitMyResults,
  listSubmissions,
  createSubmission,
  forwardSubmission,
  rejectSubmission,
  applyDirect,
  importResults,
  downloadTemplate,
  listScopedStudents,
  listDrivesForResults,
} from "../controllers/results.controller.js";

/**
 * /api/results — how a round result reaches the official record.
 *
 * Three independent entry points, as the placement office actually works:
 *
 *   faculty asks a student, the student fills it in, faculty forwards it
 *   faculty enters or imports it directly, for their own department
 *   the placement officer enters or imports it directly, for anyone
 *
 * Faculty are scoped to their own department everywhere. That is enforced
 * in the controller from `req.user.department` rather than here, so it
 * cannot be sidestepped by a route added later that forgets the guard.
 */

const router = express.Router();

router.use(protect);

const staff = requireRole(ROLES.FACULTY, ROLES.PLACEMENT_OFFICER, ROLES.ADMIN);
const student = requireRole(ROLES.STUDENT);

// ─── Student: only ever their own, and only when asked ───────
router.get("/mine", student, myResultRequests);
router.put("/mine/:id", student, submitMyResults);

// ─── Staff: pickers and the spreadsheet template ─────────────
router.get("/students", staff, listScopedStudents);
router.get("/drives", staff, listDrivesForResults);
router.get("/template", staff, downloadTemplate);

// ─── Faculty: ask students for their results ─────────────────
router.post("/requests", staff, requestResults);
router.post("/requests/bulk", staff, requestResultsBulk);

// ─── Review queue ────────────────────────────────────────────
router.get("/submissions", staff, listSubmissions);
router.post("/submissions", staff, createSubmission);
router.post("/submissions/:id/forward", staff, forwardSubmission);
router.post("/submissions/:id/reject", staff, rejectSubmission);

// ─── Straight to the official record ─────────────────────────
router.post("/apply", staff, applyDirect);
router.post("/import", staff, handleSpreadsheetUpload, importResults);

export default router;

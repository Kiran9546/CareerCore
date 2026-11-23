/**
 * Shared presentation vocabulary for the placement journey.
 *
 * Kept in one place so the student view, the faculty profile, the
 * comparison view and the officer's result editor all describe the same
 * status with the same words and the same colour. The badge idiom itself
 * (`px-2 py-0.5 rounded text-xs` + a style map) matches the rest of the app.
 */

export const STAGES = ["aptitude", "technical", "interview", "final"];

export const STAGE_LABEL = {
  aptitude: "Aptitude",
  technical: "Technical",
  interview: "Interview",
  final: "Final",
};

/** Statuses selectable for a pass/fail round. */
export const STAGE_STATUSES = ["not_reached", "passed", "failed"];

/** Statuses selectable for the final decision. */
export const FINAL_STATUSES = ["not_reached", "selected", "rejected"];

export const STATUS_LABEL = {
  not_reached: "Not reached",
  passed: "Passed",
  failed: "Failed",
  selected: "Selected",
  rejected: "Rejected",
};

export const STATUS_STYLE = {
  not_reached: "bg-slate-100 text-slate-400",
  passed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  selected: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export const PLACEMENT_STATUS_LABEL = {
  placed: "Placed",
  in_process: "In process",
  unplaced: "Unplaced",
  no_history: "No history",
};

export const PLACEMENT_STATUS_STYLE = {
  placed: "bg-emerald-100 text-emerald-700",
  in_process: "bg-blue-100 text-blue-700",
  unplaced: "bg-amber-100 text-amber-700",
  no_history: "bg-slate-100 text-slate-500",
};

export const DRIVE_STATUS_STYLE = {
  planned: "bg-blue-100 text-blue-700",
  ongoing: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export const CONFIDENCE_LABEL = {
  reliable: "Supported by the recorded results",
  provisional: "Provisional: limited attempts so far",
  insufficient: "Not enough history",
};

/** Drive outcome codes from buildPlacementProfile(), in plain words. */
export const OUTCOME_LABEL = {
  offer: "Offer",
  rejected_final: "Rejected at final",
  failed_interview: "Failed interview",
  failed_technical: "Failed technical",
  failed_aptitude: "Failed aptitude",
  cleared_interview: "Cleared interview",
  cleared_technical: "Cleared technical",
  cleared_aptitude: "Cleared aptitude",
  not_started: "Not started",
};

export const OUTCOME_STYLE = (outcome) => {
  if (outcome === "offer") return "bg-emerald-100 text-emerald-700";
  if (outcome?.startsWith("failed") || outcome === "rejected_final")
    return "bg-red-100 text-red-700";
  if (outcome?.startsWith("cleared")) return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-500";
};

/**
 * Render a metric that can legitimately be "no data".
 * null means nothing was measured; 0 means it was measured and came out
 * zero. Collapsing the two would let an untested student read as a failing
 * one, which is the exact confusion this module exists to prevent.
 */
export const showMetric = (value, suffix = "") =>
  value === null || value === undefined ? "–" : `${value}${suffix}`;

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "–";

// ─── Recruitment workflow (managed drives) ──────────────────

export const DRIVE_STATUS_LABEL = {
  planned: "Planned",
  ongoing: "Ongoing",
  draft: "Draft",
  open: "Open for registration",
  registration_closed: "Registration closed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

Object.assign(DRIVE_STATUS_STYLE, {
  draft: "bg-slate-100 text-slate-600",
  open: "bg-blue-100 text-blue-700",
  registration_closed: "bg-violet-100 text-violet-700",
  in_progress: "bg-amber-100 text-amber-700",
});

/** Verb on the button that moves a drive to this status. */
export const STATUS_ACTION = {
  open: "Publish & open registration",
  registration_closed: "Close registration",
  in_progress: "Start drive",
  completed: "Complete drive",
  cancelled: "Cancel drive",
};

export const ATTENDANCE_LABEL = { unmarked: "Not marked", appeared: "Appeared", absent: "Absent" };
export const ATTENDANCE_STYLE = {
  unmarked: "bg-slate-100 text-slate-500",
  appeared: "bg-blue-100 text-blue-700",
  absent: "bg-amber-100 text-amber-700",
};

export const RESULT_LABEL = { pending: "Pending", passed: "Passed", failed: "Failed" };
/** In the final round a pass is a selection. */
export const FINAL_RESULT_LABEL = { pending: "Pending", passed: "Selected", failed: "Not selected" };
export const RESULT_STYLE = {
  pending: "bg-slate-100 text-slate-500",
  passed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export const ROUND_STATUS_LABEL = { pending: "Not scheduled", scheduled: "Scheduled", finalized: "Finalized" };
export const ROUND_STATUS_STYLE = {
  pending: "bg-slate-100 text-slate-500",
  scheduled: "bg-blue-100 text-blue-700",
  finalized: "bg-green-100 text-green-700",
};

export const DRIVE_OUTCOME_LABEL = {
  selected: "Selected",
  rejected: "Not selected",
  in_process: "In process",
  registered: "Registered",
  withdrawn: "Withdrawn",
  cancelled: "Drive cancelled",
  not_progressed: "Did not progress",
};
export const DRIVE_OUTCOME_STYLE = {
  selected: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  in_process: "bg-blue-100 text-blue-700",
  registered: "bg-violet-100 text-violet-700",
  withdrawn: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
  not_progressed: "bg-slate-100 text-slate-500",
};

export const STUDENT_STATE_LABEL = {
  selected: "Selected",
  in_process: "Currently in process",
  registered: "Registered",
  eligible: "Eligible",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  not_placed: "Not placed",
};
export const STUDENT_STATE_STYLE = {
  selected: "bg-emerald-100 text-emerald-700",
  in_process: "bg-blue-100 text-blue-700",
  registered: "bg-violet-100 text-violet-700",
  eligible: "bg-sky-100 text-sky-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-slate-100 text-slate-500",
  not_placed: "bg-slate-100 text-slate-500",
};

export const OFFER_STATUSES = ["pending", "accepted", "declined", "revoked"];

export const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "–";

/** "2026-10-27T17:00" for a datetime-local input, in local time. */
export const toLocalInput = (d) => {
  if (!d) return "";
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

export const toDateInput = (d) => (d ? toLocalInput(d).slice(0, 10) : "");

/** Graduation years offered as checkboxes: this year and the next three. */
export const graduationYears = () => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1, y + 2, y + 3].map(String);
};

export const errorMessage = (e, fallback) => e?.response?.data?.message || fallback;

/** Shared Tailwind class strings, matching the existing placement pages. */
export const ui = {
  input: "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900",
  label: "block text-xs font-medium text-slate-600 mb-1",
  select: "min-w-0 max-w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white",
  card: "bg-white rounded-xl border border-slate-200 p-5",
  primary: "px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50",
  secondary: "px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50",
  danger: "px-3 py-1.5 text-sm rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50",
  badge: "px-2 py-0.5 rounded text-xs",
  error: "feedback-in rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700",
  notice: "feedback-in rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700",
};

/** Round types, matching ROUND_TYPES on the server. */
export const ROUND_TYPE_LABEL = {
  aptitude: "Aptitude Test",
  coding: "Coding Test",
  group_discussion: "Group Discussion",
  technical: "Technical Interview",
  f2f: "Face-to-Face Interview",
  hr: "HR Interview",
};

/** Compact round names for tables. */
export const ROUND_SHORT_LABEL = {
  aptitude: "Aptitude",
  coding: "Coding",
  group_discussion: "GD",
  technical: "Technical",
  f2f: "F2F",
  hr: "HR",
};

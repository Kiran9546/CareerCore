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
  provisional: "Provisional — limited attempts so far",
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
  value === null || value === undefined ? "—" : `${value}${suffix}`;

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

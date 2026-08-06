/**
 * CareerCore — System Constants
 * Source of truth for all scoring formulas (Blueprint Section 5).
 */

// ─── PRS weights (Blueprint 5.2) — MUST sum to 1.00 ──────────
export const PRS_WEIGHTS = {
  academic: 0.25,
  skills: 0.30,
  certifications: 0.10,
  projects: 0.15,
  aptitude: 0.20,
};

// Fails loudly at startup if anyone mis-edits the weights
const weightSum = Object.values(PRS_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 1e-9) {
  throw new Error(`PRS_WEIGHTS must sum to 1.00, got ${weightSum}`);
}

// ─── Component caps (Blueprint 5.1) ──────────────────────────
export const BACKLOG_PENALTY = 5;
export const CERT_CAP = 4;
export const PROJECT_CAP = 3;
export const PROJECT_COUNT_WEIGHT = 60;
export const PROJECT_RELEVANCE_WEIGHT = 40;

// ─── Readiness bands (Blueprint 5.3) ─────────────────────────
export const READINESS_LEVELS = [
  { min: 0,  max: 40,  label: "Not Ready",       color: "#dc2626" },
  { min: 41, max: 60,  label: "Developing",      color: "#f59e0b" },
  { min: 61, max: 75,  label: "Placement Ready", color: "#10b981" },
  { min: 76, max: 100, label: "Highly Ready",    color: "#059669" },
];

export const getReadinessLevel = (prs) =>
  READINESS_LEVELS.find((l) => prs >= l.min && prs <= l.max)?.label ?? "Not Ready";

// ─── Candidate matching (Blueprint 5.6) ──────────────────────
export const MATCH_WEIGHTS = {
  skillOverlap: 0.50,
  prs: 0.30,
  cgpa: 0.20,
};

export const MANDATORY_SKILL_MULTIPLIER = 2;

// ─── Notification thresholds (Blueprint 5.8) ─────────────────
export const LOW_PRS_THRESHOLD = 50;
export const LOW_PRS_DAYS = 14;
export const JOB_ALERT_MATCH_THRESHOLD = 70;

// ─── Roles & enums ───────────────────────────────────────────
export const ROLES = {
  STUDENT: "student",
  RECRUITER: "recruiter",
  FACULTY: "faculty",
  ADMIN: "admin",
};

export const APPLICATION_STATUS = {
  APPLIED: "applied",
  SHORTLISTED: "shortlisted",
  INTERVIEW_SCHEDULED: "interview_scheduled",
  OFFERED: "offered",
  REJECTED: "rejected",
};

export const APTITUDE_SECTIONS = ["quantitative", "logical", "verbal", "technical"];

// ─── Limits ──────────────────────────────────────────────────
export const MAX_RESUME_SIZE_MB = 5;
export const PRS_HISTORY_CAP = 50;
export const MAX_SKILL_PROFICIENCY = 5;
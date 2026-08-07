/**
 * CareerCore — System Constants
 * ==============================
 *
 * Source of truth for all scoring parameters (Blueprint Section 5).
 *
 * ─── PROVENANCE ───────────────────────────────────────────────────────
 *
 * ESTABLISHED METHODS (cite these):
 *   - Weighted linear aggregation of normalised criteria is Multi-Attribute
 *     Utility Theory (Keeney & Raiffa, 1976). The FORM of the PRS equation
 *     follows this standard model.
 *   - Cosine similarity for vector matching: Salton et al. (1975), vector
 *     space model. Standard in recommender and skill-matching systems.
 *   - Random Forest classification: Breiman (2001). predict_proba() as a
 *     confidence measure is standard practice.
 *
 * PROJECT DESIGN DECISIONS (do NOT cite as published research):
 *   - The specific weight values below (0.25 / 0.30 / 0.10 / 0.15 / 0.20)
 *     were assigned by this project team. They are NOT drawn from any
 *     published study and have NOT been empirically validated against
 *     placement outcomes.
 *   - Component caps (CERT_CAP, PROJECT_CAP), the backlog penalty, the
 *     60/40 project split, readiness band boundaries, and the matching
 *     weights are likewise team decisions.
 *
 * RATIONALE for the chosen weights (defensible reasoning, not proof):
 *   - Skills highest (0.30): recruiter shortlisting is predominantly
 *     skill-driven. Supported directionally by Ansarey (2017) [Phase 1
 *     ref 2], which found ~75% of graduates lack employability skills.
 *   - Academic (0.25): CGPA remains the primary eligibility gate in
 *     campus drives; nearly all drives impose a CGPA floor.
 *   - Aptitude (0.20): first elimination round at most mass recruiters.
 *   - Projects (0.15): demonstrates applied ability but is harder to
 *     verify objectively.
 *   - Certifications (0.10): quality varies widely, volume easily inflated.
 *
 * VALIDATION STATUS: unvalidated. Empirical calibration would require
 * historical institutional placement records, which were unavailable
 * (Phase 1 Constraint 3.3). These values are exposed as configurable
 * constants so an administrator can adjust them without code changes,
 * and so a sensitivity analysis can be run over alternative schemes.
 * ──────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────
// PRS weights (Blueprint 5.2) — MUST sum to 1.00
// TEAM-ASSIGNED VALUES — see provenance note above
// ─────────────────────────────────────────────────────────────
export const PRS_WEIGHTS = {
  academic: 0.25,
  skills: 0.3,
  certifications: 0.1,
  projects: 0.15,
  aptitude: 0.2,
};

/**
 * Alternative weight schemes, retained for the sensitivity analysis
 * reported in Phase 2. Running PRS under all three and comparing
 * student rankings tests how much the specific weights actually matter.
 */
export const ALTERNATIVE_WEIGHT_SCHEMES = {
  balanced: {
    academic: 0.2,
    skills: 0.2,
    certifications: 0.2,
    projects: 0.2,
    aptitude: 0.2,
  },
  skillsHeavy: {
    academic: 0.15,
    skills: 0.5,
    certifications: 0.05,
    projects: 0.2,
    aptitude: 0.1,
  },
  academicHeavy: {
    academic: 0.45,
    skills: 0.2,
    certifications: 0.05,
    projects: 0.1,
    aptitude: 0.2,
  },
};

// Fails loudly at startup if any scheme is mis-edited
const assertSumsToOne = (scheme, label) => {
  const sum = Object.values(scheme).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 1e-9) {
    throw new Error(`${label} must sum to 1.00, got ${sum}`);
  }
};

assertSumsToOne(PRS_WEIGHTS, "PRS_WEIGHTS");
for (const [name, scheme] of Object.entries(ALTERNATIVE_WEIGHT_SCHEMES)) {
  assertSumsToOne(scheme, `ALTERNATIVE_WEIGHT_SCHEMES.${name}`);
}

// ─────────────────────────────────────────────────────────────
// Component score parameters (Blueprint 5.1)
// TEAM-ASSIGNED — chosen to limit gaming, not empirically derived
// ─────────────────────────────────────────────────────────────

/** Points deducted per active backlog. Rationale: backlogs disqualify
 *  students from most campus drives regardless of CGPA. */
export const BACKLOG_PENALTY = 5;

/** Certifications beyond this add nothing. Rationale: prevents inflating
 *  the score with bulk low-value certificates. */
export const CERT_CAP = 4;

/** Projects beyond this add nothing to the count component. */
export const PROJECT_CAP = 3;

/** Project score splits into count (60) and relevance (40). Rationale:
 *  three unrelated projects and one highly relevant one both score 60,
 *  so relevance is what separates them. */
export const PROJECT_COUNT_WEIGHT = 60;
export const PROJECT_RELEVANCE_WEIGHT = 40;

// ─────────────────────────────────────────────────────────────
// Readiness bands (Blueprint 5.3)
// TEAM-ASSIGNED — boundaries are interpretive labels, not thresholds
// derived from placement data
// ─────────────────────────────────────────────────────────────
export const READINESS_LEVELS = [
  { min: 0, max: 40, label: "Not Ready", color: "#dc2626" },
  { min: 41, max: 60, label: "Developing", color: "#f59e0b" },
  { min: 61, max: 75, label: "Placement Ready", color: "#10b981" },
  { min: 76, max: 100, label: "Highly Ready", color: "#059669" },
];

export const getReadinessLevel = (prs) =>
  READINESS_LEVELS.find((l) => prs >= l.min && prs <= l.max)?.label ??
  "Not Ready";

// ─────────────────────────────────────────────────────────────
// Candidate matching (Blueprint 5.6)
// TEAM-ASSIGNED weights; the multiplicative eligibility gate is a
// design choice so ineligible candidates score exactly 0 rather than
// being removed by a separate filter.
// ─────────────────────────────────────────────────────────────
export const MATCH_WEIGHTS = {
  skillOverlap: 0.5,
  prs: 0.3,
  cgpa: 0.2,
};

assertSumsToOne(MATCH_WEIGHTS, "MATCH_WEIGHTS");

/** Mandatory skills count double in the overlap ratio. */
export const MANDATORY_SKILL_MULTIPLIER = 2;

// ─────────────────────────────────────────────────────────────
// Notification thresholds (Blueprint 5.8) — TEAM-ASSIGNED
// ─────────────────────────────────────────────────────────────
export const LOW_PRS_THRESHOLD = 50;
export const LOW_PRS_DAYS = 14;
export const JOB_ALERT_MATCH_THRESHOLD = 70;

// ─────────────────────────────────────────────────────────────
// Roles & enums
// ─────────────────────────────────────────────────────────────
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

export const APTITUDE_SECTIONS = [
  "quantitative",
  "logical",
  "verbal",
  "technical",
];

// ─────────────────────────────────────────────────────────────
// Limits
// ─────────────────────────────────────────────────────────────
export const MAX_RESUME_SIZE_MB = 5;
export const PRS_HISTORY_CAP = 50;
export const MAX_SKILL_PROFICIENCY = 5;

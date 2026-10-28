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
// Notification thresholds (Blueprint 5.8) — TEAM-ASSIGNED
// ─────────────────────────────────────────────────────────────
export const LOW_PRS_THRESHOLD = 50;
export const LOW_PRS_DAYS = 14;

// ─────────────────────────────────────────────────────────────
// Roles & enums
// ─────────────────────────────────────────────────────────────
export const ROLES = {
  STUDENT: "student",
  RECRUITER: "recruiter",
  FACULTY: "faculty",
  // Placement cell staff. Owns official drive records, job postings and
  // stage results. Self-registerable — see SELF_REGISTERABLE_ROLES in
  // auth.controller.js for what that grants.
  PLACEMENT_OFFICER: "placement_officer",
  ADMIN: "admin",
};

/** Shown to recruiter accounts, whose area was removed with job postings. */
export const RECRUITER_RETIRED =
  "Recruiter accounts are no longer supported — companies now reach students " +
  "through placement drives run by the placement cell.";

/** Staff who may create and manage placement drives. */
export const DRIVE_MANAGER_ROLES = [ROLES.PLACEMENT_OFFICER, ROLES.ADMIN];

/** Staff who may record official stage results. Only the placement cell —
 *  they are the office that receives the results from the company. */
export const RESULT_EDITOR_ROLES = [ROLES.PLACEMENT_OFFICER, ROLES.ADMIN];

/**
 * Staff who may read any student's placement profile.
 *
 * Faculty are deliberately absent. The placement journey — profiles,
 * comparison and stage results — belongs to the placement cell, which owns
 * the official records. Faculty keep their own batch analytics and student
 * list, which read the Student collection and never touch drive results.
 */
export const PLACEMENT_VIEWER_ROLES = [ROLES.PLACEMENT_OFFICER, ROLES.ADMIN];

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
export const PRS_HISTORY_CAP = 50;
export const MAX_SKILL_PROFICIENCY = 5;

// ─────────────────────────────────────────────────────────────
// PLACEMENT JOURNEY (additive — Drives & DriveParticipations)
// ─────────────────────────────────────────────────────────────
//
// The placement-journey module exists to answer a question the PRS alone
// cannot: two students with near-identical profiles and near-identical PRS
// can have completely different placement outcomes. PRS measures the
// profile; these records measure what actually happened in the drives.
//
// Nothing below feeds into the PRS formula. PRS_WEIGHTS and the component
// scores above are untouched.

/** Ordered stages of a campus drive. Order matters — the funnel is built
 *  from this array, and a student can only reach stage N by clearing N-1. */
export const DRIVE_STAGES = ["aptitude", "technical", "interview", "final"];

/** Stages that are pass/fail attempts (i.e. everything except the final
 *  selection decision, which has its own vocabulary). */
export const ATTEMPT_STAGES = ["aptitude", "technical", "interview"];

/**
 * Stage outcome vocabulary — deliberately strict.
 *
 * NOT_REACHED is the crucial one. A student eliminated at aptitude never
 * sat the technical round, so their technical record must NOT read as a
 * failure and must NOT count as an attempt. Conflating "never attempted"
 * with "attempted and failed" is exactly the error that makes a
 * technically-weak student and an aptitude-blocked student look alike.
 */
export const STAGE_STATUS = {
  NOT_REACHED: "not_reached",
  PASSED: "passed",
  FAILED: "failed",
};

/** Final selection decision. Only SELECTED yields an offer. */
export const FINAL_STATUS = {
  NOT_REACHED: "not_reached",
  SELECTED: "selected",
  REJECTED: "rejected",
};

export const DRIVE_STATUS = {
  PLANNED: "planned",
  ONGOING: "ongoing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/** Overall placement standing, derived — never stored. */
export const PLACEMENT_STATUS = {
  PLACED: "placed",
  IN_PROCESS: "in_process",
  UNPLACED: "unplaced",
  NO_HISTORY: "no_history",
};

/**
 * Rule-engine thresholds — TEAM-ASSIGNED, exposed here so they can be
 * tuned without touching the engine.
 *
 * The MIN_* guards are the important ones. Without them the engine would
 * happily announce "struggles with aptitude" to a student who failed a
 * single round, which is not a pattern — it is one data point. Every
 * pattern claim the engine makes has to clear a minimum sample size, and
 * when it cannot, the engine says so instead of guessing.
 */
export const PLACEMENT_RULES = {
  /** Drives a student must have actually participated in before any
   *  overall conclusion (strength, weakness, or verdict) is drawn. */
  MIN_DRIVES_FOR_PATTERN: 3,

  /** Attempts at ONE stage before that stage may be called a strength
   *  or a weakness. Two failures is a coincidence; three is a pattern. */
  MIN_ATTEMPTS_PER_STAGE: 3,

  /** Interviews reached before "reaches interviews but does not convert"
   *  may be claimed. */
  MIN_INTERVIEWS_FOR_CONVERSION: 2,

  /** Pass rate at or below this is a weakness. */
  LOW_PASS_RATE: 0.34,

  /** Pass rate at or above this is a strength. */
  HIGH_PASS_RATE: 0.67,

  /** A profile this strong with zero offers is the headline contrast the
   *  system is built to surface — a strong profile that is not converting.
   *  Set to the floor of the "Placement Ready" band in READINESS_LEVELS, so
   *  the claim reads as "the PRS says ready, the drive results disagree"
   *  rather than being a second, unrelated threshold. */
  STRONG_PROFILE_PRS: 61,

  /** Below the per-stage minimum but above this, findings are reported as
   *  provisional rather than suppressed entirely. */
  MIN_ATTEMPTS_PROVISIONAL: 2,
};

// ─────────────────────────────────────────────────────────────
// JOB POSTINGS (RETIRED)
// ─────────────────────────────────────────────────────────────
//
// The job-postings module was removed in favour of placement drives. These
// constants remain only because the Job and Application models — and the
// records already stored with them — still use them.

/**
 * Where a job posting came from.
 *
 * `recruiter` is the original path: a self-registered recruiter posts
 * against their own Company document. `placement_cell` is the path the
 * placement officer uses — they are relaying an opening a company sent to
 * the college, so there is usually no recruiter account and no Company
 * document behind it, just a company name and whatever the company sent.
 */
export const JOB_SOURCE = {
  RECRUITER: "recruiter",
  PLACEMENT_CELL: "placement_cell",
};

/**
 * Company tiers, in the vocabulary campus placement cells actually use.
 * TEAM-ASSIGNED labels — the CTC bands are indicative, not enforced.
 */
export const COMPANY_LEVELS = [
  { value: "mass", label: "Mass recruiter", hint: "High volume, entry CTC" },
  { value: "mid", label: "Mid tier", hint: "Moderate CTC, selective" },
  { value: "dream", label: "Dream", hint: "High CTC, strong filters" },
  { value: "super_dream", label: "Super dream", hint: "Top CTC, very selective" },
];

export const COMPANY_LEVEL_VALUES = COMPANY_LEVELS.map((l) => l.value);


// ─────────────────────────────────────────────────────────────
// PLACEMENT ROSTER ORDERING
// ─────────────────────────────────────────────────────────────

/**
 * How the placement roster is grouped, best outcome first.
 *
 * The officer scans this list looking for who needs attention, so the list
 * is ordered by what actually happened rather than by any score: students
 * holding an offer are done, students clearing rounds are progressing, and
 * students clearing nothing are the ones to act on. `NO_HISTORY` sits last
 * because "never attended a drive" is a different problem from "attended
 * and did not progress".
 */
export const PLACEMENT_GROUP = {
  PLACED: "placed",
  PROGRESSED: "progressed",
  NO_PASSES: "no_passes",
  NO_HISTORY: "no_history",
};

export const PLACEMENT_GROUP_ORDER = [
  PLACEMENT_GROUP.PLACED,
  PLACEMENT_GROUP.PROGRESSED,
  PLACEMENT_GROUP.NO_PASSES,
  PLACEMENT_GROUP.NO_HISTORY,
];

export const PLACEMENT_GROUP_LABEL = {
  placed: "Placed",
  progressed: "Cleared some rounds",
  no_passes: "No rounds cleared",
  no_history: "No drive history",
};

// ─────────────────────────────────────────────────────────────
// DEPARTMENTS
// ─────────────────────────────────────────────────────────────

/**
 * Departments a faculty account can belong to. These match the values used
 * for Student.branch — faculty scoping compares the two directly, so the
 * vocabularies have to stay the same.
 */
export const DEPARTMENTS = ["ISE", "CSE", "ECE", "AIML", "EEE", "ME", "CV"];

/**
 * Branch codes as they appear inside a USN, mapped to our department codes.
 *
 * A USN is laid out `4MT<YY><BB><NNN>` — college code, admission year,
 * branch, serial. When a spreadsheet has no department column the branch is
 * still sitting in the USN, so an imported student can be filed correctly
 * from the identifier alone.
 */
export const USN_BRANCH_CODES = {
  IS: "ISE",
  CS: "CSE",
  EC: "ECE",
  AI: "AIML",
  EE: "EEE",
  ME: "ME",
  CV: "CV",
};

/** Course length in years, used to derive a batch from a USN's entry year. */
export const COURSE_YEARS = 4;

/**
 * Ways a department gets written on a spreadsheet, mapped to our codes.
 *
 * Offices write "Information Science", "Information Science & Engineering"
 * or "ISE" in the same column of the same file. Faculty scoping compares
 * Student.branch against User.department directly, so a student filed under
 * "INFORMATION SCIENCE" would be invisible to their own ISE faculty —
 * everything entering the system has to be reduced to a code first.
 *
 * Matched on the longest key first, so "computer science" is not swallowed
 * by a shorter substring.
 */
const DEPARTMENT_SYNONYMS = {
  "information science": "ISE",
  "information technology": "ISE",
  ise: "ISE",
  it: "ISE",

  "computer science": "CSE",
  computer: "CSE",
  cse: "CSE",
  cs: "CSE",

  "electronics and communication": "ECE",
  "electronics & communication": "ECE",
  electronics: "ECE",
  ece: "ECE",
  ec: "ECE",

  "artificial intelligence": "AIML",
  "machine learning": "AIML",
  aiml: "AIML",
  ai: "AIML",

  "electrical and electronics": "EEE",
  "electrical & electronics": "EEE",
  electrical: "EEE",
  eee: "EEE",
  ee: "EEE",

  mechanical: "ME",
  me: "ME",

  civil: "CV",
  cv: "CV",
  ce: "CV",
};

/**
 * Reduce however a department was written to one of DEPARTMENTS.
 * Returns null when it cannot be placed, so the caller can fall back to the
 * USN or report it rather than inventing a department.
 */
export const normaliseDepartment = (raw) => {
  if (!raw) return null;
  const text = String(raw).toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const upper = text.toUpperCase().replace(/ /g, "");
  if (DEPARTMENTS.includes(upper)) return upper;

  const words = text.split(" ");

  // Longest key first so "computer science" wins over "cs".
  const keys = Object.keys(DEPARTMENT_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (text === key) return DEPARTMENT_SYNONYMS[key];

    // Short keys are abbreviations and must match a whole word — otherwise
    // "ec" matches inside "bio tech" and files a biotech student under ECE.
    // Longer keys are real phrases and may appear anywhere in the cell.
    const matched =
      key.length <= 3
        ? words.includes(key)
        : text.includes(key);
    if (matched) return DEPARTMENT_SYNONYMS[key];
  }
  return null;
};

export const DEPARTMENT_LABEL = {
  ISE: "Information Science & Engineering",
  CSE: "Computer Science & Engineering",
  ECE: "Electronics & Communication",
  AIML: "Artificial Intelligence & Machine Learning",
  EEE: "Electrical & Electronics",
  ME: "Mechanical Engineering",
  CV: "Civil Engineering",
};

// ─────────────────────────────────────────────────────────────
// RESULT SUBMISSIONS
// ─────────────────────────────────────────────────────────────
//
// The pipeline that carries a result from whoever knows it to the official
// record. Three entry points feed it and they are independent of each other:
//
//   faculty asks a student  ->  student fills it in  ->  faculty forwards
//   faculty enters it directly (own department)      ->  faculty forwards
//   placement officer enters or imports it directly  ->  official at once
//
// Forwarding writes the result onto DriveParticipation.stages, which stays
// the single source of every derived metric.

export const SUBMISSION_STATUS = {
  /** Faculty has asked this student for their results; nothing filled yet. */
  REQUESTED: "requested",
  /** The student has filled it in and it is waiting on faculty review. */
  SUBMITTED: "submitted",
  /** Faculty accepted it and wrote it to the official record. */
  FORWARDED: "forwarded",
  /** Faculty declined it; the official record was not touched. */
  REJECTED: "rejected",
};

/** Who originated a set of results, kept for provenance on the official record. */
export const RESULT_SOURCE = {
  STUDENT: "student",
  FACULTY: "faculty",
  PLACEMENT_CELL: "placement_cell",
  IMPORT: "spreadsheet_import",
};

// ─────────────────────────────────────────────────────────────
// MANAGED RECRUITMENT WORKFLOW
// ─────────────────────────────────────────────────────────────
//
// A drive created through the recruitment workflow ("managed") runs the
// whole process inside CareerCore: eligibility is calculated, students are
// notified and register themselves, and each configured round carries its
// own attendance and result records. Drives recorded the original way
// ("recorded") keep the fixed four-stage model above and are untouched.
//
// Managed results are mirrored onto DriveParticipation.stages when a round is
// finalized (see ROUND_TYPES.legacyStage), so the placement profile, the rule
// engine and the export keep a single source for every derived metric.

export const DRIVE_WORKFLOW = {
  RECORDED: "recorded",
  MANAGED: "managed",
};

/** Lifecycle of a managed drive. The recorded statuses above stay valid. */
export const MANAGED_DRIVE_STATUS = {
  DRAFT: "draft",
  OPEN: "open",
  REGISTRATION_CLOSED: "registration_closed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/**
 * Allowed status moves for a managed drive. Anything not listed is rejected
 * by the server, whatever the client sends.
 */
export const MANAGED_STATUS_TRANSITIONS = {
  draft: ["open", "cancelled"],
  open: ["registration_closed", "cancelled"],
  registration_closed: ["open", "in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Statuses in which a drive counts as active on the dashboards. */
export const ACTIVE_DRIVE_STATUSES = [
  "open",
  "registration_closed",
  "in_progress",
  // recorded drives
  "planned",
  "ongoing",
];

/**
 * The predefined round vocabulary. Officers pick from this list; they never
 * type a round name. `legacyStage` is the four-stage bucket the round's
 * outcome is mirrored into for the placement profile.
 */
export const ROUND_TYPES = [
  { code: "aptitude", label: "Aptitude Test", legacyStage: "aptitude" },
  { code: "coding", label: "Coding Test", legacyStage: "technical" },
  { code: "group_discussion", label: "Group Discussion", legacyStage: "interview" },
  { code: "technical", label: "Technical Interview", legacyStage: "technical" },
  { code: "f2f", label: "Face-to-Face Interview", legacyStage: "interview" },
  { code: "hr", label: "HR Interview", legacyStage: "interview" },
];

export const ROUND_TYPE_CODES = ROUND_TYPES.map((r) => r.code);
export const ROUND_TYPE_LABEL = Object.fromEntries(ROUND_TYPES.map((r) => [r.code, r.label]));

/** Starting templates offered when no template has been saved yet. Stored
 *  as ordinary editable templates on first use, not consulted afterwards. */
export const DEFAULT_INTERVIEW_TEMPLATES = [
  { key: "software", name: "Software Recruitment", rounds: ["aptitude", "coding", "technical", "hr"] },
  { key: "service", name: "Service Company", rounds: ["aptitude", "group_discussion", "technical", "hr"] },
];

export const ROUND_STATUS = {
  PENDING: "pending",
  SCHEDULED: "scheduled",
  FINALIZED: "finalized",
};

export const ROUND_MODES = ["offline", "online"];

export const ATTENDANCE = {
  UNMARKED: "unmarked",
  APPEARED: "appeared",
  ABSENT: "absent",
};

export const ROUND_RESULT = {
  PENDING: "pending",
  PASSED: "passed",
  FAILED: "failed",
};

export const REGISTRATION_STATUS = {
  REGISTERED: "registered",
  WITHDRAWN: "withdrawn",
};

export const OFFER_STATUS = ["pending", "accepted", "declined", "revoked"];

/**
 * Who may reopen a finalized round. Kept narrower than DRIVE_MANAGER_ROLES on
 * purpose: unlocking an official result is the exceptional path, and every
 * use is written to the audit log with a mandatory reason.
 */
export const ROUND_REOPEN_ROLES = [ROLES.ADMIN];

/** Who may change the college-wide participation policy. */
export const POLICY_EDITOR_ROLES = [ROLES.PLACEMENT_OFFICER, ROLES.ADMIN];

/**
 * What happens when a student who already holds a final selection tries to
 * register for another drive.
 */
export const PARTICIPATION_POLICY = {
  BLOCK_SELECTED: "block_selected",
  ALLOW_ALL: "allow_all",
  HIGHER_PACKAGE_ONLY: "higher_package_only",
};

export const PARTICIPATION_POLICY_LABEL = {
  block_selected: "A selected student cannot register for another drive",
  allow_all: "A selected student may continue participating",
  higher_package_only: "A selected student may register only for a higher package",
};

export const DEFAULT_PARTICIPATION_POLICY = PARTICIPATION_POLICY.BLOCK_SELECTED;

/** Hours before a registration deadline at which eligible, unregistered
 *  students get one reminder. */
export const DEADLINE_REMINDER_HOURS = 24;

/** Page size ceiling for every paginated student list. */
export const MAX_PAGE_SIZE = 200;

/** Overall placement standing of one student across managed and recorded drives. */
export const STUDENT_PLACEMENT_STATE = {
  SELECTED: "selected",
  IN_PROCESS: "in_process",
  REGISTERED: "registered",
  ELIGIBLE: "eligible",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn",
  NOT_PLACED: "not_placed",
};

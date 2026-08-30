import { PLACEMENT_RULES } from "../config/constants.js";

/**
 * CareerCore — Placement rule engine
 * ==================================
 *
 * Turns the derived metrics from buildPlacementProfile() into strengths,
 * weak areas and an overall read of the student's placement pattern.
 *
 * ─── WHAT THIS ENGINE WILL NOT DO ──────────────────────────────────────
 *
 * 1. It does not know who any student is. Its only inputs are counts. The
 *    demo students A–E get their narratives from their records, exactly the
 *    same way a real student would; there is no lookup table of conclusions
 *    keyed by name, USN or seed id anywhere in this file.
 *
 * 2. It does not label a student from a single failure. Every pattern claim
 *    has to clear a minimum sample size from PLACEMENT_RULES. One failed
 *    aptitude round is a data point, not an "aptitude problem".
 *
 * 3. It does not fill silence with guesses. Below the minimum sample size
 *    it returns `sufficientData: false` and says plainly that there is not
 *    enough placement history to identify a reliable pattern. Saying
 *    nothing is a valid, and often correct, output.
 *
 * Findings between the provisional and full thresholds are emitted with
 * confidence "provisional" and phrased as observations rather than
 * conclusions, so the UI can present them with the appropriate hedge.
 * ──────────────────────────────────────────────────────────────────────
 *
 * All thresholds live in config/constants.js (PLACEMENT_RULES) so they can
 * be tuned without editing this logic.
 */

const {
  MIN_DRIVES_FOR_PATTERN,
  MIN_ATTEMPTS_PER_STAGE,
  MIN_INTERVIEWS_FOR_CONVERSION,
  LOW_PASS_RATE,
  HIGH_PASS_RATE,
  STRONG_PROFILE_PRS,
  MIN_ATTEMPTS_PROVISIONAL,
} = PLACEMENT_RULES;

/**
 * Singular stage nouns. Chosen so both sentence shapes the engine builds
 * read correctly: "blocked at the <label>" and "<n> <label>s".
 */
const STAGE_LABEL = {
  aptitude: "aptitude round",
  technical: "technical round",
  interview: "interview",
};

/**
 * Confidence for a claim made from `n` observations:
 *   >= MIN_ATTEMPTS_PER_STAGE  -> "reliable"
 *   >= MIN_ATTEMPTS_PROVISIONAL -> "provisional"
 *   otherwise                   -> null (the claim must not be made at all)
 */
const confidenceFor = (n) => {
  if (n >= MIN_ATTEMPTS_PER_STAGE) return "reliable";
  if (n >= MIN_ATTEMPTS_PROVISIONAL) return "provisional";
  return null;
};

const finding = ({ code, stage, title, detail, confidence, evidence }) => ({
  code,
  stage,
  title,
  detail,
  confidence,
  evidence,
});

/**
 * Evaluate one pass/fail stage and return a strength, a weakness, or null
 * when the evidence is too thin to say either.
 */
const judgeStage = (stage, tally) => {
  const attempts = tally.attempts ?? tally.reached ?? 0;
  const passed = tally.passed ?? 0;
  const failed = tally.failed ?? 0;

  const confidence = confidenceFor(attempts);
  if (!confidence) return null;

  const passRate = attempts > 0 ? passed / attempts : 0;
  const label = STAGE_LABEL[stage] ?? stage;
  const evidence = {
    stage,
    attempts,
    passed,
    failed,
    passRate: Math.round(passRate * 100) / 100,
    passPercent: Math.round(passRate * 10000) / 100,
  };

  if (passRate <= LOW_PASS_RATE) {
    return {
      kind: "weakness",
      value: finding({
        code: `${stage}_low_pass_rate`,
        stage,
        title: `Consistently blocked at the ${label}`,
        detail:
          `Cleared ${passed} of ${attempts} ${label}s ` +
          `(${evidence.passPercent}%). Across ${attempts} attempts this is a ` +
          `repeated pattern rather than a single off day.`,
        confidence,
        evidence,
      }),
    };
  }

  if (passRate >= HIGH_PASS_RATE) {
    return {
      kind: "strength",
      value: finding({
        code: `${stage}_high_pass_rate`,
        stage,
        title: `Clears the ${label} reliably`,
        detail:
          `Cleared ${passed} of ${attempts} ${label}s ` +
          `(${evidence.passPercent}%).`,
        confidence,
        evidence,
      }),
    };
  }

  return null; // mid-range: real data, but no claim worth making
};

/**
 * deriveInsights(metrics, context)
 *
 * @param {object} metrics  The `metrics` block from buildPlacementProfile().
 * @param {object} [context]
 * @param {number} [context.prs]             Current PRS, for the profile-vs-outcome check.
 * @param {string} [context.readinessLevel]
 * @param {number} [context.cgpa]
 * @returns {{
 *   sufficientData: boolean,
 *   summary: string,
 *   strengths: object[],
 *   weakAreas: object[],
 *   observations: object[],
 *   thresholds: object
 * }}
 */
export const deriveInsights = (metrics, context = {}) => {
  const strengths = [];
  const weakAreas = [];
  const observations = [];

  const attended = metrics.drivesAttended ?? 0;
  const registered = metrics.drivesRegistered ?? 0;
  const offers = metrics.offers ?? 0;

  const thresholds = {
    minDrivesForPattern: MIN_DRIVES_FOR_PATTERN,
    minAttemptsPerStage: MIN_ATTEMPTS_PER_STAGE,
    minInterviewsForConversion: MIN_INTERVIEWS_FOR_CONVERSION,
    lowPassRate: LOW_PASS_RATE,
    highPassRate: HIGH_PASS_RATE,
  };

  // ── Guard 1: no history at all ───────────────────────────────
  if (registered === 0) {
    return {
      sufficientData: false,
      summary:
        "No placement drive history on record yet. Once this student has " +
        "participated in campus drives, their pattern will be built from " +
        "those official results.",
      strengths: [],
      weakAreas: [],
      observations: [],
      thresholds,
    };
  }

  // ── Guard 2: registered, but nothing has actually happened ───
  if (attended === 0) {
    return {
      sufficientData: false,
      summary:
        `Registered for ${registered} drive${registered === 1 ? "" : "s"} but ` +
        "no stage results have been recorded yet, so there is insufficient " +
        "placement history to identify a reliable pattern.",
      strengths: [],
      weakAreas: [],
      observations: [],
      thresholds,
    };
  }

  // ── Guard 3: too few drives to generalise from ───────────────
  // An offer is self-evident and worth stating even on thin history; a
  // weakness is not. This branch reports the fact and stops short of any
  // diagnosis, which is what keeps Student E honest.
  if (attended < MIN_DRIVES_FOR_PATTERN) {
    const factual = offers
      ? `Holds ${offers} offer${offers === 1 ? "" : "s"} from ` +
        `${attended} drive${attended === 1 ? "" : "s"} attended.`
      : `No offers yet from ${attended} drive${attended === 1 ? "" : "s"} attended.`;

    return {
      sufficientData: false,
      summary:
        `${factual} With fewer than ${MIN_DRIVES_FOR_PATTERN} drives attended ` +
        "there is insufficient placement history to identify a reliable " +
        "pattern — a single result is a data point, not a trend.",
      strengths: [],
      weakAreas: [],
      observations: [
        finding({
          code: "insufficient_history",
          stage: null,
          title: "Limited placement history",
          detail:
            `${attended} of ${registered} registered drive` +
            `${registered === 1 ? "" : "s"} produced results. ` +
            `At least ${MIN_DRIVES_FOR_PATTERN} are needed before strengths ` +
            "or weak areas can be identified from outcomes.",
          confidence: "insufficient",
          evidence: { drivesRegistered: registered, drivesAttended: attended },
        }),
      ],
      thresholds,
    };
  }

  // ── Per-stage judgements ─────────────────────────────────────
  for (const [stage, tally] of [
    ["aptitude", metrics.aptitude],
    ["technical", metrics.technical],
    ["interview", metrics.interview],
  ]) {
    const verdict = judgeStage(stage, tally || {});
    if (!verdict) continue;
    (verdict.kind === "strength" ? strengths : weakAreas).push(verdict.value);
  }

  // ── Stage never reached, because an earlier stage blocked it ──
  // This is the distinction `not_reached` exists to preserve: the student
  // has no technical record because they never sat one, and it would be
  // wrong to read that absence as technical weakness.
  const aptAttempts = metrics.aptitude?.attempts ?? 0;
  const techAttempts = metrics.technical?.attempts ?? 0;
  const interviewsReached = metrics.interview?.reached ?? 0;

  if (aptAttempts >= MIN_ATTEMPTS_PER_STAGE && techAttempts === 0) {
    observations.push(
      finding({
        code: "technical_never_reached",
        stage: "technical",
        title: "Technical rounds never reached",
        detail:
          `Eliminated before the technical round in all ${aptAttempts} drives ` +
          "attempted, so there is no evidence either way about technical " +
          "ability — it has never been tested in a drive.",
        confidence: "reliable",
        evidence: { aptitudeAttempts: aptAttempts, technicalAttempts: 0 },
      }),
    );
  }

  if (techAttempts >= MIN_ATTEMPTS_PER_STAGE && interviewsReached === 0) {
    observations.push(
      finding({
        code: "interview_never_reached",
        stage: "interview",
        title: "Interview stage never reached",
        detail:
          `Reached the technical round ${techAttempts} times but never an ` +
          "interview, so interview performance has not been observed.",
        confidence: "reliable",
        evidence: { technicalAttempts: techAttempts, interviewsReached: 0 },
      }),
    );
  }

  // ── Reaches interviews but does not convert ──────────────────
  if (interviewsReached >= MIN_INTERVIEWS_FOR_CONVERSION && offers === 0) {
    weakAreas.push(
      finding({
        code: "interview_conversion",
        stage: "interview",
        title: "Reaches interviews but has not converted one",
        detail:
          `Reached ${interviewsReached} interviews without an offer. The ` +
          "pipeline up to the interview is working; the final conversion is " +
          "where progress stops.",
        confidence: confidenceFor(interviewsReached) ?? "provisional",
        evidence: { interviewsReached, offers: 0 },
      }),
    );
  }

  // ── Offers ───────────────────────────────────────────────────
  if (offers > 0) {
    strengths.push(
      finding({
        code: "converted_offer",
        stage: "final",
        title:
          offers === 1
            ? "Converted a drive into an offer"
            : `Converted ${offers} drives into offers`,
        detail:
          `${offers} offer${offers === 1 ? "" : "s"} from ${attended} drives ` +
          `attended (${metrics.successRate ?? 0}% conversion).`,
        confidence: "reliable",
        evidence: {
          offers,
          drivesAttended: attended,
          successRate: metrics.successRate,
        },
      }),
    );
  }

  // ── Profile strength vs actual outcome ───────────────────────
  // The headline contrast this whole module exists to surface: a profile
  // that scores well but is not converting. Stated only with enough drives
  // behind it, and phrased as a divergence, not as a criticism.
  const prs = context.prs ?? 0;
  if (prs >= STRONG_PROFILE_PRS && offers === 0) {
    observations.push(
      finding({
        code: "profile_outcome_gap",
        stage: null,
        title: "Strong profile, no offers yet",
        detail:
          `PRS of ${prs} sits in the ${context.readinessLevel ?? "ready"} band, ` +
          `but ${attended} drives attended have produced no offer. The profile ` +
          "is not what is holding this student back — the drive results show " +
          "where the process is actually breaking down.",
        confidence: "reliable",
        evidence: {
          prs,
          readinessLevel: context.readinessLevel,
          drivesAttended: attended,
          offers: 0,
        },
      }),
    );
  }

  // ── Summary line ─────────────────────────────────────────────
  let summary;
  if (offers > 0) {
    summary =
      `${offers} offer${offers === 1 ? "" : "s"} from ${attended} drives ` +
      `attended (${metrics.successRate ?? 0}% conversion).`;
  } else if (weakAreas.length) {
    summary =
      `No offers from ${attended} drives attended. Primary blocker: ` +
      `${weakAreas[0].title.toLowerCase()}.`;
  } else {
    summary =
      `No offers from ${attended} drives attended. No single stage stands ` +
      "out as the blocker in the results recorded so far.";
  }

  return {
    sufficientData: true,
    summary,
    strengths,
    weakAreas,
    observations,
    thresholds,
  };
};

/**
 * Comparison helper for the faculty side-by-side view.
 *
 * Reports only differences that the underlying records actually support:
 * a stage is compared between two students only when BOTH have enough
 * attempts at it, otherwise the comparison is reported as not possible.
 * Without this guard the view would confidently contrast a student with
 * six aptitude attempts against one with none.
 */
export const compareProfiles = (profiles) => {
  if (profiles.length < 2) return { comparable: false, points: [] };

  const points = [];

  const stageOf = (p, stage) =>
    stage === "interview"
      ? {
          attempts: p.metrics.interview.reached,
          passed: p.metrics.interview.passed,
        }
      : {
          attempts: p.metrics[stage].attempts,
          passed: p.metrics[stage].passed,
        };

  for (const stage of ["aptitude", "technical", "interview"]) {
    const rows = profiles.map((p) => ({
      studentId: p.studentId,
      name: p.student?.name,
      ...stageOf(p, stage),
    }));

    const everyoneHasEnough = rows.every(
      (r) => r.attempts >= MIN_ATTEMPTS_PROVISIONAL,
    );

    points.push({
      stage,
      comparable: everyoneHasEnough,
      rows: rows.map((r) => ({
        ...r,
        passPercent:
          r.attempts > 0 ? Math.round((r.passed / r.attempts) * 10000) / 100 : null,
      })),
      note: everyoneHasEnough
        ? null
        : `Not comparable — at least one student has fewer than ` +
          `${MIN_ATTEMPTS_PROVISIONAL} recorded attempts at this stage.`,
    });
  }

  return { comparable: true, points };
};

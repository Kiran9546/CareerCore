import AptitudeAttempt from "../models/AptitudeAttempt.js";
import CareerPath from "../models/CareerPath.js";
import { getSkillGap } from "./mlClient.js";
import {
  PRS_WEIGHTS,
  ALTERNATIVE_WEIGHT_SCHEMES,
  BACKLOG_PENALTY,
  CERT_CAP,
  PROJECT_CAP,
  PROJECT_COUNT_WEIGHT,
  PROJECT_RELEVANCE_WEIGHT,
  getReadinessLevel,
} from "../config/constants.js";

const round = (n) => Math.round(n * 100) / 100;

// A = max(0, (CGPA/10)*100 - 5*backlogs)
export const academicScore = (cgpa = 0, backlogs = 0) => {
  const base = (Number(cgpa) / 10) * 100;
  const penalty = Number(backlogs) * BACKLOG_PENALTY;
  return Math.max(0, Math.min(100, base - penalty));
};

// C = (min(n,4)/4)*100
export const certificationScore = (count = 0) =>
  (Math.min(Number(count), CERT_CAP) / CERT_CAP) * 100;

// P = (min(n,3)/3)*60 + relevance*40
export const projectScore = (projects = [], careerPathSkills = []) => {
  const count = projects.length;
  if (count === 0) return 0;

  const countPart =
    (Math.min(count, PROJECT_CAP) / PROJECT_CAP) * PROJECT_COUNT_WEIGHT;

  const targetSet = new Set(
    careerPathSkills.map((s) => String(s.name).toLowerCase().trim()),
  );
  const techItems = projects.flatMap((p) =>
    (p.techStack || []).map((t) => String(t).toLowerCase().trim()),
  );

  let relevance = 0;
  if (techItems.length && targetSet.size) {
    relevance =
      techItems.filter((t) => targetSet.has(t)).length / techItems.length;
  }

  return Math.min(100, countPart + relevance * PROJECT_RELEVANCE_WEIGHT);
};

// T = latest submitted attempt's totalScore
export const aptitudeScore = async (studentId) => {
  const attempt = await AptitudeAttempt.findOne({
    studentId,
    status: "submitted",
  })
    .sort("-submittedAt")
    .select("totalScore sectionScores submittedAt");

  if (!attempt) return { score: 0, attempted: false, attemptedAt: null };

  return {
    score: attempt.totalScore,
    attempted: true,
    attemptedAt: attempt.submittedAt,
    sections: attempt.sectionScores,
  };
};

export const computePRS = async (student, options = {}) => {
  const weights = options.weights || PRS_WEIGHTS;

  const A = academicScore(student.cgpa, student.backlogs);
  const C = certificationScore(student.certifications?.length || 0);
  const aptitude = await aptitudeScore(student._id);
  const T = aptitude.score;

  if (!student.careerInterest) {
    return {
      total: null,
      computable: false,
      message:
        "Select a career interest to compute your Placement Readiness Score",
      partial: {
        academic: round(A),
        certifications: round(C),
        aptitude: round(T),
      },
      aptitudeAttempted: aptitude.attempted,
    };
  }

  const careerPath = await CareerPath.findById(student.careerInterest).select(
    "name code requiredSkills",
  );

  if (!careerPath) {
    return {
      total: null,
      computable: false,
      message: "Selected career path no longer exists — please choose another",
      partial: {
        academic: round(A),
        certifications: round(C),
        aptitude: round(T),
      },
    };
  }

  const studentSkills = (student.skills || []).map((s) => ({
    name: s.name,
    proficiency: s.proficiency,
  }));
  const requiredSkills = careerPath.requiredSkills.map((s) => ({
    name: s.name,
    weight: s.weight,
  }));

  const gapResult = await getSkillGap(studentSkills, requiredSkills, 10);
  const S = gapResult.skillScore;
  const P = projectScore(student.projects, careerPath.requiredSkills);

  const breakdown = {
    academic: round(A),
    skills: round(S),
    certifications: round(C),
    projects: round(P),
    aptitude: round(T),
  };

  const total = round(
    A * weights.academic +
      S * weights.skills +
      C * weights.certifications +
      P * weights.projects +
      T * weights.aptitude,
  );

  const weightKey = {
    academic: "academic",
    skills: "skills",
    certifications: "certifications",
    projects: "projects",
    aptitude: "aptitude",
  };
  const weakest = Object.entries(breakdown)
    .map(([k, v]) => ({
      name: k,
      score: v,
      pointsLost: round((100 - v) * weights[weightKey[k]]),
    }))
    .sort((a, b) => b.pointsLost - a.pointsLost)[0];

  return {
    total,
    computable: true,
    breakdown,
    readinessLevel: getReadinessLevel(total),
    careerPath: {
      id: careerPath._id,
      name: careerPath.name,
      code: careerPath.code,
    },
    skillAnalysis: {
      available: gapResult.available,
      similarity: gapResult.similarity,
      matchPercent: gapResult.matchPercent,
      gaps: gapResult.gaps,
      matchedCount: gapResult.matchedCount,
      totalGaps: gapResult.totalGaps,
    },
    aptitudeAttempted: aptitude.attempted,
    weakestComponent: weakest,
    computedAt: new Date(),
  };
};

export const computeAndSavePRS = async (student, options = {}) => {
  const result = await computePRS(student, options);
  if (!result.computable) return result;

  student.currentPRS = result.total;
  student.prsBreakdown = result.breakdown;
  student.readinessLevel = result.readinessLevel;
  student.lastPrsComputedAt = result.computedAt;
  student.pushPrsSnapshot(result.total, result.breakdown);

  await student.save();
  return result;
};

export const computePRSAllSchemes = async (student) => {
  const schemes = { default: PRS_WEIGHTS, ...ALTERNATIVE_WEIGHT_SCHEMES };
  const results = {};

  for (const [name, weights] of Object.entries(schemes)) {
    const r = await computePRS(student, { weights });
    results[name] = r.computable
      ? { total: r.total, level: r.readinessLevel }
      : { total: null, message: r.message };
  }

  const totals = Object.values(results)
    .map((r) => r.total)
    .filter((t) => t !== null);

  return {
    schemes: results,
    spread: totals.length
      ? {
          min: Math.min(...totals),
          max: Math.max(...totals),
          range: round(Math.max(...totals) - Math.min(...totals)),
        }
      : null,
  };
};

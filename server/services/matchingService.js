import {
  MATCH_WEIGHTS,
  MANDATORY_SKILL_MULTIPLIER,
} from "../config/constants.js";

const round = (n) => Math.round(n * 100) / 100;

export const eligibilityGate = (student, job) => {
  if (student.cgpa < (job.minCgpa ?? 0)) return 0;
  if (student.backlogs > (job.maxBacklogs ?? 99)) return 0;
  if (
    job.eligibleBranches?.length &&
    !job.eligibleBranches.includes(student.branch)
  )
    return 0;
  if (
    job.eligibleBatches?.length &&
    !job.eligibleBatches.includes(student.batch)
  )
    return 0;
  return 1;
};

export const skillOverlap = (studentSkills = [], jobSkills = []) => {
  if (!jobSkills.length) return 0;

  const held = new Set(studentSkills.map((s) => s.name));

  let matchedWeight = 0;
  let totalWeight = 0;

  for (const js of jobSkills) {
    const mu = js.isMandatory ? MANDATORY_SKILL_MULTIPLIER : 1;
    totalWeight += mu;
    if (held.has(js.name)) matchedWeight += mu;
  }

  return totalWeight ? matchedWeight / totalWeight : 0;
};

export const computeMatch = (student, job) => {
  const E = eligibilityGate(student, job);

  const sigma = skillOverlap(student.skills, job.requiredSkills);
  const prsPart = (student.currentPRS ?? 0) / 100;
  const cgpaPart = (student.cgpa ?? 0) / 10;

  const raw =
    MATCH_WEIGHTS.skillOverlap * sigma +
    MATCH_WEIGHTS.prs * prsPart +
    MATCH_WEIGHTS.cgpa * cgpaPart;

  const matchPercent = round(E * raw * 100);

  const held = new Set(student.skills.map((s) => s.name));
  const missingMandatory = job.requiredSkills
    .filter((js) => js.isMandatory && !held.has(js.name))
    .map((js) => js.name);

  return {
    matchPercent,
    eligible: E === 1,
    skillOverlapPercent: round(sigma * 100),
    matchedSkills: job.requiredSkills
      .filter((js) => held.has(js.name))
      .map((js) => js.name),
    missingSkills: job.requiredSkills
      .filter((js) => !held.has(js.name))
      .map((js) => js.name),
    missingMandatory,
    ineligibleReason: E === 0 ? ineligibilityReason(student, job) : null,
  };
};

const ineligibilityReason = (student, job) => {
  if (student.cgpa < (job.minCgpa ?? 0))
    return `CGPA ${student.cgpa} below required ${job.minCgpa}`;
  if (student.backlogs > (job.maxBacklogs ?? 99))
    return `${student.backlogs} backlogs exceeds limit of ${job.maxBacklogs}`;
  if (
    job.eligibleBranches?.length &&
    !job.eligibleBranches.includes(student.branch)
  )
    return `Branch ${student.branch} not eligible`;
  if (
    job.eligibleBatches?.length &&
    !job.eligibleBatches.includes(student.batch)
  )
    return `Batch ${student.batch} not eligible`;
  return "Not eligible";
};

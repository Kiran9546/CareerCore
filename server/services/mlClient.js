import axios from "axios";

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:5000";

const client = axios.create({
  baseURL: ML_URL,
  timeout: 8000,
  headers: { "Content-Type": "application/json" },
});

/**
 * Calls to the Flask ML service. Every function resolves (never throws) and
 * reports `available: false` when the service cannot be reached, so callers
 * decide how to degrade.
 */

export const getSkillGap = async (studentSkills, requiredSkills, topN = 10) => {
  try {
    const { data } = await client.post("/ml/skill-gap", {
      studentSkills,
      requiredSkills,
      topN,
    });
    return { available: true, ...data };
  } catch (err) {
    console.error(`ML skill-gap failed: ${err.message}`);
    return {
      available: false,
      skillScore: 0,
      similarity: 0,
      matchPercent: 0,
      gaps: [],
      matched: [],
      error: err.message,
    };
  }
};

export const predictCareer = async (profile) => {
  try {
    const { data } = await client.post("/ml/predict-career", profile);
    return { available: true, ...data };
  } catch (err) {
    console.error(`ML predict-career failed: ${err.message}`);
    return { available: false, predictions: [], error: err.message };
  }
};

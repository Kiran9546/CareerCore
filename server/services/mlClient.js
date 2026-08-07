import axios from "axios";

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:5000";

const client = axios.create({
  baseURL: ML_URL,
  timeout: 8000,
  headers: { "Content-Type": "application/json" },
});

export const checkMlHealth = async () => {
  try {
    const { data } = await client.get("/health");
    return { available: true, ...data };
  } catch (err) {
    return { available: false, error: err.message };
  }
};

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

export const rankCandidates = async (candidates, requiredSkills) => {
  try {
    const { data } = await client.post("/ml/rank-candidates", {
      candidates,
      requiredSkills,
    });
    return { available: true, ...data };
  } catch (err) {
    console.error(`ML rank-candidates failed: ${err.message}`);
    return { available: false, candidates: [], error: err.message };
  }
};

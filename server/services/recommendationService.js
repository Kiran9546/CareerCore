import LearningResource from "../models/LearningResource.js";

const DIFFICULTY_ORDER = { beginner: 1, intermediate: 2, advanced: 3 };

const difficultyMatch = (currentLevel, resourceDifficulty) => {
  const studentBand = currentLevel === 0 ? 1 : currentLevel <= 2 ? 1 : currentLevel <= 3.5 ? 2 : 3;
  const gap = Math.abs(studentBand - DIFFICULTY_ORDER[resourceDifficulty]);
  return gap === 0 ? 1.0 : gap === 1 ? 0.7 : 0.4;
};

export const getRecommendations = async (gaps = [], limit = 12) => {
  if (!gaps.length) return [];

  const skillNames = gaps.map((g) => g.skill);

  const resources = await LearningResource.find({
    isActive: true,
    skillNames: { $in: skillNames },
  }).lean();

  const priorityMap = new Map(gaps.map((g) => [g.skill, g]));

  const scored = resources.map((r) => {
    const matched = r.skillNames.filter((n) => priorityMap.has(n));

    let best = 0;
    let totalPriority = 0;

    for (const name of matched) {
      const gap = priorityMap.get(name);
      totalPriority += gap.priority;
      best = Math.max(best, gap.priority);
    }

    const coverage = matched.length;
    const currentLevel = matched.length
      ? priorityMap.get(matched[0]).currentLevel
      : 0;

    const score =
      best * 100 +
      (coverage - 1) * 15 +
      difficultyMatch(currentLevel, r.difficulty) * 10 +
      (r.isFree ? 5 : 0);

    return {
      _id: r._id,
      title: r.title,
      provider: r.provider,
      url: r.url,
      type: r.type,
      difficulty: r.difficulty,
      durationHours: r.durationHours,
      isFree: r.isFree,
      addressesSkills: matched,
      skillsCovered: coverage,
      relevanceScore: Math.round(score * 100) / 100,
      totalPriority: Math.round(totalPriority * 1000) / 1000,
    };
  });

  return scored
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
};
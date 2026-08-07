import Skill from "../models/Skill.js";

/** Canonical lookup key: lowercase, trimmed, collapsed whitespace */
const normalize = (s) => String(s).toLowerCase().trim().replace(/\s+/g, " ");

/**
 * In-memory alias -> Skill lookup, built once on first use.
 * 412 entries; rebuilding per request would be wasteful.
 */
let aliasMap = null;

export const buildAliasMap = async (force = false) => {
  if (aliasMap && !force) return aliasMap;

  const skills = await Skill.find({}).lean();
  aliasMap = new Map();

  for (const s of skills) {
    aliasMap.set(normalize(s.name), s);
    for (const a of s.aliases) aliasMap.set(normalize(a), s);
  }

  console.log(
    `Skill alias map built: ${aliasMap.size} keys -> ${skills.length} skills`,
  );
  return aliasMap;
};

/**
 * Call after any admin edit to the skill taxonomy.
 *
 * TODO (Phase 6): the admin controller must call this after any
 * create/update/delete on Skill. Until then the cached map goes stale
 * after a taxonomy edit and only refreshes on server restart —
 * meaning newly added skills resolve to null until then.
 */
export const invalidateAliasMap = () => {
  aliasMap = null;
};

/**
 * Resolve a user-typed string to a canonical Skill document.
 * Returns null if unrecognised — the caller decides whether to
 * reject the input or queue it for admin review.
 */
export const resolveSkill = async (input) => {
  const map = await buildAliasMap();
  return map.get(normalize(input)) || null;
};

/**
 * Resolve a batch of skill inputs.
 *   [{ name: "reactjs", proficiency: 4 }, { name: "Blockchain", proficiency: 3 }]
 * ->
 *   { resolved: [{ skillId, name: "React", proficiency: 4 }], unresolved: ["Blockchain"] }
 */
export const resolveSkills = async (inputs) => {
  const map = await buildAliasMap();
  const resolved = [];
  const unresolved = [];
  const seen = new Set(); // dedupe: "react" and "reactjs" collapse to one

  for (const item of inputs) {
    const raw = typeof item === "string" ? item : item.name;
    const proficiency = typeof item === "string" ? 3 : (item.proficiency ?? 3);

    const skill = map.get(normalize(raw));
    if (!skill) {
      unresolved.push(raw);
      continue;
    }
    const key = String(skill._id);
    if (seen.has(key)) continue;
    seen.add(key);

    resolved.push({
      skillId: skill._id,
      name: skill.name, // canonical, not what the user typed
      proficiency: Math.max(1, Math.min(5, Number(proficiency) || 3)),
    });
  }

  return { resolved, unresolved };
};

/** Typeahead search for the profile UI */
export const searchSkills = async (query, limit = 10) => {
  const q = normalize(query);
  if (!q) return [];

  const map = await buildAliasMap();
  const hits = new Map();

  for (const [key, skill] of map.entries()) {
    if (key.startsWith(q) || key.includes(q)) {
      hits.set(String(skill._id), {
        _id: skill._id,
        name: skill.name,
        category: skill.category,
        exact: key === q,
      });
    }
    if (hits.size >= limit * 3) break;
  }

  return [...hits.values()]
    .sort(
      (a, b) =>
        (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
};

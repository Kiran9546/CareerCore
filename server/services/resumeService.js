import Skill from "../models/Skill.js";

const BUCKET_MAP = {
  Programming: "languages",
  Frontend: "interface",
  Mobile: "interface",
  Database: "database",
  Backend: "tools",
  "Data Science": "tools",
  DevOps: "tools",
  Cloud: "tools",
  Security: "tools",
  Testing: "tools",
  Fundamentals: "tools",
  "Soft Skills": null,
};

export const buildTechnicalSkills = async (studentSkills = []) => {
  if (!studentSkills.length) {
    return { languages: "", interface: "", database: "", tools: "" };
  }

  const ids = studentSkills.map((s) => s.skillId).filter(Boolean);
  const skills = await Skill.find({ _id: { $in: ids } })
    .select("name category")
    .lean();
  const categoryMap = new Map(skills.map((s) => [String(s._id), s.category]));

  const buckets = { languages: [], interface: [], database: [], tools: [] };

  for (const s of studentSkills) {
    const category = categoryMap.get(String(s.skillId));
    const bucket = BUCKET_MAP[category];
    if (bucket) buckets[bucket].push(s.name);
  }

  return {
    languages: buckets.languages.join(", "),
    interface: buckets.interface.join(", "),
    database: buckets.database.join(", "),
    tools: buckets.tools.join(", "),
  };
};

/**
 * Split a profile description into resume-style bullets, and always end
 * with the tech stack when there is one.
 *
 * The stack used to appear only when the description was empty, so a project
 * that had both lost its stack entirely — which is the half a recruiter
 * actually scans a project entry for. Capping the description at four
 * bullets leaves room for the stack line inside the five-bullet budget.
 */
export const descriptionToBullets = (description = "", techStack = []) => {
  const stackLine = techStack.length ? `Built using ${techStack.join(", ")}` : null;
  const withStack = (bullets) =>
    stackLine ? [...bullets.slice(0, 4), stackLine] : bullets.slice(0, 5);

  if (!description.trim()) return stackLine ? [stackLine] : [];

  const byLine = description
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (byLine.length > 1) return withStack(byLine);

  const bySentence = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 10);

  return withStack(bySentence.length ? bySentence : [description.trim()]);
};

export const buildProjects = (studentProjects = []) =>
  studentProjects.map((p) => ({
    title: p.title,
    subtitle: "",
    bullets: descriptionToBullets(p.description, p.techStack),
  }));

export const buildCertifications = (certs = []) =>
  certs.map((c) => ({
    name: c.name,
    issuer: c.issuer,
    year: c.issueDate ? new Date(c.issueDate).getFullYear().toString() : "",
  }));

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

/** Split a profile description into resume-style bullets */
export const descriptionToBullets = (description = "", techStack = []) => {
  if (!description.trim()) {
    return techStack.length ? [`Built using ${techStack.join(", ")}`] : [];
  }

  const byLine = description
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (byLine.length > 1) return byLine.slice(0, 5);

  const bySentence = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 10);

  return bySentence.length ? bySentence.slice(0, 5) : [description.trim()];
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

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AptitudeQuestion from "../models/AptitudeQuestion.js";

import Skill from "../models/Skill.js";
import CareerPath from "../models/CareerPath.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readJSON = (file) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf-8"));

/** Canonical lookup key: lowercase, trimmed, collapsed whitespace */
const normalize = (s) => s.toLowerCase().trim().replace(/\s+/g, " ");

const seedAptitudeQuestions = async () => {
  const data = readJSON("aptitudeQuestions.json");

  await AptitudeQuestion.deleteMany({});
  const inserted = await AptitudeQuestion.insertMany(data);

  console.log(`  Questions inserted: ${inserted.length}`);
  const bySection = {};
  for (const q of inserted) bySection[q.section] = (bySection[q.section] || 0) + 1;
  for (const [s, n] of Object.entries(bySection)) {
    console.log(`    ${s.padEnd(14)} ${n}`);
  }

  return inserted;
};

const seedSkills = async () => {
  const data = readJSON("skills.json");

  await Skill.deleteMany({});
  const docs = data.map((s) => ({
    name: s.name,
    normalizedName: normalize(s.name),
    aliases: s.aliases.map(normalize),
    category: s.category,
  }));

  const inserted = await Skill.insertMany(docs);
  console.log(`  Skills inserted: ${inserted.length}`);

  const aliasCount = inserted.reduce((n, s) => n + s.aliases.length, 0);
  console.log(`  Alias lookup keys: ${inserted.length + aliasCount}`);

  return inserted;
};

const seedCareerPaths = async (skills) => {
  const data = readJSON("careerPaths.json");

  // name -> ObjectId lookup
  const skillMap = new Map(skills.map((s) => [s.name, s._id]));

  await CareerPath.deleteMany({});

  const docs = [];
  const missing = [];

  for (const p of data) {
    const requiredSkills = [];
    for (const rs of p.requiredSkills) {
      const id = skillMap.get(rs.skill);
      if (!id) {
        missing.push(`${p.name} -> ${rs.skill}`);
        continue;
      }
      requiredSkills.push({ skillId: id, name: rs.skill, weight: rs.weight });
    }

    docs.push({
      name: p.name,
      code: p.code,
      description: p.description,
      requiredSkills,
      typicalCgpaRange: p.typicalCgpaRange,
      isActive: true,
    });
  }

  // Referential integrity check — a silent miss corrupts every skill vector
  if (missing.length) {
    console.error("\n  BROKEN SKILL REFERENCES:");
    missing.forEach((m) => console.error(`    ${m}`));
    throw new Error(`${missing.length} skill reference(s) not found in taxonomy`);
  }

  const inserted = await CareerPath.insertMany(docs);
  console.log(`  Career paths inserted: ${inserted.length}`);
  inserted.forEach((p) =>
    console.log(`    ${p.code.padEnd(8)} ${p.name.padEnd(24)} ${p.requiredSkills.length} skills`)
  );

  return inserted;
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`\nConnected to database: ${mongoose.connection.name}\n`);

    console.log("Seeding skills...");
    const skills = await seedSkills();

    console.log("\nSeeding career paths...");
    await seedCareerPaths(skills);

    console.log("\nSeeding aptitude questions...");
    await seedAptitudeQuestions();

    console.log("\nSeed complete.\n");
    process.exit(0);
  } catch (err) {
    console.error(`\nSeed failed: ${err.message}\n`);
    process.exit(1);
  }
};

run();
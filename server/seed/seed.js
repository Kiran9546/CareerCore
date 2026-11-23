import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AptitudeQuestion from "../models/AptitudeQuestion.js";
import LearningResource from "../models/LearningResource.js";
import Skill from "../models/Skill.js";
import CareerPath from "../models/CareerPath.js";
import { currentDecision } from "./guard.js";

dotenv.config();

/**
 * Two modes:
 *
 *   npm run seed          Full seed: inserts missing reference records and
 *                         updates existing ones to match the JSON files. Only
 *                         against the declared development database (see
 *                         seed/guard.js), because it overwrites edits that
 *                         administrators made to questions, skills or paths.
 *   npm run seed:missing  Insert-only: adds reference records that do not
 *                         exist yet and leaves every existing record exactly
 *                         as it is. Safe for the first load of a production
 *                         database. Never touches accounts.
 */
const INSERT_ONLY = process.argv.includes("--insert-only");

/** Runs the upserts, or in insert-only mode inserts just the missing records. */
const apply = async (Model, ops) => {
  if (!INSERT_ONLY) return Model.bulkWrite(ops);
  const missing = new Map();
  for (const { updateOne } of ops) {
    const key = JSON.stringify(updateOne.filter);
    if (missing.has(key) || (await Model.exists(updateOne.filter))) continue;
    missing.set(key, { ...updateOne.filter, ...updateOne.update.$set });
  }
  if (missing.size) await Model.insertMany([...missing.values()]);
  return { upsertedCount: missing.size, modifiedCount: 0 };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readJSON = (file) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf-8"));

/** Canonical lookup key: lowercase, trimmed, collapsed whitespace */
const normalize = (s) => s.toLowerCase().trim().replace(/\s+/g, " ");

const seedAptitudeQuestions = async () => {
  const data = readJSON("aptitudeQuestions.json");

  const ops = data.map((q) => ({
    updateOne: {
      filter: { questionText: q.questionText },
      update: { $set: q },
      upsert: true,
    },
  }));

  const result = await apply(AptitudeQuestion, ops);
  const all = await AptitudeQuestion.find({});

  console.log(
    `  Upserted: ${result.upsertedCount} new, ${result.modifiedCount} updated`,
  );
  const bySection = {};
  for (const q of all) bySection[q.section] = (bySection[q.section] || 0) + 1;
  for (const [s, n] of Object.entries(bySection)) {
    console.log(`    ${s.padEnd(14)} ${n}`);
  }

  return all;
};

const seedSkills = async () => {
  const data = readJSON("skills.json");

  const seen = new Map();
  const collisions = [];

  for (const s of data) {
    const keys = [normalize(s.name), ...s.aliases.map(normalize)];
    for (const k of keys) {
      if (seen.has(k) && seen.get(k) !== s.name) {
        collisions.push(
          `"${k}" claimed by both "${seen.get(k)}" and "${s.name}"`,
        );
      }
      seen.set(k, s.name);
    }
  }

  if (collisions.length) {
    console.error("\n  ALIAS COLLISIONS DETECTED:");
    collisions.forEach((c) => console.error(`    ${c}`));
    throw new Error(
      `${collisions.length} alias collision(s) — fix skills.json before seeding`,
    );
  }

  const ops = data.map((s) => ({
    updateOne: {
      filter: { normalizedName: normalize(s.name) },
      update: {
        $set: {
          name: s.name,
          normalizedName: normalize(s.name),
          aliases: s.aliases.map(normalize),
          category: s.category,
        },
      },
      upsert: true,
    },
  }));

  const result = await apply(Skill, ops);

  const jsonNames = new Set(data.map((s) => normalize(s.name)));
  const stale = await Skill.find({
    normalizedName: { $nin: [...jsonNames] },
  }).select("name");

  console.log(
    `  Upserted: ${result.upsertedCount} new, ${result.modifiedCount} updated`,
  );
  console.log(`  Alias lookup keys: ${seen.size} (no collisions)`);

  if (stale.length) {
    console.warn(
      `  WARNING: ${stale.length} skill(s) in DB but not in skills.json:`,
    );
    stale.forEach((s) => console.warn(`    ${s.name}`));
    console.warn(
      `  Not deleted — students may reference them. Remove manually if intended.`,
    );
  }

  return Skill.find({});
};

const seedCareerPaths = async (skills) => {
  const data = readJSON("careerPaths.json");
  const skillMap = new Map(skills.map((s) => [s.name, s._id]));

  const missing = [];
  const ops = [];

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

    ops.push({
      updateOne: {
        filter: { code: p.code },
        update: {
          $set: {
            name: p.name,
            code: p.code,
            description: p.description,
            requiredSkills,
            typicalCgpaRange: p.typicalCgpaRange,
            isActive: true,
          },
        },
        upsert: true,
      },
    });
  }

  if (missing.length) {
    console.error("\n  BROKEN SKILL REFERENCES:");
    missing.forEach((m) => console.error(`    ${m}`));
    throw new Error(
      `${missing.length} skill reference(s) not found in taxonomy`,
    );
  }

  const result = await apply(CareerPath, ops);
  const paths = await CareerPath.find({}).sort("name");

  console.log(
    `  Upserted: ${result.upsertedCount} new, ${result.modifiedCount} updated`,
  );
  paths.forEach((p) =>
    console.log(
      `    ${p.code.padEnd(8)} ${p.name.padEnd(24)} ${p.requiredSkills.length} skills`,
    ),
  );

  return paths;
};
const seedLearningResources = async (skills) => {
  const data = readJSON("learningResources.json");
  const skillMap = new Map(skills.map((s) => [s.name, s._id]));

  const missing = new Set();
  const ops = data.map((r) => {
    const ids = [];
    for (const n of r.skillNames) {
      const id = skillMap.get(n);
      if (id) ids.push(id);
      else missing.add(n);
    }
    return {
      updateOne: {
        filter: { url: r.url },
        update: { $set: { ...r, skillIds: ids, isActive: true } },
        upsert: true,
      },
    };
  });

  const result = await apply(LearningResource, ops);
  console.log(`  Upserted: ${result.upsertedCount} new, ${result.modifiedCount} updated`);

  if (missing.size) {
    console.warn(`  WARNING: unknown skill names referenced: ${[...missing].join(", ")}`);
  }

  const bySkill = await LearningResource.aggregate([
    { $unwind: "$skillNames" },
    { $group: { _id: null, distinct: { $addToSet: "$skillNames" } } },
  ]);
  console.log(`  Covering ${bySkill[0]?.distinct.length || 0} distinct skills`);
};
const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`\nConnected to database: ${mongoose.connection.name}\n`);

    const d = currentDecision(mongoose.connection);
    if (INSERT_ONLY) {
      console.log("Insert-only: missing reference records are added; existing records are left unchanged.\n");
    } else if (!d.allowed) {
      throw new Error(
        `Refusing the full seed against ${d.identity}: ${d.reason}.\n` +
          "  The full seed overwrites existing skills, career paths, questions and learning resources.\n" +
          "  To add only what is missing and change nothing that exists, run: npm run seed:missing\n" +
          `  If this is a development database, declare it in your development .env:\n\n    DEMO_SEED_DATABASE=${d.identity}`,
      );
    }

    console.log("Seeding skills...");
    const skills = await seedSkills();

    console.log("\nSeeding career paths...");
    await seedCareerPaths(skills);

    console.log("\nSeeding aptitude questions...");
    await seedAptitudeQuestions();

    console.log("\nSeeding learning resources...");
    await seedLearningResources(skills);

    console.log("\nSeed complete.\n");
    process.exit(0);
  } catch (err) {
    console.error(`\nSeed failed: ${err.message}\n`);
    process.exit(1);
  }
};

run();

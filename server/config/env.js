/**
 * Checks the environment before the API starts in production, so a missing
 * or unsafe setting stops the deploy with a clear message instead of running
 * half-configured (for example signing logins with the example secret, or
 * rejecting every browser request because CLIENT_URL is unset).
 *
 * Outside production nothing is enforced; development keeps working with the
 * values in server/.env.
 */

const EXAMPLE_SECRETS = new Set(["replace_with_a_long_random_string", "changeme", "secret", "jwt_secret"]);

/** Returns a list of problems; empty when the production settings are usable. */
export const productionEnvProblems = (env) => {
  const problems = [];
  const secret = env.JWT_SECRET || "";
  if (!secret) problems.push("JWT_SECRET is not set.");
  else if (EXAMPLE_SECRETS.has(secret.toLowerCase())) problems.push("JWT_SECRET is still the example value.");
  else if (secret.length < 32) problems.push("JWT_SECRET is shorter than 32 characters.");

  const mongo = env.MONGO_URI || "";
  if (!mongo) problems.push("MONGO_URI is not set.");
  else if (/<user>|<password>|<cluster>/.test(mongo)) problems.push("MONGO_URI is still the example value.");

  const origins = (env.CLIENT_URL || "").split(",").map((o) => o.trim()).filter(Boolean);
  if (!origins.length) {
    problems.push("CLIENT_URL is not set: list the website's https address(es), comma-separated.");
  } else {
    for (const o of origins) {
      if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(o)) problems.push(`CLIENT_URL entry "${o}" is not an https origin.`);
    }
  }

  if (env.DEMO_SEED_DATABASE) {
    problems.push("DEMO_SEED_DATABASE is set: it marks a database for demo seeding and must never be set in production.");
  }
  return problems;
};

/** Exits the process when running in production with unusable settings. */
export const checkProductionEnv = (env = process.env) => {
  if (env.NODE_ENV !== "production") return;
  const problems = productionEnvProblems(env);
  if (!problems.length) return;
  console.error("CareerCore API: refusing to start with this production configuration:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
};

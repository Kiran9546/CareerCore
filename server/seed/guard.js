/**
 * Keeps demo seeding and clean-up scripts away from real data.
 *
 * Scripts that create demo accounts, reset passwords or delete records
 * (seed:cohort, db:clean) and the full reference seed (which overwrites
 * reference records) only write to a database that has been declared as
 * development, by host and name, in DEMO_SEED_DATABASE:
 *
 *   DEMO_SEED_DATABASE=localhost:27017/careercore_dev
 *
 * Set it only in a development .env, never on a production host. A refused
 * run prints the identity of the database it connected to, so the value can
 * be copied exactly when that database really is a development one.
 *
 * They also refuse outright when NODE_ENV is "production", whatever
 * DEMO_SEED_DATABASE says.
 */

/** "host[:port][,host2...]" from a MongoDB connection string, without credentials. */
export const hostsFromUri = (uri) => {
  const m = String(uri || "").match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i);
  return m ? m[1].toLowerCase() : "";
};

/** What identifies a database for DEMO_SEED_DATABASE: "<hosts>/<database name>". */
export const databaseIdentity = (uri, dbName) => `${hostsFromUri(uri)}/${dbName}`;

/**
 * Whether a script may write demo data to the connected database.
 * Pure, so it can be tested without a database.
 */
export const demoSeedDecision = ({ nodeEnv, declared, uri, dbName }) => {
  const identity = databaseIdentity(uri, dbName);
  if (String(nodeEnv || "").toLowerCase() === "production") {
    return { allowed: false, identity, reason: "NODE_ENV is production" };
  }
  const want = String(declared || "").trim().toLowerCase();
  if (!want) {
    return { allowed: false, identity, reason: "DEMO_SEED_DATABASE is not set" };
  }
  if (!hostsFromUri(uri) || !dbName) {
    return { allowed: false, identity, reason: "the connected database could not be identified" };
  }
  if (want !== identity.toLowerCase()) {
    return { allowed: false, identity, reason: `DEMO_SEED_DATABASE is "${declared}", not this database` };
  }
  return { allowed: true, identity, reason: "declared development database" };
};

/** Decision for the database mongoose is connected to now. */
export const currentDecision = (connection) =>
  demoSeedDecision({
    nodeEnv: process.env.NODE_ENV,
    declared: process.env.DEMO_SEED_DATABASE,
    uri: process.env.MONGO_URI,
    dbName: connection.name,
  });

/**
 * Throws unless the connected database is the declared development one.
 * Call it after connecting and before the first write.
 */
export const assertDevelopmentDatabase = (connection, script) => {
  const d = currentDecision(connection);
  if (d.allowed) {
    console.log(`  ${script}: writing to declared development database ${d.identity}`);
    return d;
  }
  throw new Error(
    `Refusing to run ${script} against ${d.identity}: ${d.reason}.\n` +
      "  This script creates demo accounts or deletes records, so it only runs against a database\n" +
      "  declared as development. If (and only if) this is a development database, add this line\n" +
      `  to your development .env and run it again:\n\n    DEMO_SEED_DATABASE=${d.identity}\n`,
  );
};

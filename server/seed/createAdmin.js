import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import { ROLES } from "../config/constants.js";
import { databaseIdentity } from "./guard.js";

/**
 * Creates one administrator account, for the first sign-in on a new
 * database (administrators cannot register themselves).
 *
 * Insert-only: if an account with that email already exists, nothing is
 * changed, not its role, name or password. It never touches other accounts.
 *
 * The details are read from the environment, set in the shell for this one
 * command, so the password is never written to a file:
 *
 *   ADMIN_EMAIL=you@college.edu ADMIN_NAME="Your Name" ADMIN_PASSWORD=... \
 *     MONGO_URI="<connection string>" npm run admin:create
 *
 * The password must be at least 12 characters. Change it after the first
 * sign-in if it was typed somewhere it could be seen.
 */

dotenv.config();

const run = async () => {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const name = String(process.env.ADMIN_NAME || "").trim();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const problems = [];
  if (!/^\S+@\S+\.\S+$/.test(email)) problems.push("ADMIN_EMAIL must be an email address");
  if (!name) problems.push("ADMIN_NAME is required");
  if (password.length < 12) problems.push("ADMIN_PASSWORD must be at least 12 characters");
  if (!process.env.MONGO_URI) problems.push("MONGO_URI is not set");
  if (problems.length) throw new Error(problems.join("; "));

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`\nConnected to ${databaseIdentity(process.env.MONGO_URI, mongoose.connection.name)}`);

  const existing = await User.findOne({ email }).select("_id role");
  if (existing) {
    console.log(`An account for ${email} already exists (role: ${existing.role}). Nothing was changed.\n`);
    return;
  }
  await User.create({ email, name, role: ROLES.ADMIN, passwordHash: password, isVerified: true });
  console.log(`Administrator ${email} created. No other account was changed.\n`);
};

run()
  .then(() => mongoose.disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error(`\nadmin:create failed: ${err.message}\n`);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });

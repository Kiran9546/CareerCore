import "./env.js";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../app.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import { signToken } from "../utils/jwt.js";

/**
 * Test harness: an in-memory MongoDB per test file, the real Express app on
 * an ephemeral port, and small factories. All fixtures are synthetic and live
 * only in the throwaway database.
 */

let mongo;
let server;
let baseUrl;

export const setup = async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: "careercore_test" });
  // Build every unique index up front so duplicate-prevention tests exercise
  // the real constraints rather than racing index creation.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
  });
};

export const teardown = async () => {
  await new Promise((r) => (server ? server.close(r) : r()));
  await mongoose.disconnect();
  await mongo?.stop();
};

/** Wipe every collection between scenarios. */
export const reset = async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
};

let seq = 0;
const next = () => ++seq;

export const createUser = async (role, overrides = {}) => {
  const n = next();
  const user = await User.create({
    email: `${role}${n}@test.local`,
    passwordHash: "Password123!",
    role,
    name: overrides.name || `${role} ${n}`,
    isVerified: true,
    ...(role === "faculty" ? { department: "ISE" } : {}),
    ...overrides,
  });
  return { user, token: signToken(user) };
};

export const createStudent = async (academic = {}, userOverrides = {}) => {
  const { user, token } = await createUser("student", userOverrides);
  const n = next();
  const student = await Student.create({
    userId: user._id,
    usn: academic.usn || `4MT26XX${String(n).padStart(4, "0")}`,
    batch: "2026",
    branch: "CSE",
    cgpa: 8,
    backlogs: 0,
    ...academic,
  });
  return { user, token, student };
};

/** Bulk student creation without per-document hooks (fast for 500 rows). */
export const createStudents = async (rows) => {
  const users = rows.map((r, i) => ({
    _id: new mongoose.Types.ObjectId(),
    email: `bulk${next()}_${i}@test.local`,
    passwordHash: "x",
    role: "student",
    name: r.name || `Student ${i + 1}`,
    isActive: true,
    isVerified: true,
  }));
  await User.collection.insertMany(users.map((u) => ({ ...u, createdAt: new Date(), updatedAt: new Date() })));
  const students = rows.map((r, i) => ({
    _id: new mongoose.Types.ObjectId(),
    userId: users[i]._id,
    usn: r.usn || `4MT26ZZ${String(next()).padStart(5, "0")}`,
    batch: r.batch ?? "2026",
    branch: r.branch,
    cgpa: r.cgpa,
    backlogs: r.backlogs ?? 0,
    skills: [],
    projects: [],
    certifications: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await Student.collection.insertMany(students);
  return students.map((s, i) => ({
    student: s,
    user: users[i],
    token: signToken({ _id: users[i]._id, role: "student", email: users[i].email }),
  }));
};

/** fetch wrapper: api(token).post("/path", body) -> { status, body } */
export const api = (token) => {
  const call = async (method, path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  };
  return {
    get: (p) => call("GET", p),
    post: (p, b = {}) => call("POST", p, b),
    put: (p, b = {}) => call("PUT", p, b),
    patch: (p, b = {}) => call("PATCH", p, b),
    del: (p) => call("DELETE", p),
  };
};

/** Base URL of the running test server, for requests that need raw fetch. */
export const baseUrlForTests = () => baseUrl;

export const days = (n) => new Date(Date.now() + n * 24 * 3600 * 1000);

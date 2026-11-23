import mongoose from "mongoose";

const int = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Connects to MongoDB. Called once on startup from index.js (once per
 * worker in cluster mode).
 *
 * The pool size bounds how many queries one process runs against the
 * database at the same time. The driver default (100) is generous for a
 * single process but multiplies quickly across workers and instances, so it
 * is set explicitly: total connections ≈ MONGO_POOL_SIZE × workers × instances.
 * Keep that under your cluster's connection limit (500 on Atlas M0/M2/M5).
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000, // fail fast if Atlas is unreachable
      maxPoolSize: int(process.env.MONGO_POOL_SIZE, 20),
      minPoolSize: int(process.env.MONGO_MIN_POOL_SIZE, 2),
      // On by default: the unique indexes are what make duplicate
      // registrations and results impossible under concurrent writes. Set
      // MONGO_AUTO_INDEX=false only if indexes are built as a deploy step.
      autoIndex: process.env.MONGO_AUTO_INDEX !== "false",
    });

    console.log(`MongoDB connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
  } catch (err) {
    console.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1); // don't run the API without a database
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error(`MongoDB error: ${err.message}`);
});

export default connectDB;

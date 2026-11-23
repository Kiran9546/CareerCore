import dotenv from "dotenv";
import cluster from "cluster";
import os from "os";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import { checkProductionEnv } from "./config/env.js";
import { startCronJobs, stopCronJobs } from "./jobs/cronTasks.js";
import app from "./app.js";

// Load .env before anything reads process.env
dotenv.config();
// In production, stop here if a required setting is missing or unsafe.
checkProductionEnv();

const PORT = process.env.PORT || 4000;

/**
 * WEB_CONCURRENCY sets how many worker processes share the port. Node runs
 * JavaScript on one core per process, so on a multi-core host this is how a
 * single instance uses all of it. "auto" means one per CPU; unset or 1 runs a
 * single process, as before.
 *
 * Workers are interchangeable because nothing lives in process memory between
 * requests: sessions are stateless JWTs, data is in MongoDB, and scheduled
 * jobs take a database lease so only one worker (or instance) runs each tick.
 */
const workerCount = (() => {
  const v = process.env.WEB_CONCURRENCY;
  if (v === "auto") return os.availableParallelism?.() ?? os.cpus().length;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 1 ? n : 1;
})();

const startPrimary = () => {
  console.log(`CareerCore API: starting ${workerCount} workers`);
  for (let i = 0; i < workerCount; i++) cluster.fork();

  let shuttingDown = false;
  cluster.on("exit", (worker, code, signal) => {
    if (shuttingDown) return;
    console.warn(`Worker ${worker.process.pid} exited (${signal || code}); starting a replacement`);
    cluster.fork();
  });

  const stop = () => {
    shuttingDown = true;
    for (const w of Object.values(cluster.workers)) w?.process.kill("SIGTERM");
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
};

const startServer = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`CareerCore API running on http://localhost:${PORT} (pid ${process.pid})`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });

  // Load balancers (AWS ALB, nginx) keep idle connections open for ~60s. If
  // Node closes them first, the balancer occasionally sends a request down a
  // socket that is already gone and the user sees a 502.
  server.keepAliveTimeout = 65 * 1000;
  server.headersTimeout = 66 * 1000;

  startCronJobs();

  // Graceful shutdown: stop taking new connections, let in-flight requests
  // finish, then close the database. Deploys and autoscaling send SIGTERM;
  // without this, requests in progress at that moment would be cut off.
  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`${signal} received: shutting down`);
    stopCronJobs();
    const force = setTimeout(() => process.exit(1), 15 * 1000);
    force.unref();
    server.close(async () => {
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

if (workerCount > 1 && cluster.isPrimary) {
  startPrimary();
} else {
  startServer();
}

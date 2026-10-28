import dotenv from "dotenv";
import connectDB from "./config/db.js";
import { startCronJobs } from "./jobs/cronTasks.js";
import app from "./app.js";

// Load .env before anything reads process.env
dotenv.config();

const PORT = process.env.PORT || 4000;

// ─── Start ───────────────────────────────────────────────────
const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`CareerCore API running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
  startCronJobs();
};

start();


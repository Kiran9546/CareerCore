import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";
import studentRoutes from "./routes/student.routes.js";
import recruiterRoutes from "./routes/recruiter.routes.js";
import facultyRoutes from "./routes/faculty.routes.js";
import connectDB from "./config/db.js";
import adminRoutes from "./routes/admin.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { startCronJobs } from "./jobs/cronTasks.js";
// Load .env before anything reads process.env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ──────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// ─── Health check ────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "careercore-api",
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes (added in later steps) ───────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/recruiter", recruiterRoutes);
app.use("/api/faculty", facultyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
// ─── 404 handler ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
});

// ─── Global error handler ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
});

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


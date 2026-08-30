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
import placementRoutes from "./routes/placement.routes.js";
import { startCronJobs } from "./jobs/cronTasks.js";
import path from "path";
import { fileURLToPath } from "url";
// Load .env before anything reads process.env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ──────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    // Tag the status so the error handler reports a blocked origin as 403
    // rather than folding it into a generic 500.
    const err = new Error(`Origin not allowed by CORS: ${origin}`);
    err.status = 403;
    cb(err);
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "uploads"))
);

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
app.use("/api/placement", placementRoutes);
// ─── 404 handler ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
});

// ─── Global error handler ────────────────────────────────────
/**
 * Turn one Mongoose validator error into something worth showing a user.
 * The raw `err.message` quotes the rejected value back — for an 800-character
 * limit that means dumping the student's whole paragraph into a toast.
 */
const fieldMessage = (e) => {
  const field = (e.path || "value").split(".").pop();
  const p = e.properties || {};
  switch (e.kind || p.type) {
    case "maxlength":
      return `${field} must be ${p.maxlength} characters or fewer`;
    case "minlength":
      return `${field} must be at least ${p.minlength} characters`;
    case "required":
      return `${field} is required`;
    case "min":
      return `${field} must be at least ${p.min}`;
    case "max":
      return `${field} must be at most ${p.max}`;
    case "enum":
      return `${field} must be one of: ${(p.enumValues || []).join(", ")}`;
    default:
      return `${field} is not valid`;
  }
};

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Bad input is the client's fault, not a server fault. Without this, a value
  // that trips a schema rule — an over-long resume summary, a malformed id —
  // came back as a 500 with the raw Mongoose message shown to the user.
  if (err.name === "ValidationError") {
    const details = Object.values(err.errors || {}).map(fieldMessage);
    return res.status(400).json({
      message: details[0] || "Some fields were rejected",
      errors: details,
    });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ message: `Invalid value for ${err.path}` });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "value";
    return res.status(409).json({ message: `That ${field} is already taken` });
  }

  const status = err.status || 500;
  res.status(status).json({
    message:
      status === 500
        ? "Something went wrong on our end"
        : err.message || "Request failed",
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


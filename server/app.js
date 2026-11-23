import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.routes.js";
import studentRoutes from "./routes/student.routes.js";
import facultyRoutes from "./routes/faculty.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import placementRoutes from "./routes/placement.routes.js";
import resultRoutes from "./routes/results.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import searchRoutes from "./routes/search.routes.js";
import { UPLOAD_ROOT } from "./config/paths.js";
// Load .env before anything reads process.env
dotenv.config();

/**
 * The Express application, without a database connection or a listening
 * port. index.js starts it; the test suite imports it directly against an
 * in-memory database.
 */
const app = express();

// ─── Middleware ──────────────────────────────────────────────
// Behind a load balancer or reverse proxy every request arrives from the
// proxy's address. Trusting the first hop makes req.ip the real client, which
// the rate limiters key on — otherwise one user's failed logins would lock
// out everyone. TRUST_PROXY takes Express's values (a hop count, "loopback",
// a subnet list); production defaults to one hop.
const trustProxy = process.env.TRUST_PROXY || (process.env.NODE_ENV === "production" ? "1" : "");
if (trustProxy) app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());

// CLIENT_URL may list several origins, comma-separated (e.g. the production
// domain plus a staging or white-labelled domain). The local dev-server
// origins are allowed only outside production.
const allowedOrigins = [
  ...(process.env.CLIENT_URL || "").split(",").map((o) => o.trim().replace(/\/$/, "")),
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173", "http://localhost:5174"]),
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
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(UPLOAD_ROOT, { maxAge: "1d" })
);

// ─── Health checks ───────────────────────────────────────────
// /api/health  liveness: the process is up (restart it if this fails).
// /api/ready   readiness: the process can serve traffic, i.e. the database
//              is connected (take it out of the load balancer if this fails).
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "careercore-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/ready", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "unavailable",
    database: ready ? "connected" : "disconnected",
  });
});

// ─── Routes ──────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/faculty", facultyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/placement", placementRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/search", searchRoutes);
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
  // The test suite triggers hundreds of expected 4xx refusals on purpose.
  if (process.env.NODE_ENV !== "test" || !err.status) console.error(err.stack);

  // Bad input is the client's fault, not a server fault. Without this, a value
  // that trips a schema rule — an over-long resume summary, a malformed id —
  // came back as a 500 with the raw Mongoose message shown to the user.
  // A spreadsheet the importer could not read carries its own diagnostics —
  // which sheet, which header row, what it did recognise. Passing those
  // through turns a dead-end error into something the uploader can act on.
  if (err.detected) {
    return res.status(err.status || 400).json({
      message: err.message,
      detected: err.detected,
    });
  }

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

export default app;

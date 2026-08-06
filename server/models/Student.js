import mongoose from "mongoose";
import { PRS_HISTORY_CAP, MAX_SKILL_PROFICIENCY } from "../config/constants.js";

/**
 * Student profile — the primary data source for PRS computation.
 *
 * MongoDB modelling principle applied here:
 *   EMBED   what is bounded and always read together
 *           (skills, projects, certifications — read on every dashboard load)
 *   REFERENCE what is shared or unbounded
 *           (skillId -> Skill, careerInterest -> CareerPath)
 *
 * Blueprint reference: Section 4.2
 */

// ─── Sub-schemas (embedded, no separate _id needed) ──────────

const studentSkillSchema = new mongoose.Schema(
  {
    skillId: { type: mongoose.Schema.Types.ObjectId, ref: "Skill", required: true },
    name: { type: String, required: true },   // denormalized — avoids populate on every render
    proficiency: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_SKILL_PROFICIENCY,
    },
    verifiedByGithub: { type: Boolean, default: false },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, maxlength: 1000 },
    techStack: { type: [String], default: [] },   // used for P relevance (Blueprint 5.1)
    githubUrl: String,
    liveUrl: String,
  },
  { timestamps: true }
);

const certificationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    issuer: { type: String, required: true, trim: true },
    issueDate: Date,
    expiryDate: Date,
    credentialUrl: String,
  },
  { timestamps: true }
);

const prsSnapshotSchema = new mongoose.Schema(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    breakdown: {
      academic: Number,
      skills: Number,
      certifications: Number,
      projects: Number,
      aptitude: Number,
    },
    computedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ─── Main schema ─────────────────────────────────────────────

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // ── Academic ──
    usn: { type: String, required: true, unique: true, uppercase: true, trim: true },
    batch: { type: String, required: true },        // "2026"
    branch: { type: String, required: true },       // "ISE"
    cgpa: { type: Number, required: true, min: 0, max: 10 },
    backlogs: { type: Number, default: 0, min: 0 },
    phone: String,

    // ── Profile content ──
    resumeUrl: String,
    githubUsername: String,
    linkedinUrl: String,

    skills: { type: [studentSkillSchema], default: [] },
    projects: { type: [projectSchema], default: [] },
    certifications: { type: [certificationSchema], default: [] },

    careerInterest: { type: mongoose.Schema.Types.ObjectId, ref: "CareerPath" },

    // ── Computed: PRS (Blueprint 5.2) ──
    currentPRS: { type: Number, default: 0, min: 0, max: 100 },
    prsBreakdown: {
      academic: { type: Number, default: 0 },
      skills: { type: Number, default: 0 },
      certifications: { type: Number, default: 0 },
      projects: { type: Number, default: 0 },
      aptitude: { type: Number, default: 0 },
    },
    readinessLevel: { type: String, default: "Not Ready" },
    prsHistory: { type: [prsSnapshotSchema], default: [] },
    lastPrsComputedAt: Date,

    // ── Computed: career prediction (Blueprint 5.5) ──
    predictedCareers: [
      {
        pathId: { type: mongoose.Schema.Types.ObjectId, ref: "CareerPath" },
        name: String,
        confidence: { type: Number, min: 0, max: 1 },
        _id: false,
      },
    ],
    lastPredictionAt: Date,

    profileCompleteness: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────
studentSchema.index({ batch: 1, branch: 1 });      // faculty batch analytics
studentSchema.index({ currentPRS: -1 });           // recruiter ranking, leaderboard
studentSchema.index({ "skills.skillId": 1 });      // candidate search by skill

// ─── Methods ─────────────────────────────────────────────────

/**
 * Append a PRS snapshot, capped to prevent unbounded document growth.
 * MongoDB documents have a hard 16 MB limit.
 */
studentSchema.methods.pushPrsSnapshot = function (score, breakdown) {
  this.prsHistory.push({ score, breakdown, computedAt: new Date() });
  if (this.prsHistory.length > PRS_HISTORY_CAP) {
    this.prsHistory = this.prsHistory.slice(-PRS_HISTORY_CAP);
  }
};

/**
 * Rough profile completeness for the dashboard nudge.
 * Not part of PRS — purely a UI prompt.
 */
studentSchema.methods.computeCompleteness = function () {
  const checks = [
    !!this.cgpa,
    !!this.branch && !!this.batch,
    this.skills.length >= 5,
    this.projects.length >= 1,
    this.certifications.length >= 1,
    !!this.resumeUrl,
    !!this.careerInterest,
    !!this.githubUsername,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

export default mongoose.model("Student", studentSchema);
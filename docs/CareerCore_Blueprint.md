# CareerCore — Phase 2 Implementation Blueprint

**Project:** CareerCore: An AI-Powered Placement Intelligent Platform for Student Skill Development and Recruitment Matching
**Institution:** Mangalore Institute of Technology & Engineering, Dept. of Information Science & Engineering
**Team:** Anvitha (4MT23IS015), Divyashri (4MT23IS034), H Kiran Bhat (4MT23IS039), Nagashruthi (4MT23IS052)
**Guide:** Mr. Narendra U P
**Purpose of this document:** Corrects the inconsistencies identified in the Phase 1 report, fixes all mathematical formulations, and defines a month-by-month execution path to a working system.

---

## Table of Contents

1. [Corrections to Phase 1](#1-corrections-to-phase-1)
2. [Final Technology Stack](#2-final-technology-stack)
3. [System Architecture (Corrected)](#3-system-architecture-corrected)
4. [Database Schema](#4-database-schema)
5. [Mathematical Formulations (Final)](#5-mathematical-formulations-final)
6. [Dataset Strategy](#6-dataset-strategy)
7. [Month-by-Month Execution Plan](#7-month-by-month-execution-plan)
8. [Module Description Table (Corrected)](#8-module-description-table-corrected)
9. [Objectives (Corrected)](#9-objectives-corrected)
10. [Model Evaluation Protocol](#10-model-evaluation-protocol)
11. [Scope Control — What Ships, What Doesn't](#11-scope-control--what-ships-what-doesnt)
12. [Risk Register](#12-risk-register)
13. [Viva Preparation](#13-viva-preparation)

---

## 1. Corrections to Phase 1

Seven issues in the Phase 1 report must be resolved before implementation begins. Each is listed with its location, the problem, and the resolution adopted in this document.

### 1.1 PRS formula contradiction — CRITICAL

| Location | Formula given |
|---|---|
| Section 4.2.3 | `PRS = w₁(A) + w₂(S) + w₃(C) + w₄(P) + w₅(T)` |
| Appendix C.3 | `PRS = w₁(A) + w₂(S) + w₃(C) + w₄(P)` |

The aptitude term **T** is present in Chapter 4 and absent in Appendix C. Section 4.2.3 explicitly lists "Aptitude scores" among the PRS parameters, so the appendix is the error.

**Resolution:** The five-term version is authoritative. Appendix C.3 must be amended in the Phase 2 report. Aptitude is retained because it is the first elimination round in most campus recruitment drives and therefore a genuine readiness signal.

### 1.2 Weights undefined

The symbols `w₁ … w₅` appear with no numeric values, no summation constraint, and no justification. The stated output range of 0–100 does not follow from the formula as written.

**Resolution:** Weights fixed in Section 5.2 with `Σwᵢ = 1`, and every component normalized to `[0, 100]`. Justification table provided for viva defence.

### 1.3 Aptitude test module missing

**T** is a PRS input, but Table D.1 contains no aptitude module and Section 1.5 (Objectives) never mentions aptitude assessment. The score has no origin.

**Resolution:** An Aptitude Assessment Module is added to the module table (Section 8) covering question bank management, timed delivery, and section-wise auto-scoring.

### 1.4 Objectives do not cover Faculty and Admin roles

Section 1.5 lists five objectives, all student-facing. Figure 4.1 shows four user roles including Faculty and Admin, and the Interaction Layer (Section 4.4) states that faculty monitor student performance. Neither role appears in the objectives or in Table D.1.

**Resolution:** Objectives 6 and 7 added (Section 9). Faculty Analytics and System Administration modules added to Table D.1.

### 1.5 Architecture diagram data flow is incorrect

Figure 4.1 shows a strictly linear chain:

```
ML Engine → Database → Notification → External Integrations → Output
```

This misrepresents the system. The database is not downstream of the ML engine — it is a persistence layer accessed by every tier. External integrations (GitHub API) feed *into* preprocessing, not out of the notification system.

**Resolution:** Corrected architecture in Section 3, with the database as a side-attached layer and external integrations feeding the input layer.

### 1.6 "Job APIs (Live Jobs)" is not deliverable

Figure 4.1 lists live job APIs under External Integrations. In practice: LinkedIn's job API is restricted to approved partners, Indeed deprecated public access, and Naukri exposes no open API.

**Resolution:** Recruiter-posted jobs become the sole job source. Live job aggregation is reclassified as future scope. This is already justified by Constraint 3.3 of the Phase 1 report ("Limited availability of real-time industry and placement data").

### 1.7 No dataset source specified

The Gantt chart allocates "Dataset Collection" to Month 3, but the report never identifies what dataset trains the Random Forest classifier. Sections 4.2.1 and C.1 are unimplementable without labelled training data. This is the single largest execution risk in the project.

**Resolution:** Rule-based synthetic data generation, documented as a methodology contribution (Section 6).

### 1.8 Career path skill targets never defined

Section 4.2.2 compares student skills against "industry-required skills," but no structure holds those requirements. Cosine similarity has nothing to compare against.

**Resolution:** A `careerPaths` collection storing weighted skill vectors per career domain (Section 4.3). This is a hard prerequisite for skill gap analysis, the PRS skill component, and career prediction labels.

---

## 2. Final Technology Stack

Section 4.3 of the Phase 1 report lists "Node.js / Flask" and "Python – Machine learning implementation" as separate tools. The hybrid architecture below is therefore already sanctioned by the approved Phase 1 document and requires no deviation justification.

### 2.1 Stack Table

| Layer | Technology | Justification |
|---|---|---|
| Frontend | React.js 18 + Vite | Listed in Phase 1 §4.3; component model suits four distinct dashboards |
| Styling | TailwindCSS | Utility-first; built-in dark mode via `dark:` variant |
| Charts | Recharts | React-native charting for PRS gauges, skill bars, batch analytics |
| Application Backend | Node.js + Express | Listed in Phase 1 §4.3; handles auth, CRUD, business logic |
| ML Service | Python + Flask | Listed in Phase 1 §4.3; hosts scikit-learn models |
| Database | MongoDB Atlas | Listed in Phase 1 §4.3; flexible schema suits evolving student profiles |
| ODM | Mongoose | Schema validation and population |
| Authentication | JWT (`jsonwebtoken`) + `bcryptjs` | Listed in Phase 1 §4.3; role claims embedded in token |
| ML Library | scikit-learn | Listed in Phase 1 §4.3; Random Forest, cosine similarity, metrics |
| Data Processing | Pandas, NumPy | Listed in Phase 1 §4.3 |
| Model Persistence | joblib | Serializes trained pipeline to `.joblib` |
| File Upload | Multer + Cloudinary | Resume storage |
| Resume Parsing | pdf-parse (Node) | Text extraction for ATS scoring |
| Email | Nodemailer + SMTP | Listed in Phase 1 §4.3 |
| Scheduling | node-cron | Low-PRS alerts, weekly reminders |
| External API | GitHub REST API | Listed in Phase 1 §4.3; project validation |
| PDF Reports | pdfkit | Faculty report export |
| Containerization | Docker Compose | Reproducible dev environment across four team machines |
| Deployment | Render (Node + Flask), Vercel (React), MongoDB Atlas | Free tiers sufficient for demonstration |

### 2.2 Why Two Runtimes

Random Forest, cosine similarity, and model evaluation metrics have no mature Node.js equivalent to scikit-learn. The available package `ml-random-forest` provides `predict()` but weak probability estimates, no `feature_importances_`, and no classification report — which would gut the model evaluation section of the Phase 2 report.

The Flask service is deliberately minimal: three endpoints, roughly 250 lines. It is never exposed publicly; Express calls it over an internal network. This is standard microservice separation of concerns and is defensible in a viva.

### 2.3 Repository Structure

```
careercore/
├── docker-compose.yml
├── client/                          # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── student/             # profile, aptitude, dashboard, jobs
│   │   │   ├── recruiter/           # jobs, candidates, shortlist
│   │   │   ├── faculty/             # batch analytics, reports
│   │   │   └── admin/               # users, taxonomy, question bank
│   │   ├── components/              # charts, forms, layout
│   │   ├── context/                 # AuthContext
│   │   └── api/                     # axios instance + interceptors
├── server/                          # Node + Express
│   ├── models/                      # Mongoose schemas
│   ├── routes/                      # auth, student, recruiter, faculty, admin
│   ├── controllers/
│   ├── services/
│   │   ├── prsService.js            # Section 5.2 implementation
│   │   ├── matchingService.js       # Section 5.6 implementation
│   │   ├── mlClient.js              # HTTP bridge to Flask
│   │   ├── recommendationService.js
│   │   └── notificationService.js
│   ├── middleware/                  # auth, requireRole, errorHandler
│   ├── jobs/                        # node-cron tasks
│   └── seed/                        # careerPaths, skills, resources, demo data
└── ml-service/                      # Python + Flask
    ├── app.py                       # 3 endpoints
    ├── models/
    │   ├── career_predictor.py
    │   └── skill_gap.py
    ├── artifacts/
    │   └── career_rf_v1.joblib
    └── notebooks/
        ├── 01_generate_dataset.ipynb
        ├── 02_train_model.ipynb
        └── 03_evaluation.ipynb
```

---

## 3. System Architecture (Corrected)

This replaces Figure 4.1 of the Phase 1 report.

```
┌──────────────────────────────────────────────────────────────────────┐
│                              USERS                                    │
│         Student  │  Recruiter  │  Faculty  │  Admin                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  PRESENTATION LAYER — React.js + Recharts                             │
│  Student Dashboard │ Recruiter Portal │ Faculty Analytics │ Admin     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST / JSON  (JWT in Authorization header)
┌───────────────────────────────▼──────────────────────────────────────┐
│  APPLICATION LAYER — Node.js + Express                                │
│  Auth & RBAC │ Profile CRUD │ Job Mgmt │ PRS Service │ Recommender    │◄──┐
└───────┬───────────────────────┬───────────────────────┬──────────────┘   │
        │                       │                       │                  │
        │ internal HTTP         │                       │ triggers         │
┌───────▼──────────────┐        │            ┌──────────▼──────────────┐   │
│ ML SERVICE (Flask)   │        │            │ NOTIFICATION ENGINE     │   │
│ ┌──────────────────┐ │        │            │ node-cron + Nodemailer  │   │
│ │ Preprocessing    │ │        │            │ Job alerts │ Low-PRS    │   │
│ │ clean│normalize  │ │        │            │ Status updates          │   │
│ │ encode│vectorize │ │        │            └─────────────────────────┘   │
│ ├──────────────────┤ │        │                                          │
│ │ Random Forest    │ │        │            ┌─────────────────────────┐   │
│ │ → career + conf. │ │        │            │ EXTERNAL INTEGRATIONS   │   │
│ ├──────────────────┤ │        │            │ GitHub REST API         │───┘
│ │ Cosine Similarity│ │        │            │ SMTP  │ Cloudinary      │
│ │ → gaps + match % │ │        │            └─────────────────────────┘
│ └──────────────────┘ │        │                (feed INTO app layer)
└───────┬──────────────┘        │
        │                       │
┌───────▼───────────────────────▼──────────────────────────────────────┐
│  PERSISTENCE LAYER — MongoDB Atlas                                    │
│  users │ students │ skills │ careerPaths │ jobs │ applications         │
│  aptitudeQuestions │ attempts │ learningResources │ notifications      │
│  (accessed by Application Layer AND ML Service — not downstream)       │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Key Differences from Figure 4.1

| Figure 4.1 (incorrect) | Corrected |
|---|---|
| Database sits after ML engine in a chain | Database is a shared persistence layer touched by both application and ML layers |
| External integrations come after notifications | External integrations feed into the application layer |
| Notification is a pipeline stage | Notification is an event-driven service triggered by application events |
| Preprocessing is a separate top-level block | Preprocessing lives inside the ML service, where it belongs |

### 3.2 Request Flow Example — Student Views Dashboard

```
1. React → GET /api/student/dashboard        (JWT attached)
2. Express verifies token, extracts role + userId
3. Express reads student document from MongoDB
4. Express → POST http://ml-service:5000/ml/skill-gap
              { studentSkills, targetPathId }
5. Flask vectorizes, computes cosine similarity, ranks gaps
6. Flask → returns { similarity, matchPercent, gaps[] }
7. Express computes PRS using returned skill score (Section 5.2)
8. Express writes prsHistory entry, joins learningResources on gap skills
9. Express → returns composite payload
10. React renders PRS gauge, breakdown radar, gap table, recommendations
```

---

## 4. Database Schema

MongoDB modelling principle applied throughout: **embed what is bounded and read together; reference what is shared or unbounded.**

### 4.1 `users`

```js
{
  _id: ObjectId,
  email: { type: String, unique: true, lowercase: true, required: true },
  passwordHash: String,
  role: { type: String, enum: ['student','recruiter','faculty','admin'] },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },   // recruiters need admin approval
  createdAt: Date
}
```

### 4.2 `students`

```js
{
  _id: ObjectId,
  userId: { type: ObjectId, ref: 'User', unique: true },
  name: String,
  usn: { type: String, unique: true },
  batch: String,                    // "2026"
  branch: String,                   // "ISE"
  cgpa: { type: Number, min: 0, max: 10 },
  backlogs: { type: Number, default: 0 },
  phone: String,
  resumeUrl: String,
  githubUsername: String,

  // EMBEDDED — bounded, always read with the profile
  skills: [{
    skillId: { type: ObjectId, ref: 'Skill' },
    name: String,                   // denormalized: avoids populate on every render
    proficiency: { type: Number, min: 1, max: 5 },
    verifiedByGithub: { type: Boolean, default: false }
  }],
  projects: [{
    title: String,
    description: String,
    techStack: [String],
    githubUrl: String
  }],
  certifications: [{
    name: String,
    issuer: String,
    issueDate: Date,
    credentialUrl: String
  }],

  careerInterest: { type: ObjectId, ref: 'CareerPath' },

  // ML + PRS outputs, cached
  currentPRS: { type: Number, default: 0 },
  prsBreakdown: {
    academic: Number, skills: Number, certifications: Number,
    projects: Number, aptitude: Number
  },
  readinessLevel: String,           // Not Ready | Developing | Placement Ready | Highly Ready
  prsHistory: [{ score: Number, breakdown: Object, computedAt: Date }],

  predictedCareers: [{
    pathId: { type: ObjectId, ref: 'CareerPath' },
    name: String,
    confidence: Number              // 0–1
  }],
  lastPredictionAt: Date
}
```

> `prsHistory` should be capped (keep the most recent 50 entries) to prevent unbounded document growth — MongoDB's 16 MB document limit applies.

### 4.3 `careerPaths` — the target vectors

**This collection does not appear in the Phase 1 report and is the single most important addition.** Without it, cosine similarity has no comparison target, and career prediction has no label space.

```js
{
  _id: ObjectId,
  name: String,                     // "Data Analyst"
  description: String,
  requiredSkills: [{
    skillId: { type: ObjectId, ref: 'Skill' },
    name: String,                   // denormalized
    weight: { type: Number, min: 0, max: 1 }   // importance ω, used in gap ranking
  }],
  typicalCgpaRange: { min: Number, max: Number },
  isActive: Boolean
}
```

**Eight career paths to populate**, each with 15–25 weighted skills:
Software Engineer · Data Analyst · ML Engineer · Web Developer · DevOps Engineer · Cybersecurity Analyst · Cloud Engineer · QA Engineer

Example — Data Analyst:

| Skill | Weight ω |
|---|---|
| SQL | 1.00 |
| Python | 0.90 |
| Excel | 0.85 |
| Statistics | 0.80 |
| Power BI / Tableau | 0.75 |
| Pandas | 0.70 |
| Data Visualization | 0.65 |
| ETL Concepts | 0.50 |
| R | 0.35 |

### 4.4 `skills` — master taxonomy

```js
{
  _id: ObjectId,
  name: String,                     // canonical: "React"
  normalizedName: String,           // lookup key: "react"
  aliases: [String],                // ["reactjs","react.js","react js"]
  category: String                  // Frontend | Backend | Data | DevOps | Cloud | Security | Testing | Soft
}
```

**Normalization is mandatory at insert time.** If "ReactJS" and "React" become separate skill documents, every vector in the system is corrupted and cosine similarity silently produces wrong answers.

### 4.5 `jobs`

```js
{
  _id: ObjectId,
  companyId: { type: ObjectId, ref: 'Company' },
  title: String,
  description: String,
  requiredSkills: [{
    skillId: ObjectId,
    name: String,
    isMandatory: Boolean            // mandatory skills weighted 2× in matching
  }],
  minCgpa: { type: Number, default: 0 },
  maxBacklogs: { type: Number, default: 99 },
  ctc: Number,
  location: String,
  deadline: Date,
  isActive: Boolean,
  createdAt: Date
}
```

### 4.6 `applications`

```js
{
  _id: ObjectId,
  studentId: { type: ObjectId, ref: 'Student' },
  jobId: { type: ObjectId, ref: 'Job' },
  matchPercent: Number,             // frozen at application time
  status: {
    type: String,
    enum: ['applied','shortlisted','interview_scheduled','offered','rejected'],
    default: 'applied'
  },
  statusHistory: [{ status: String, changedAt: Date, note: String }],
  appliedAt: Date
}
```

> The Phase 1 report's recruiter workflow ends at shortlisting. The three additional statuses complete the pipeline — without them, students who are shortlisted see no further progress and the system appears broken during demonstration.

### 4.7 `aptitudeQuestions` and `aptitudeAttempts`

```js
// aptitudeQuestions — authored by admin
{
  _id: ObjectId,
  section: { type: String, enum: ['quantitative','logical','verbal','technical'] },
  questionText: String,
  options: [{ label: String, text: String }],
  correctOption: String,
  difficulty: { type: String, enum: ['easy','medium','hard'] },
  isActive: Boolean
}

// aptitudeAttempts
{
  _id: ObjectId,
  studentId: ObjectId,
  sectionScores: { quantitative: Number, logical: Number, verbal: Number, technical: Number },
  totalScore: Number,               // this is T in the PRS formula
  responses: [{ questionId: ObjectId, selected: String, isCorrect: Boolean }],
  startedAt: Date,
  submittedAt: Date,
  durationSeconds: Number
}
```

### 4.8 `learningResources`

```js
{
  _id: ObjectId,
  title: String,
  provider: String,                 // NPTEL | Coursera | Udemy | freeCodeCamp | YouTube
  url: String,
  type: { type: String, enum: ['course','certification','tutorial','documentation'] },
  skillIds: [ObjectId],             // join target for gap-based recommendation
  difficulty: { type: String, enum: ['beginner','intermediate','advanced'] },
  durationHours: Number,
  isFree: Boolean
}
```

Target: ~200 curated entries. This is manual work and should start early.

### 4.9 `notifications`

```js
{
  _id: ObjectId,
  userId: ObjectId,
  type: { type: String, enum: ['new_job','low_prs','skill_reminder','application_status','recommendation_update'] },
  title: String,
  body: String,
  link: String,
  isRead: { type: Boolean, default: false },
  emailSent: { type: Boolean, default: false },
  createdAt: Date
}
```

### 4.10 Indexes

```js
db.students.createIndex({ userId: 1 }, { unique: true })
db.students.createIndex({ batch: 1, branch: 1 })          // faculty analytics
db.students.createIndex({ currentPRS: -1 })               // recruiter ranking, leaderboard
db.students.createIndex({ "skills.skillId": 1 })          // candidate search
db.skills.createIndex({ normalizedName: 1 }, { unique: true })
db.jobs.createIndex({ isActive: 1, deadline: 1 })
db.applications.createIndex({ studentId: 1, jobId: 1 }, { unique: true })
db.notifications.createIndex({ userId: 1, isRead: 1, createdAt: -1 })
```

---

## 5. Mathematical Formulations (Final)

All formulas below are authoritative and supersede the Phase 1 report where they conflict. Notation from Sections 4.2 and Appendix C of the Phase 1 report is preserved so that Phase 2 code matches Phase 1 documentation.

### 5.1 Component Scores — all normalized to [0, 100]

Normalization is what makes the weighted sum produce a valid 0–100 output. Each component must independently fall in [0, 100].

**Academic Score (A)**

```
A = max(0, (CGPA / 10) × 100 − 5 × B)
```

where `B` = number of active backlogs. The penalty reflects that backlogs disqualify students from most campus drives regardless of CGPA.

**Skill Score (S)** — reuses the cosine similarity of Phase 1 §4.2.2, unifying the two algorithms

```
              V_s · V_t
S = ─────────────────────────── × 100
        ‖V_s‖ × ‖V_t‖
```

where `V_s` is the student skill vector and `V_t` the target career path vector (Section 5.4). Using the same similarity computation for both skill gap analysis and the PRS skill component keeps the system internally consistent and gives one defensible definition of "skill readiness."

**Certification Score (C)**

```
C = (min(n_c, 4) / 4) × 100
```

where `n_c` = certification count. Capped at 4 to prevent gaming through bulk low-value certificates.

**Project Score (P)**

```
P = (min(n_p, 3) / 3) × 60  +  R_tech × 40
```

where `n_p` = project count and `R_tech ∈ [0,1]` is the fraction of the student's combined project tech-stack that appears in the target career path's skill set. The split rewards *relevant* projects rather than project count alone — three unrelated projects score 60, one highly relevant project scores 20 + 40 = 60, and three relevant projects score 100.

**Aptitude Score (T)**

```
T = (Q + L + V + Tech) / 4
```

where Q, L, V, Tech are the quantitative, logical, verbal, and technical section scores, each out of 100, taken from the student's most recent `aptitudeAttempt`. If no attempt exists, `T = 0` and the dashboard must display "Aptitude test not attempted" rather than silently penalizing the student.

### 5.2 Final PRS Formula

Restoring the five-term version from Phase 1 §4.2.3 with weights assigned:

```
PRS = 0.25·A + 0.30·S + 0.10·C + 0.15·P + 0.20·T
```

Validity proof:

```
Σ wᵢ = 0.25 + 0.30 + 0.10 + 0.15 + 0.20 = 1.00

Since Aᵢ ∈ [0,100] for all components and Σwᵢ = 1:
      PRS ∈ [0, 100]   ✔ matches the stated output range in Phase 1 §4.2.3
```

**Weight justification** — required for viva defence:

| Weight | Component | Value | Rationale |
|---|---|---|---|
| w₂ | Skills (S) | 0.30 | Highest weight. Recruiter shortlisting is primarily skill-driven. Supported by Ansarey [2] in the Phase 1 literature survey, which found ~75% of graduates lack essential employability skills. |
| w₁ | Academic (A) | 0.25 | CGPA remains the primary eligibility gate in campus recruitment; nearly all drives impose a CGPA floor. |
| w₅ | Aptitude (T) | 0.20 | The first elimination round in most mass recruiters; a low aptitude score blocks progression regardless of other strengths. |
| w₄ | Projects (P) | 0.15 | Demonstrates applied capability but is harder to verify objectively than the above. |
| w₃ | Certifications (C) | 0.10 | Lowest weight. Certificate quality varies widely and volume is easily inflated. |

### 5.3 Placement Readiness Level

Phase 1 §4.2.3 lists "Placement readiness level" as an output but never defines the bands:

| PRS Range | Level | Interpretation |
|---|---|---|
| 0 – 40 | Not Ready | Significant gaps across multiple dimensions |
| 41 – 60 | Developing | Foundation present; targeted improvement required |
| 61 – 75 | Placement Ready | Meets typical campus drive thresholds |
| 76 – 100 | Highly Ready | Competitive for premium roles |

The **low-PRS notification trigger** fires when `PRS < 50` sustained for 14 days.

### 5.4 Skill Gap Analysis (Phase 1 §4.2.2 / C.2 — formalized)

Phase 1 gives the cosine similarity formula but no method for producing the promised "Required skills list." The vectors must be defined first.

**Vector construction** over the full skill master of dimension `n`:

```
Student vector:   V_s[i] = p_i / 5    if student holds skill i with proficiency p_i ∈ [1,5]
                         = 0          otherwise

Target vector:    V_t[i] = ω_i        importance weight of skill i in the career path
                         = 0          if skill i is not required
```

**Similarity and match percentage:**

```
similarity = (V_s · V_t) / (‖V_s‖ ‖V_t‖)
matchPercent = similarity × 100
```

**Gap set with priority ranking** — this is what makes the output actionable:

```
G = { i : V_t[i] > V_s[i] }

priority(i) = ω_i × (V_t[i] − V_s[i])

Return top-10 skills from G sorted by priority(i) descending
```

Multiplying the deficit by the importance weight `ω_i` is the essential step: a small gap in a critical skill correctly outranks a large gap in a peripheral one. Without this multiplication, the gap list is sorted by raw deficit and produces misleading advice.

**Worked example** — student targeting Data Analyst:

| Skill | ω (target) | Student proficiency | V_s | V_t | Deficit | Priority |
|---|---|---|---|---|---|---|
| SQL | 1.00 | none | 0.00 | 1.00 | 1.00 | **1.00** |
| Python | 0.90 | 4/5 | 0.80 | 0.90 | 0.10 | 0.09 |
| Statistics | 0.80 | none | 0.00 | 0.80 | 0.80 | **0.64** |
| Power BI | 0.75 | 2/5 | 0.40 | 0.75 | 0.35 | 0.26 |
| R | 0.35 | none | 0.00 | 0.35 | 0.35 | 0.12 |

Ranked output: **SQL → Statistics → Power BI → R → Python**. Note that R and Statistics have identical raw deficits (0.35 vs 0.80 differ, but compare R at 0.35 against Power BI at 0.35) — weighting separates them correctly.

### 5.5 Career Prediction & Confidence Score (Phase 1 §4.2.1 / C.1)

**Model:**

```
Prediction = RandomForest(X₁, X₂, …, Xₙ)
```

**Feature vector construction:**

```
X = [ cgpa, backlogs,
      apt_quantitative, apt_logical, apt_verbal, apt_technical,
      num_projects, num_certifications,
      skill_₁, skill_₂, …, skill_ₙ ]      # binary or proficiency/5
```

**Confidence score** — Phase 1 lists this as an output but specifies no method:

```
                                        1     N_trees
Confidence = max P(y = c_j | X) = max ────── ·   Σ   1[h_t(X) = c_j]
              j                    j  N_trees   t=1
```

That is, the proportion of trees voting for the winning class. In scikit-learn: `max(model.predict_proba(X)[0])`.

**Output policy:** return the **top-3 predicted career paths with their confidences**, not a single prediction. Career prediction from a student profile is genuinely uncertain, and presenting three ranked options with honest confidence values is both more useful to the student and more defensible under examination than a single confident-looking answer.

```
Software Engineer   —  0.42
Web Developer       —  0.31
QA Engineer         —  0.14
```

### 5.6 Candidate Matching (Phase 1 §4.2.5 / C.4 — formalized)

Phase 1 states that the system "compares PRS score and skills with job criteria" and "ranks candidates based on matching percentage," but provides no formula.

**Eligibility gate (hard filter):**

```
E = 1[CGPA ≥ CGPA_min] · 1[B ≤ B_max]
```

**Match score:**

```
M = E × ( 0.50·σ_skill + 0.30·(PRS/100) + 0.20·(CGPA/10) ) × 100
```

where `σ_skill` is the weighted skill overlap between student and job:

```
              Σ_{i ∈ matched} μ_i
σ_skill = ────────────────────────────
              Σ_{i ∈ required} μ_i

where μ_i = 2 if skill i is mandatory, 1 otherwise
```

Multiplying by the eligibility gate `E` means ineligible candidates score exactly 0 and never surface in recruiter results — cleaner than applying a separate filter, and it makes the ineligibility explicit in the score itself.

**The same function serves both directions:** student-facing job recommendations and recruiter-facing candidate ranking. Implement once in `services/matchingService.js` and call it from both routes.

### 5.7 Recommendation Generation (Phase 1 §4.2.4)

Rule-based content filtering, consistent with Phase 1 §4.3 which lists "Rule-Based Recommendation System" as the technique:

```
1. Obtain ranked gap set G from Section 5.4
2. For each gap skill i in G (top 10):
       R_i = learningResources WHERE skillIds CONTAINS i
3. Rank R by:  priority(i) × difficultyMatch(student_level, resource_level)
4. Deduplicate by resource _id, return top 15
```

`difficultyMatch` returns 1.0 when the resource difficulty matches the student's current proficiency band, 0.7 for one level away, 0.4 for two.

No machine learning is required here, and none should be claimed. Content-based filtering over a curated resource table produces better recommendations than a collaborative filter trained on a cold-start user base of a few hundred students.

### 5.8 Notification Triggers (Phase 1 §C.5)

| Trigger condition | Notification type | Channel | Schedule |
|---|---|---|---|
| New job posted AND `M > 70` for student | `new_job` | In-app + email | Immediate |
| `PRS < 50` sustained ≥ 14 days | `low_prs` | In-app + email | Weekly cron |
| Top gap skill unchanged ≥ 7 days | `skill_reminder` | In-app | Weekly cron |
| Application status changed | `application_status` | In-app + email | Immediate |
| PRS recomputed with change ≥ 5 points | `recommendation_update` | In-app | On event |


---

## 6. Dataset Strategy

This section fills the gap identified in Correction 1.7. It is the highest-risk item in the project and should be resolved in Month 2, not Month 3 as the Phase 1 Gantt suggests.

### 6.1 The Problem

Training a Random Forest to predict career paths requires labelled data of the form *(student profile → career outcome)*. Such data does not exist publicly at the required granularity, and Constraint 3.3 of the Phase 1 report already acknowledges "limited availability of real-time industry and placement data."

### 6.2 Chosen Approach — Rule-Based Synthetic Generation

Generate approximately 5,000 labelled profiles from career archetype distributions, and document the generation methodology as an explicit part of the project's contribution.

**Generation procedure:**

1. **Define 8 archetypes** matching the `careerPaths` collection (Section 4.3).

2. **For each archetype, specify:**
   - A skill probability distribution — e.g. a Data Analyst profile draws SQL with `p = 0.92`, Python with `p = 0.85`, Kubernetes with `p = 0.04`
   - CGPA distribution — `N(μ, σ)` truncated to [5.0, 10.0], with archetype-specific μ
   - Aptitude section distributions — e.g. ML Engineer archetypes skew higher on quantitative
   - Project and certification count distributions

3. **Inject deliberate ambiguity.** Sample ~15% of profiles from blended distributions across two adjacent archetypes (Software Engineer / Web Developer, ML Engineer / Data Analyst). A cleanly separable synthetic dataset yields 99% test accuracy, which no examiner will find credible and which will not generalize.

4. **Include realistic edge cases:**
   - High CGPA, low skill count (theory-strong, practice-weak)
   - Low CGPA, high project count (self-taught, academically weak)
   - High certification count, low proficiency (certificate collectors)
   - Sparse profiles (incomplete data — the system must handle these)

5. **Enforce class balance** at roughly 625 profiles per archetype, then verify with a distribution plot for the report.

### 6.3 Why This Is Defensible

| Property | Justification |
|---|---|
| Reproducible | Fixed random seed; the generator script ships with the project |
| Transparent | Every generation rule is documented and inspectable |
| Controllable | Class balance and noise level are explicit parameters |
| Honest | Limitations stated openly in the Phase 2 report |

**Required disclosure statement for the Phase 2 report:**

> The career prediction model is trained on a synthetically generated dataset constructed from documented career archetype distributions. Reported accuracy metrics reflect performance on this synthetic distribution and should not be interpreted as production accuracy. Deployment in an institutional setting would require retraining on historical placement records from the host institution. The synthetic approach was adopted because labelled student-profile-to-placement-outcome data is not publicly available at the required granularity, a constraint identified during Phase 1 requirement analysis.

Stating this plainly is a strength, not a weakness. Overclaiming accuracy on synthetic data is the failure mode examiners look for.

### 6.4 Supplementary Real Data

- **Kaggle Campus Placement Prediction dataset** — small (~215 rows) but useful for validating that the CGPA-to-placement correlation in the synthetic data is realistic
- **Institutional placement records** — if the MITE placement cell can provide anonymized historical data (CGPA, branch, skills, company placed), even 200–300 real records would allow a held-out real-data validation set. This would meaningfully strengthen the Phase 2 report and is worth requesting early through the project guide.

---

## 7. Month-by-Month Execution Plan

Mapped to the six-month Gantt chart in Appendix B of the Phase 1 report. The Phase 1 Gantt shows "Testing & Debugging" spanning all six months, which is padding; the plan below distributes testing realistically alongside development.

### Month 1 — Foundation & Authentication

*Corresponds to Gantt: "Frontend & Backend Development" (start)*

| Task | Detail |
|---|---|
| Environment setup | Docker Compose: Node + Flask + MongoDB + React; shared `.env.example` |
| Repository | Structure per Section 2.3; Git branching convention agreed across the team |
| Mongoose schemas | All collections from Section 4 defined and validated |
| Authentication | Register, login, refresh; bcrypt hashing; JWT with role claim |
| RBAC middleware | `requireRole('student','faculty')` guard applied to every protected route |
| Base UI | Layout shell, routing, four role-specific landing pages, Tailwind theme |

**Deliverable:** All four roles can register, log in, and reach their respective empty dashboards.
**Fulfils:** Objective 1.

### Month 2 — Data Layer, Student Module, Dataset

*Corresponds to Gantt: "Database Integration," "Dataset Collection"*

| Task | Detail |
|---|---|
| Skill taxonomy | Seed ~300 skills with aliases; implement normalization at insert |
| **`careerPaths` seeding** | 8 paths × 15–25 weighted skills. Manual and unglamorous, blocks Months 3–4 |
| Student profile CRUD | Academics, skills with proficiency, projects, certifications, career interest |
| Resume upload | Multer + Cloudinary; PDF-only validation, 5 MB cap |
| **Aptitude module** | Question bank CRUD (admin), timed test delivery, section-wise auto-scoring |
| **Synthetic generator** | Notebook `01_generate_dataset.ipynb`; output 5,000 labelled profiles as CSV |
| `learningResources` | Begin curation; target 200 entries by end of Month 4 |

**Deliverable:** A student can complete a full profile and sit the aptitude test; training dataset exists.
**Fulfils:** Objective 2. Closes Corrections 1.3 and 1.7.

> Two items here gate everything downstream: `careerPaths` seeding and the synthetic generator. If either slips, Months 3 and 4 cannot start. Begin both in week 1 of Month 2.

### Month 3 — Machine Learning Engine

*Corresponds to Gantt: "ML Model Development," "Data Preprocessing"*

| Task | Detail |
|---|---|
| Flask service scaffold | Three endpoints, internal-only, health check |
| Preprocessing pipeline | Cleaning, normalization, categorical encoding, skill vectorization |
| Random Forest training | `n_estimators=300, max_depth=18, class_weight='balanced', random_state=42` |
| Model persistence | `joblib.dump()` → `artifacts/career_rf_v1.joblib` |
| Skill gap endpoint | Vector construction + cosine similarity + weighted gap ranking (Section 5.4) |
| Candidate ranking endpoint | Section 5.6 implementation |
| Express ↔ Flask bridge | `services/mlClient.js` with axios, timeout, and graceful degradation |
| **Evaluation artifacts** | Accuracy, per-class precision/recall/F1, confusion matrix, feature importances |

Training pipeline:

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier

pipe = Pipeline([
    ("scale", StandardScaler()),
    ("clf", RandomForestClassifier(
        n_estimators=300,
        max_depth=18,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    ))
])
pipe.fit(X_train, y_train)
joblib.dump(pipe, "artifacts/career_rf_v1.joblib")
```

**Deliverable:** Trained model returning top-3 predictions with confidence; full evaluation metrics captured for the report.
**Fulfils:** Objective 3.

### Month 4 — PRS Engine & Recommendations

| Task | Detail |
|---|---|
| PRS service | Section 5.2 implemented exactly; all five components |
| Breakdown storage | Store the full component breakdown, never only the total |
| PRS history | Append on every recomputation; cap at 50 entries |
| Recomputation trigger | Fire on any profile mutation and on aptitude submission |
| Readiness level | Band assignment per Section 5.3 |
| Recommendation engine | Gap set → `learningResources` join, ranked per Section 5.7 |
| Student dashboard | PRS gauge, component radar chart, PRS trend line, gap table, recommendations |

```js
// services/prsService.js — canonical implementation
const WEIGHTS = { academic: 0.25, skills: 0.30, certifications: 0.10,
                  projects: 0.15, aptitude: 0.20 };

function computePRS(student, careerPath, skillScoreFromML) {
  const breakdown = {
    academic:       academicScore(student.cgpa, student.backlogs),
    skills:         skillScoreFromML,
    certifications: certScore(student.certifications.length),
    projects:       projectScore(student.projects, careerPath),
    aptitude:       aptitudeScore(student.latestAttempt)
  };
  const total = Object.keys(WEIGHTS)
    .reduce((sum, k) => sum + breakdown[k] * WEIGHTS[k], 0);
  return { total: +total.toFixed(2), breakdown, level: readinessLevel(total) };
}
```

**Deliverable:** Student dashboard shows PRS with breakdown, gaps, and targeted course recommendations.
**Fulfils:** Objective 4. Closes Corrections 1.1 and 1.2.

> Returning only the PRS total wastes the entire formula. "PRS 68.5 — held back by skills at 54/100" is actionable; "68.5" is not.

### Month 5 — Recruiter, Faculty, Admin, Notifications

*Corresponds to Gantt: "Recruiter Matching Module"*

| Task | Detail |
|---|---|
| Recruiter: company profile | Registration, admin verification flow |
| Recruiter: job CRUD | With required skills, eligibility criteria, deadline |
| Recruiter: candidate search | Filters: branch, batch, CGPA range, PRS range, skills |
| Recruiter: ranked results | Section 5.6 match score, sorted descending |
| **Application pipeline** | `applied → shortlisted → interview_scheduled → offered/rejected` |
| Faculty: batch analytics | Aggregation pipeline — mean PRS, distribution histogram, top batch-wide gaps |
| Faculty: student drill-down | Individual profile view, PRS trend, gap detail |
| Faculty: report export | CSV and PDF via pdfkit |
| Admin: user management | Activate/deactivate, verify recruiters |
| Admin: taxonomy management | Skills, career paths, weights, question bank, learning resources |
| Admin: platform analytics | Registration counts, placement funnel, PRS distribution |
| Notification engine | node-cron schedules + Nodemailer, per Section 5.8 |
| GitHub integration | Repo languages → skill auto-verification (`verifiedByGithub` flag) |

Faculty analytics example:

```js
Student.aggregate([
  { $match: { batch: "2026", branch: "ISE" } },
  { $group: {
      _id: "$branch",
      avgPRS:         { $avg: "$currentPRS" },
      placementReady: { $sum: { $cond: [{ $gte: ["$currentPRS", 61] }, 1, 0] } },
      notReady:       { $sum: { $cond: [{ $lt:  ["$currentPRS", 41] }, 1, 0] } },
      total:          { $sum: 1 }
  }}
]);
```

**Deliverable:** All four roles fully functional; notifications firing.
**Fulfils:** Objectives 5, 6, 7. Closes Correction 1.4.

### Month 6 — Integration, Testing, Deployment, Documentation

| Task | Detail |
|---|---|
| Seed data | 100 demo students across 3 batches, 5 companies, 15 jobs, full aptitude bank |
| Unit tests | PRS computation, cosine similarity, match score, eligibility gate |
| Integration tests | Registration → profile → aptitude → PRS → apply → shortlist, end to end |
| Edge case handling | Empty profile, no aptitude attempt, zero skills, ML service unreachable |
| UI polish | Dark mode, mobile responsiveness, loading skeletons, error boundaries |
| Deployment | Render (Node + Flask), Vercel (React), MongoDB Atlas |
| Phase 2 report | Corrected formulas, model evaluation, screenshots, results discussion |
| Demo rehearsal | Scripted walkthrough covering all four roles in under 10 minutes |

**Deliverable:** Deployed, working system with complete documentation.

---

## 8. Module Description Table (Corrected)

Replaces Table D.1 of the Phase 1 report. Three modules are new; they were required by the architecture and formulas but absent from the original table.

| Module Name | Function | Responsibility | Status |
|---|---|---|---|
| User Management Module | Handles registration and login | Maintains secure role-based user access | In Phase 1 |
| Student Profile Module | Stores academic and skill details | Maintains complete student information | In Phase 1 |
| **Aptitude Assessment Module** | **Delivers timed aptitude tests, auto-scores by section** | **Produces the aptitude score T for PRS** | **NEW — Correction 1.3** |
| Data Preprocessing Module | Cleans, normalizes, encodes, vectorizes input | Ensures accurate ML processing | In Phase 1 |
| **Career Path Repository** | **Stores weighted skill vectors per career domain** | **Supplies target vectors for gap analysis and PRS** | **NEW — Correction 1.8** |
| Career Prediction Module | Predicts top-3 career paths via Random Forest | Generates career recommendations with confidence | In Phase 1 |
| Skill Gap Analysis Module | Compares student and target skill vectors | Identifies and ranks missing skills by priority | In Phase 1 |
| PRS Calculation Module | Computes weighted 5-component readiness score | Measures placement preparedness with breakdown | In Phase 1 |
| Recommendation Module | Maps gaps to curated learning resources | Provides targeted improvement paths | In Phase 1 |
| Recruiter Matching Module | Ranks candidates against job criteria | Produces eligibility-gated match scores | In Phase 1 |
| **Application Tracking Module** | **Manages the applied → offered status pipeline** | **Maintains placement progress visibility** | **NEW — completes workflow** |
| **Faculty Analytics Module** | **Aggregates batch-level performance metrics** | **Enables institutional monitoring** | **NEW — Correction 1.4** |
| **System Administration Module** | **Manages users, taxonomy, question bank, resources** | **Maintains platform configuration** | **NEW — Correction 1.4** |
| Notification Module | Sends event-driven alerts and reminders | Provides placement and progress notifications | In Phase 1 |
| Database Module | Stores user and system data | Maintains records and historical trends | In Phase 1 |
| Dashboard Module | Displays analytics and visualizations | Provides role-specific visual insights | In Phase 1 |

---

## 9. Objectives (Corrected)

Objectives 1–5 are reproduced from Phase 1 §1.5 unchanged. Objectives 6 and 7 are added to cover the Faculty and Admin roles that appear in Figure 4.1 but were absent from the original objectives (Correction 1.4).

1. To design and implement a user registration and login system that allows students to securely create accounts and access the platform using their credentials.

2. To collect, store and manage detailed student information including academic performance, technical skills and areas of interest through a structured input system.

3. To analyze the collected student data and evaluate their profile by comparing it with current industry requirements and job market expectations.

4. To provide personalized recommendations such as suitable career paths, relevant courses, certifications, and learning resources based on the analysis.

5. To generate a comprehensive performance score and facilitate matching of student profiles with appropriate job opportunities, helping them understand their eligibility for different roles.

6. **To provide faculty with batch-level analytics and reporting capabilities that enable institutional monitoring of student placement readiness and identification of common skill deficiencies.**

7. **To implement administrative controls for managing platform users, skill taxonomy, career path definitions, aptitude question banks, and learning resources, ensuring the system remains maintainable and adaptable to changing industry requirements.**

---

## 10. Model Evaluation Protocol

The Phase 1 report claims prediction capability but specifies no evaluation methodology. These artifacts must be produced in Month 3 and included in the Phase 2 report — they are the primary evidence that the ML component works.

### 10.1 Required Artifacts

| Artifact | Method | Why examiners ask for it |
|---|---|---|
| Train/test split | 80/20 stratified, `random_state=42` | Demonstrates the model is not evaluated on training data |
| Overall accuracy | `accuracy_score()` | Headline metric |
| Per-class precision, recall, F1 | `classification_report()` | Reveals whether minority archetypes are being ignored |
| Confusion matrix | `confusion_matrix()` + heatmap | Shows *which* careers are confused — expect Software Engineer ↔ Web Developer overlap |
| Feature importances | `model.feature_importances_`, top 15 bar chart | Answers "what actually drives the prediction?" |
| Cross-validation | 5-fold `cross_val_score()`, report mean ± std | Guards against a lucky split |
| Hyperparameter comparison | Table across `n_estimators` and `max_depth` | Justifies the chosen configuration |
| Baseline comparison | Decision Tree and Logistic Regression on identical splits | Justifies choosing Random Forest specifically |

### 10.2 Baseline Comparison Table

This table answers the most likely viva question — *"why Random Forest?"* — with evidence rather than assertion. Populate it in Month 3:

| Model | Accuracy | Macro F1 | Training time | Interpretability |
|---|---|---|---|---|
| Logistic Regression | *(measure)* | *(measure)* | *(measure)* | High |
| Decision Tree | *(measure)* | *(measure)* | *(measure)* | High |
| **Random Forest** | *(measure)* | *(measure)* | *(measure)* | Medium (feature importances) |

Expected finding: Random Forest outperforms the single Decision Tree by reducing variance through ensemble voting, while retaining feature importance interpretability that a neural approach would lose. It also provides `predict_proba()`, which is what makes the confidence score of Section 5.5 possible — a point worth making explicitly, since Phase 1 requires a confidence output.

### 10.3 Honest Reporting

State clearly in the Phase 2 report:

- Metrics are computed on a synthetic held-out set
- The observed accuracy reflects the separability of the generated archetype distributions
- Real-world performance requires validation against institutional placement records
- The 15% deliberately ambiguous samples set a realistic ceiling on achievable accuracy

An accuracy figure of 84–91% on properly noised synthetic data is far more credible than 99% on clean data, and is easier to defend.

---

## 11. Scope Control — What Ships, What Doesn't

The Phase 1 feature list contains roughly 100 features. Attempting all of them produces a broad, broken system. The tiering below protects the core.

### 11.1 Must Ship — Core Demonstration Path

These constitute the demonstrable system. If time runs short, everything else is sacrificed to protect these.

- JWT authentication with four roles
- Complete student profile management
- Aptitude test with auto-scoring
- **PRS engine with component breakdown** *(the product's core)*
- **Skill gap analysis with priority-ranked output**
- **Career prediction with top-3 and confidence**
- Job posting and application
- Eligibility-gated candidate matching and ranking
- Four functional dashboards with visualizations

### 11.2 Should Ship — Completes the Narrative

- Course and certification recommendations
- Application status pipeline through to offer
- Faculty batch analytics and report export
- Email and in-app notifications
- Admin taxonomy and question bank management

### 11.3 Optional — Only If Core Is Stable

- GitHub profile analysis for skill verification *(listed as a core tool in Phase 1 §4.3; prioritize above other optional items)*
- Resume ATS scoring — rule-based: section presence, keyword coverage against job description, length, contact details, action verb density. **No LLM required.**
- PDF report generation for students
- Student leaderboard
- Dark mode

### 11.4 Explicitly Out of Scope — Document in Chapter 5 as Future Work

| Feature | Reason |
|---|---|
| **LinkedIn profile import** | API restricted to approved partners; not buildable |
| **Live job API aggregation** | LinkedIn gated, Indeed deprecated public access, Naukri has no open API (Correction 1.6) |
| Mock interview chatbot | Substantial subproject; requires LLM integration, cost management, and conversation state handling |
| AI-generated interview questions | Same as above |
| Coding profile integration (LeetCode/HackerRank) | No official public APIs; scraping is fragile and terms-violating |
| Real-time industry trend analysis | Requires a live labour market data source that is not freely available |

Declaring these as future scope in Chapter 5 is a normal and expected part of an academic report. Listing them as delivered features and failing to demonstrate them is the outcome to avoid.

### 11.5 Note on LLM Usage

The Phase 1 report specifies classical ML — Random Forest and cosine similarity — and this should remain the case for all scored, evaluated components. PRS and career prediction must stay deterministic and explainable; an LLM cannot produce a confusion matrix or feature importances, and substituting one would remove the entire model evaluation section of the report.

If the team wishes to add an LLM feature after the core is stable, the defensible placements are resume improvement suggestions and interview question generation — both are open-ended text generation tasks where no ground truth exists to evaluate against, which is precisely why classical ML is unsuited to them and an LLM is appropriate. Route any such call server-side with the API key held in environment variables, apply a timeout, and degrade gracefully on failure.

---

## 12. Risk Register

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | `careerPaths` seeding slips | Blocks Months 3–4 entirely | Medium | Start week 1 of Month 2; assign one team member as owner; 8 paths is achievable in 3 days |
| 2 | Synthetic generator produces separable data | Implausible 99% accuracy | High | Enforce 15% blended samples; verify with a t-SNE plot before training |
| 3 | Skill normalization not enforced | All vectors silently corrupted | High | Normalize at insert time in Month 2; write a unit test asserting alias collapse |
| 4 | Flask ↔ Express integration issues | ML features unreachable | Medium | Build the bridge in Month 3 week 1, not week 4; implement graceful degradation |
| 5 | Team of four working in parallel causes merge conflicts | Lost time | Medium | Feature branches; agreed module ownership; daily short sync |
| 6 | Free-tier deployment cold starts | Demo appears broken | Medium | Warm the service before demonstration; have a local fallback ready |
| 7 | Scope creep from the 100-feature list | Nothing finished properly | High | Enforce the tiering in Section 11; review scope at each month boundary |
| 8 | Aptitude question bank not populated | T = 0 for all students, PRS invalid | Medium | Seed 60 questions (15 per section) in Month 2 alongside the module |

**Highest-priority risks are 1, 2, 3, and 7.** All four are avoidable with early action rather than technical difficulty.

---

## 13. Viva Preparation

Anticipated questions and the evidence needed to answer them.

**"How did you decide the PRS weights?"**
Section 5.2 justification table. Skills carries the highest weight because recruiter shortlisting is skill-driven, supported by Ansarey [2] in your own literature survey. Certifications carries the lowest because certificate quality is highly variable. State that the weights are configurable by admin — the formula is the contribution, not the specific constants.

**"Why is your PRS formula different from Phase 1?"**
It is not — it is the Section 4.2.3 five-term version. Appendix C.3 contained a transcription error omitting the aptitude term; this has been corrected and the weights, previously left as symbols, are now assigned and justified.

**"Where did your training data come from?"**
Section 6. Rule-based synthetic generation from documented archetype distributions, adopted because labelled profile-to-outcome data is unavailable — a constraint already recorded in Phase 1 §3.3. The generator is reproducible and ships with the project. State the limitation openly.

**"Why Random Forest and not deep learning?"**
Three reasons: the dataset size (~5,000 samples) does not justify a deep model; `feature_importances_` provides interpretability that a neural network would not; and `predict_proba()` supplies the confidence score required by Phase 1 §4.2.1. Support with the Section 10.2 baseline comparison table.

**"What does cosine similarity actually compare?"**
Section 5.4. The student's proficiency-scaled skill vector against the target career path's importance-weighted vector, both over the same skill master space. Show the worked example — the weighting is what makes the gap ranking correct rather than arbitrary.

**"Your architecture diagram shows database after the ML engine — is that right?"**
No, and Section 3 corrects it. The database is a shared persistence layer accessed by both the application and ML layers, not a pipeline stage. This was identified and fixed during Phase 2 design.

**"How does the system handle a student with an empty profile?"**
Every component score is defined at zero-input. PRS returns a low score with a breakdown identifying which components are missing, and the dashboard displays "Aptitude test not attempted" rather than silently treating the absence as a failed test. Demonstrate this case.

**"Is this a MERN stack project?"**
The application layer is MERN — MongoDB, Express, React, Node. A minimal Flask service hosts the scikit-learn models, because no Node library provides equivalent Random Forest probability estimates or evaluation metrics. Phase 1 §4.3 already lists "Node.js / Flask" and "Python" as separate tools, so this matches the approved design.

---

## 14. Immediate Next Actions

Three items block all downstream work and should begin immediately:

1. **Ratify the corrected PRS formula** with the project guide — five terms, weights summing to 1.00, all components normalized to [0, 100]. Obtain sign-off before any code is written, so that implementation and documentation cannot diverge again.

2. **Seed the `careerPaths` collection** — 8 career paths, each with 15–25 importance-weighted skills. This is manual, tedious, and unavoidable. Skill gap analysis, the PRS skill component, and career prediction labels all depend on it.

3. **Write the synthetic dataset generator** — the Random Forest cannot be trained until this exists, and Month 3 cannot start without it.

None of the three is technically difficult. All three are commonly deferred, and deferring them is the most likely cause of a Month 4 crisis.

---

## Appendix — Formula Quick Reference

```
ACADEMIC       A = max(0, (CGPA/10) × 100 − 5B)

SKILL          S = [ (V_s · V_t) / (‖V_s‖ ‖V_t‖) ] × 100

CERTIFICATION  C = (min(n_c, 4) / 4) × 100

PROJECT        P = (min(n_p, 3)/3) × 60 + R_tech × 40

APTITUDE       T = (Q + L + V + Tech) / 4

─────────────────────────────────────────────────────────────
PRS            PRS = 0.25A + 0.30S + 0.10C + 0.15P + 0.20T
               where Σwᵢ = 1.00  ⟹  PRS ∈ [0, 100]
─────────────────────────────────────────────────────────────

READINESS      0–40 Not Ready │ 41–60 Developing
               61–75 Placement Ready │ 76–100 Highly Ready

SKILL GAP      V_s[i] = pᵢ/5      V_t[i] = ωᵢ
               G = { i : V_t[i] > V_s[i] }
               priority(i) = ωᵢ × (V_t[i] − V_s[i])

CONFIDENCE     Confidence = max_j P(y = c_j | X) = max(predict_proba)

ELIGIBILITY    E = 1[CGPA ≥ CGPA_min] · 1[B ≤ B_max]

MATCH          M = E × (0.50·σ_skill + 0.30·(PRS/100) + 0.20·(CGPA/10)) × 100
               σ_skill = Σ_matched μᵢ / Σ_required μᵢ,   μᵢ = 2 if mandatory else 1
```

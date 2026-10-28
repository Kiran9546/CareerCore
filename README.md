# CareerCore

A placement-management system for a college placement cell. It covers:

- **Placement drives, end to end:** company → drive → eligibility → automatic notifications → student registration → interview rounds → attendance and results → automatic progression → final selection and offers → history and dashboards.
- **Student readiness:** profiles, a Placement Readiness Score (PRS), skill-gap analysis, an aptitude test, a resume builder and learning recommendations.
- **Supporting areas:** faculty department analytics and administration.

| Part | Folder | Stack | Port |
|---|---|---|---|
| Web client | `client/` | React 19, Vite, Tailwind CSS | 5173 |
| API | `server/` | Node.js, Express, MongoDB (Mongoose) | 4000 |
| ML service (optional) | `ml-service/` | Python, Flask, scikit-learn | 5000 |

The architecture is described in [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md), the recruitment workflow in [docs/placement-workflow.md](docs/placement-workflow.md), and the current state of every feature in [docs/PROJECT_FEATURE_AUDIT.md](docs/PROJECT_FEATURE_AUDIT.md).

## Prerequisites

- Node.js 20 or later (developed on 24)
- A MongoDB database: MongoDB Atlas, or `docker compose up -d mongo` for a local one
- Python 3.12, only if you want the ML-backed features

## Setup

### 1. API

```bash
cd server
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Set at least `MONGO_URI` and `JWT_SECRET` in `server/.env`. To generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

On an existing database, run the recruitment-workflow migration once. It is additive and safe to re-run:

```bash
node migrations/placementWorkflow.js            # dry run, changes nothing
node migrations/placementWorkflow.js --apply
```

Then start the API:

```bash
npm run dev
```

### 2. Web client

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to port 4000.

### 3. ML service (optional)

Without it, the app still runs. The PRS is shown as unavailable rather than calculated, and skill-gap features report that analysis is unavailable.

```bash
cd ml-service
python -m venv venv
venv\Scripts\activate             # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
python notebooks/generate_dataset.py
python notebooks/train_model.py    # creates artifacts/career_rf_v1.joblib
python app.py
```

### Sample data (optional)

`npm run seed` loads skills, career paths, aptitude questions and learning resources.

`npm run seed:cohort` creates the demo roster, with placement history for each student. It also **removes every other non-admin account** and that account's records. Run `npm run seed:cohort:dry` first: it lists exactly what would be removed and changes nothing. Both commands write to the database in `MONGO_URI`.

Demo accounts, all with the password `12345678`:

| Email | Role |
|---|---|
| `officer@mite.ac.in` | Placement officer |
| `faculty.ise@mite.ac.in`, `faculty.cse@mite.ac.in`, `faculty.ece@mite.ac.in` | Faculty (ISE, CSE, ECE) |
| `student1@mite.ac.in` … `student6@mite.ac.in` | Students (two each in ISE, CSE, ECE) |

The roster is defined in `server/seed/cohortData.js`.

Admin accounts cannot self-register. Create one directly in the database (a `users` document with `role: "admin"`).

## Environment variables

These are read from `server/.env`. Values are never committed.

| Name | Required | Purpose |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Secret used to sign login tokens |
| `JWT_EXPIRES_IN` | no | Token lifetime (default `7d`) |
| `PORT` | no | API port (default 4000) |
| `NODE_ENV` | no | `development` / `production` |
| `CLIENT_URL` | no | Allowed browser origin (CORS) and the link base in emails |
| `ML_SERVICE_URL` | no | ML service URL (default `http://localhost:5000`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | no | Email copies of notifications; in-app only when unset |
| `DISABLE_CRON` | no | `true` turns off scheduled jobs |

The client reads `VITE_API_URL` at build time (default `/api`). The ML service reads `PORT` (default 5000).

## Testing

```bash
cd server && npm test     # node:test + an in-memory MongoDB; never touches MONGO_URI
cd client && npm run lint
cd client && npm run build
```

The server suite covers the recruitment workflow end to end (including a 500-student scenario), security rules, the migration, and smoke tests for authentication, profiles, admin, faculty, the legacy result pipeline, the export, and the retired areas staying retired. The client has no automated tests.

## Roles

| Role | Created by | Can |
|---|---|---|
| Student | Self-registration | Maintain a profile, take the aptitude test, build a resume, register for drives, see their own results and history |
| Faculty | Self-registration (with department) | See their department's analytics; collect results for recorded drives |
| Placement officer | Self-registration | Run drives, companies, results, offers, statistics |
| Admin | Database | Everything a placement officer can do, plus users, skills, the question bank, and reopening finalized rounds |
| Recruiter | Retired | Existing recruiter accounts can no longer sign in; their records stay in the database |

## Known limitations

- **Officer and faculty self-registration has no approval step.** See `docs/CLEANUP_PLAN.md` (H1). Decide on this before production use.
- **Students can edit their own CGPA and backlogs** on their profile, and drive eligibility reads them (H2).
- **Logout only clears the token in the browser.** A token remains valid until it expires.
- **Docker:** `docker-compose.yml` can start MongoDB only; the other services have no Dockerfiles.
- **ML features without a UI:** career prediction and a few other ML-backed endpoints exist in the API but no page uses them (H4).
- **Recruitment notifications are in-app only.** Email copies apply only to individual notices.

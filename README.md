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

Demo data is for a **development database only**. `npm run seed`, `npm run seed:cohort` and `npm run db:clean` write only to the database named in `DEMO_SEED_DATABASE` (as `<hosts>/<database name>`), and refuse to run at all when `NODE_ENV=production`. Run `npm run seed:cohort:dry` first: it changes nothing, prints the database it reached, and says whether a real run would be allowed. If that database is your development one, put the printed value in `server/.env`.

`npm run seed` loads skills, career paths, aptitude questions and learning resources, and updates existing ones to match the JSON files.

`npm run seed:cohort` creates the demo roster, with placement history for each student. It also **removes every other non-admin account** and that account's records.

`npm run seed:missing` adds reference records that do not exist yet and changes nothing that does; it is the one to use for a new production database. See [DEPLOYMENT.md](DEPLOYMENT.md#4-database-safety).

Demo accounts, all with the password `12345678`:

| Email | Role |
|---|---|
| `officer@mite.ac.in` | Placement officer |
| `faculty.ise@mite.ac.in`, `faculty.cse@mite.ac.in`, `faculty.ece@mite.ac.in` | Faculty (ISE, CSE, ECE) |
| `student1@mite.ac.in` … `student6@mite.ac.in` | Students (two each in ISE, CSE, ECE) |

The roster is defined in `server/seed/cohortData.js`.

Admin accounts cannot self-register. Create one with `npm run admin:create`, passing `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` (12 or more characters) in the shell environment. It only adds an account when that email has none, and never changes an existing one.

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
| `CONTACT_INBOX` | no | Address that receives a copy of each contact-form message (needs SMTP) |
| `DISABLE_CRON` | no | `true` turns off scheduled jobs |
| `WEB_CONCURRENCY` | no | Worker processes per instance: a number, or `auto` for one per CPU core (default 1) |
| `MONGO_POOL_SIZE` | no | MongoDB connections per process (default 20) |
| `TRUST_PROXY` | no | Proxy hops to trust for the client IP; defaults to `1` in production |
| `UPLOAD_DIR` | no | Upload directory; point every instance at the same shared volume when running several |
| `MONGO_AUTO_INDEX` | no | `false` skips index builds at startup (only if indexes are built as a deploy step) |
| `DEMO_SEED_DATABASE` | no | Development only: the one database demo seeding may write to (see Sample data). Must be empty in production. |

`CLIENT_URL` may list several origins, comma-separated.

With `NODE_ENV=production` the API refuses to start if `JWT_SECRET` is missing, still the example value or shorter than 32 characters, if `MONGO_URI` is missing, if `CLIENT_URL` is missing or not https, or if `DEMO_SEED_DATABASE` is set. In production only the `CLIENT_URL` origins are allowed; the localhost dev origins are not.

Templates: `server/.env.example` (development) and `server/.env.production.example` (reference for the hosting dashboard; never commit real values).

The client reads these at build time. They are compiled into public JavaScript, so they must never hold a credential; the build refuses `VITE_` variables that look like one. Templates: `client/.env.example`, `client/.env.production.example`.

| Name | Purpose |
|---|---|
| `VITE_API_URL` | API base URL (default `/api`). Set to `https://<api-host>/api` when the API is on another host. |
| `VITE_SITE_URL` | The site's public https address, such as `https://<your-domain>`. Canonical links, Open Graph and Twitter URLs, structured data, `sitemap.xml` and the sitemap line in `robots.txt` are built from it. Without it they are left out, and the build prints a warning. |
| `VITE_SITE_NOINDEX` | `true` marks every page noindex and skips `sitemap.xml`, for a temporary address before the final domain. |

The ML service reads `PORT` (default 5000).

## Public pages, SEO and hosting

`npm run build` in `client/` does three things: the normal Vite build; a build-time render of the public pages (`/`, `/contact`, `/privacy`, `/terms`, `/login`, `/register` and the 404 page) to static HTML, each with its own title, description, canonical URL, sharing metadata and JSON-LD; and `sitemap.xml`, `robots.txt` and `llms.txt`. Page metadata lives in `client/src/seo/meta.js`; add new public pages there.

The output needs these routing rules, which `client/vercel.json` and `client/deploy/nginx.conf.template` both implement:

- `/privacy` serves `privacy.html` (no `.html` or trailing slash in public URLs; those redirect).
- `/student`, `/faculty`, `/placement-officer` and `/admin` (and everything under them) serve `app.html`, marked noindex.
- Any other unknown path serves `404.html` with a 404 status.
- `/placement_officer/...`, the workspace's old address, redirects with a 301.

With Docker, set `SITE_URL` (build) and `SITE_HOST` (runtime) for the client; see `docker-compose.prod.yml`. When `SITE_HOST` is set, nginx sends other host names (such as `www.`) and plain-http requests to `https://SITE_HOST` with a 301. It expects a TLS-terminating proxy in front that sets `X-Forwarded-Proto`.

**Deploying:** see [DEPLOYMENT.md](DEPLOYMENT.md): the website on Vercel, the API and ML service on Render (`render.yaml`), production database safety, adding the custom domain, and post-deploy checks. After building with your domain, `VITE_SITE_URL=https://<your-domain> npm run check:seo` in `client/` verifies every page's metadata, the sitemap, `robots.txt` and `llms.txt` against it; add `-- --live` once the site is deployed.

## Multiple users and scaling

**Many users at once.** The API is stateless: sessions are signed tokens, all data lives in MongoDB, and concurrent writes are protected by unique indexes and conditional updates (two officers recording the same result, or a student double-clicking Register, cannot create duplicates). In the browser, each tab keeps its own sign-in, so different accounts can be used side by side in one browser. "Keep me signed in" saves the session for new tabs and browser restarts.

**Scaling out.** Because no state lives in the API process, you can run as many copies as needed:

- `WEB_CONCURRENCY=auto` uses every CPU core on one host.
- Running several instances behind a load balancer works without sticky sessions. Scheduled jobs take a lease in MongoDB (`joblocks` collection), so each tick runs on exactly one process and no notification is sent twice.
- Uploaded files go to `UPLOAD_DIR`; share it between instances, or replace it with object storage.
- Health probes: `/api/health` (liveness) and `/api/ready` (readiness, returns 503 until the database is connected).
- On `SIGTERM` the API stops accepting connections, finishes in-flight requests and closes the database, so rolling deploys drop nothing.
- Keep `MONGO_POOL_SIZE × workers × instances` under your MongoDB connection limit.
- Login rate limiting is counted per IP address *and* account, so a whole campus behind one NAT address isn't locked out by one person's typos. The counter is in-memory per process; with many processes the effective limit is proportionally higher.

**Docker.**

```bash
# production-style: built client on :80 behind nginx, API replicas, MongoDB
JWT_SECRET=... docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml up -d --scale server=3
```

## Testing

```bash
cd server && npm test     # node:test + an in-memory MongoDB; never touches MONGO_URI
cd client && npm run lint
cd client && npm run build
```

The server suite covers the recruitment workflow end to end (including a 500-student scenario), security rules, the migration, and smoke tests for authentication, profiles, admin, faculty, the legacy result pipeline, the export, the retired areas staying retired, and multi-user/scaling behaviour (job leases, concurrent users of every role, per-account login limits). The client has no automated tests.

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
- **ML features without a UI:** career prediction and a few other ML-backed endpoints exist in the API but no page uses them (H4).
- **Recruitment notifications are in-app only.** Email copies apply only to individual notices.

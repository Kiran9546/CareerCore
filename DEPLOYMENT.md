# Deploying CareerCore

The chosen setup: the website on **Vercel**, the API (and the optional ML service) on a separate Node.js host such as **Render**, and a **production MongoDB database** kept apart from development. Nothing here is deployed yet, and no domain, API address or operator details are assumed: every value you supply is written as `<like-this>`.

1. [Status: implemented, tested, pending](#1-status-implemented-tested-pending)
2. [How the pieces connect](#2-how-the-pieces-connect)
3. [Development and production settings](#3-development-and-production-settings)
4. [Database safety](#4-database-safety)
5. [Deploy step by step](#5-deploy-step-by-step)
6. [Adding the custom domain later](#6-adding-the-custom-domain-later)
7. [Checks after deployment](#7-checks-after-deployment)
8. [Operator details and Organization structured data](#8-operator-details-and-organization-structured-data)
9. [Appendix: Docker on your own server](#9-appendix-docker-on-your-own-server)

## 1. Status: implemented, tested, pending

**Implemented and tested locally** (on this machine, against throwaway in-memory databases and local stand-in servers, not on Vercel or Render):

| What | How it was tested |
|---|---|
| Domain-dependent output (canonical links, `og:url`, `og:image`, JSON-LD, `sitemap.xml`, the sitemap line in `robots.txt`, absolute `llms.txt` links) comes only from `VITE_SITE_URL`, and is left out while it is empty | Builds with and without it; `npm run check:seo` (151 checks) on a test address; the final build has no sitemap and no canonical links |
| `VITE_SITE_NOINDEX=true` keeps every page out of search results and skips the sitemap | Build plus `check:seo` in that mode (148 checks) |
| Organization structured data appears only when an operator is named in `client/src/config/site.js` | Built with a temporary test name, then reverted; the operator is empty again |
| The build refuses `VITE_*` variables that look like credentials, and the built files contain no database addresses, secrets or keys | Builds with `VITE_MONGO_URI`, `VITE_JWT_SECRET` and a URL with a password were refused; scan of `dist/` |
| Resume photos load from the API host when it is on a different address from the website | Build with a separate `VITE_API_URL`; unit check of the URL logic |
| The API refuses to start in production with a missing or example `JWT_SECRET`, a missing `MONGO_URI`, a non-https or missing `CLIENT_URL`, or `DEMO_SEED_DATABASE` set | Server tests, and a production-mode start of the real API |
| In production the API allows only the origins in `CLIENT_URL` (no localhost), handles the CORS preflight for the `Authorization` header, and logs the forwarded client IP | Production-mode start of the real API on a Render-style port |
| Demo seeding and clean-up refuse any database not declared as development, and always refuse when `NODE_ENV=production`; existing accounts are left untouched | Server tests running the real scripts |
| `npm run seed:missing` adds reference data without changing any existing record; `npm run admin:create` adds one administrator and never changes an existing account | Server tests running the real scripts |
| Existing behaviour is unchanged | 86 functional browser checks, a 442-check SEO audit, 45 server tests, lint |

**Written, but not yet run on the real platform:**

| What | Why it is not verified |
|---|---|
| `render.yaml` (API and ML service Blueprint) | Not deployed. It parses as valid YAML and uses the keys in Render's Blueprint reference, but Render has not validated it. |
| `client/vercel.json` on Vercel | Not deployed. Clean URLs, the workspace rewrite and `404.html` behave as configured on a local stand-in server, not as observed on Vercel. |
| `TRUST_PROXY` on Render | Render's documentation does not say how many proxies sit in front of a service. See 5.6 for how to confirm it. |
| `npm run check:seo -- --live` | Run only against a local HTTPS stand-in. |
| The Docker images, nginx config and Caddy example (appendix) | Docker was not available here. |

**Pending: needs you** (none of this has been done):

- Create the production database.
- Create the Render services, and enter the secrets in Render's dashboard.
- Create the Vercel project, and set its environment variables.
- Load the reference data and create the first administrator in production.
- Choose and connect a custom domain: DNS records, then `VITE_SITE_URL` and `CLIENT_URL`.
- Provide operator details, if they should be published.
- Google Search Console, the Rich Results Test, the Schema Markup Validator and social previews (these need a public URL).
- Testing on real phones and other browsers.

## 2. How the pieces connect

```
Browser ──> Vercel (website: client/)            static pages, built by `npm run build`
   │
   └──────> API host, e.g. Render (server/) ───> production MongoDB
                │
                └──> ML service (ml-service/)     optional; the API keeps working without it
```

- The website calls the API at `VITE_API_URL`; the API accepts browser requests only from the origins in `CLIENT_URL`.
- Sign-in uses a bearer token, not cookies, so the website and the API can be on different hosts.
- Uploaded resume photos are stored by the API under `UPLOAD_DIR` and loaded from the API's address.

## 3. Development and production settings

Every setting with its development and production value. **Production values are entered in the provider dashboards, never in a file in the repository.**

| Setting | Development (your machine) | Production | Where production is set |
|---|---|---|---|
| `NODE_ENV` | `development` | `production` | Render (set by `render.yaml`) |
| `MONGO_URI` | A **development** database | The **production** database | Render, prompted |
| `JWT_SECRET` | Any local value | A random value of 32 characters or more, used nowhere else | Render (generated by `render.yaml`) |
| `CLIENT_URL` | `http://localhost:5173` | The website's https address(es), comma-separated | Render, prompted |
| `ML_SERVICE_URL` | `http://localhost:5000` | The ML service's https address | Render, prompted |
| `DEMO_SEED_DATABASE` | `<hosts>/<dev database name>` (see section 4) | **Empty**. The API refuses to start if it is set. | Not set |
| `UPLOAD_DIR` | Empty (uses `server/uploads`) | A path on a persistent disk (paid Render plans) | Render |
| `SMTP_*`, `CONTACT_INBOX` | Optional | Optional | Render |
| `VITE_API_URL` | Empty (the dev server proxies `/api`) | `https://<api-host>/api` | Vercel, Production environment |
| `VITE_SITE_URL` | Empty | Empty until the final domain is chosen, then `https://<domain>` | Vercel, Production environment |
| `VITE_SITE_NOINDEX` | Empty | `true` while on a temporary address (recommended), removed once the domain is final | Vercel, Production environment |

Templates (all values blank):
- `server/.env.example` for development: copy it to `server/.env`.
- `server/.env.production.example` (reference only).
- `client/.env.example` and `client/.env.production.example`.

**Keeping credentials out of Git and out of the browser:**

- Every `.env` file except the blank `*.example` templates is git-ignored; that rule now covers any name, such as `.env.staging`. No `.env` file has ever been committed to this repository.
- Anything named `VITE_*` is public: it is compiled into the JavaScript browsers download. The build stops if a `VITE_` variable's name or value looks like a credential.
- The website needs no secrets at all. Every secret (database, JWT, SMTP) belongs to the API host.
- Changing `JWT_SECRET` signs everyone out.

## 4. Database safety

**Never run `npm run seed:cohort` or `npm run db:clean` against the production database.** Both are now blocked from doing so in code.

| Command | What it does | When it runs |
|---|---|---|
| `npm run seed:cohort` | Creates demo accounts that all share the password `12345678`, resets roster accounts, **deletes** every other non-admin account and its records | Only against the database declared in `DEMO_SEED_DATABASE`, and never with `NODE_ENV=production` |
| `npm run db:clean` | **Deletes** accounts and records left by tests and demos | Same as above |
| `npm run seed` | Inserts reference data (skills, career paths, aptitude questions, learning resources) and **overwrites** existing ones to match the JSON files | Same as above, because it would overwrite edits administrators made |
| `npm run seed:missing` | Adds reference records that do not exist yet; never changes or deletes anything | Any database; this is how production gets its first reference data |
| `npm run admin:create` | Adds one administrator if that email has no account; never changes an existing account | Any database |
| `npm run seed:cohort:dry`, `db:clean:dry` | Read-only previews; they also say whether a real run would be allowed | Any database |

**Declaring your development database:**

1. Run `npm run seed:cohort:dry` from `server/` with your development `.env`. It prints the database it reached and says whether a real run would be allowed.
2. If that database really is your development one, add the printed value to `server/.env`. It has the form `DEMO_SEED_DATABASE=<hosts>/<database name>`, for example `localhost:27017/careercore_dev`.

The value names a host and a database together, so a production database with the same name on a different cluster is still refused. Use a database for development that is separate from production, ideally a separate cluster.

## 5. Deploy step by step

### 5.1 Production database

1. Create a production MongoDB database (for example on MongoDB Atlas), separate from development. Ideally use a separate cluster or project.
2. Create a database user for the API with read and write access to that database only.
3. Allow network access from your API host. If your host has no fixed outbound addresses, allowing all addresses works but leaves the database protected only by its user name and password. Check the host's documentation before choosing.
4. Keep the connection string out of every file. You will paste it into Render in 5.3.

### 5.2 Vercel project (first, to learn the website's address)

1. In Vercel: **Add New → Project**, and import this repository.
2. Set **Root Directory** to `client`.
3. Use the Vite framework preset, and set the build settings explicitly:

   | Setting | Value |
   |---|---|
   | Build Command | `npm run build`. The pre-render and sitemap steps only run through this script, so do not rely on the preset's default. |
   | Output Directory | `dist` |

4. Environment variables, **Production** environment only:
   - `VITE_SITE_NOINDEX` = `true`, until the final domain exists. This is recommended, because Vercel adds `noindex` automatically only to preview deployments, not to the project's production address.
   - Leave `VITE_SITE_URL` empty.
   - Leave `VITE_API_URL` empty for now; it is set in 5.4.
5. Deploy. Note the production address Vercel gives the project, `https://<project>.vercel.app`.

Preview deployments get no `VITE_API_URL`, so they cannot reach the production API. That is deliberate. Point previews at a separate staging API if you add one later.

### 5.3 API and ML service on Render

1. In Render: **New → Blueprint**, and connect this repository. Render reads `render.yaml` and shows two services: `careercore-api` and `careercore-ml`. Review the preview before creating anything.
2. When Render asks for the values marked `sync: false`:

   | Variable | Value |
   |---|---|
   | `MONGO_URI` | The production connection string from 5.1 |
   | `CLIENT_URL` | `https://<project>.vercel.app` from 5.2 |
   | `ML_SERVICE_URL` | The ML service's address, if known. Otherwise set it after step 3. |

   `JWT_SECRET` is generated by Render.
3. When `careercore-ml` is live, copy its address (`https://<ml-service>.onrender.com`). Set `ML_SERVICE_URL` on `careercore-api` to that address and redeploy the API. Without the ML service, the API keeps working and reports ML features as unavailable.
4. Check that `https://<api-service>.onrender.com/api/ready` returns `{"status":"ready","database":"connected"}`.

**Plan:** `render.yaml` sets the free plan on purpose. Omitting `plan` would create a paid instance without you deciding to. According to Render's documentation, free web services:
- Spin down after 15 minutes without traffic and take about a minute to wake.
- Can be restarted at any time.
- Share 750 free instance hours per workspace per month.
- Cannot have a persistent disk.

For CareerCore that means:
- **Uploaded resume photos are lost on every restart or deploy.**
- Scheduled jobs (deadline reminders, closing registration at the deadline) do not run while the service is asleep.

For real use, move `careercore-api` to a paid instance type. Then uncomment the `disk` block in `render.yaml` and set `UPLOAD_DIR=/var/data/uploads`.

**Region:** `render.yaml` leaves the region at Render's default. Set `region` to the one nearest your database.

### 5.4 Connect the website to the API

1. In Vercel, set `VITE_API_URL` = `https://<api-service>.onrender.com/api` (Production environment).
2. Redeploy, because `VITE_*` values are applied at build time.

### 5.5 Production data: reference data and the first administrator

Run these once, from `server/` on your machine, with the production connection string set **in the shell for that command only**, never in `server/.env`. Your database must accept connections from your machine's address for this step.

Bash:

```
NODE_ENV=production MONGO_URI="<production connection string>" npm run seed:missing

NODE_ENV=production MONGO_URI="<production connection string>" \
  ADMIN_EMAIL="<your email>" ADMIN_NAME="<your name>" ADMIN_PASSWORD="<12+ characters>" \
  npm run admin:create
```

PowerShell:

```
$env:NODE_ENV="production"; $env:MONGO_URI="<production connection string>"
npm run seed:missing
$env:ADMIN_EMAIL="<your email>"; $env:ADMIN_NAME="<your name>"; $env:ADMIN_PASSWORD="<12+ characters>"
npm run admin:create
Remove-Item Env:MONGO_URI, Env:ADMIN_PASSWORD, Env:ADMIN_EMAIL, Env:ADMIN_NAME, Env:NODE_ENV
```

With `NODE_ENV=production` set, the destructive scripts refuse even if you run the wrong command. Both commands print the database they connected to; check it. Your shell history may keep the password, so change it after your first sign-in.

### 5.6 Confirm the deployment

1. Open `https://<project>.vercel.app`, sign in as the administrator, and open a few pages in each workspace.
2. If sign-in fails with a network or CORS error, check that `CLIENT_URL` on Render matches the website's address exactly (https, no trailing slash).
3. **Confirm `TRUST_PROXY`:** in Render's logs for `careercore-api`, find the lines for your own requests. The first field should be your public IP address. If it is an internal address instead, set `TRUST_PROXY=2`, redeploy, and check again. This matters because rate limiting uses that address.
4. Upload a resume photo and check it shows. On the free plan it disappears at the next restart.

## 6. Adding the custom domain later

When the domain is decided:

1. **Website domain.** In Vercel: **Project → Settings → Domains → Add**.
   - Create the DNS records **exactly as the dashboard shows them**. Vercel's documentation says an apex domain uses an `A` record, a subdomain uses a `CNAME`, and each project has its own CNAME value.
   - If you add both `www` and the bare domain, set one to **Redirect to** the other.
   - Vercel issues the TLS certificate once DNS resolves.
2. **Website settings.** In Vercel, set `VITE_SITE_URL` = `https://<domain>` and remove `VITE_SITE_NOINDEX`. Redeploy.
3. **API origin.** On Render, set `CLIENT_URL` = `https://<domain>`. Keep `https://<project>.vercel.app` in the comma-separated list too, if that address should keep working.
4. **API domain (optional).** For example `api.<domain>`:
   - In Render, add it under the API service's custom domains, and create a `CNAME` from that name to `<api-service>.onrender.com`. Render documents that TLS certificates are created automatically.
   - Then update `VITE_API_URL` on Vercel and redeploy.
5. Run the checks in section 7.

## 7. Checks after deployment

From `client/`, using the same address the build used (PowerShell: `$env:VITE_SITE_URL="https://<domain>"` first):

```
VITE_SITE_URL=https://<domain> npm run build
VITE_SITE_URL=https://<domain> npm run check:seo
VITE_SITE_URL=https://<domain> npm run check:seo -- --live
```

**`check:seo`** checks the built files:
- Every public page's title, description, robots, canonical, Open Graph and Twitter tags.
- The JSON-LD: all URLs on your domain, and the Organization entry present only when configured.
- `sitemap.xml`, `robots.txt` and `llms.txt`, and the share image size.
- That no absolute URL points at another host.

**`--live`** reads the deployed site and changes nothing. It checks:
- Each public page returns 200 and is pre-rendered.
- The files `robots.txt`, `sitemap.xml`, `llms.txt`, `og-image.png` and `favicon.ico` are served.
- An unknown path returns 404, and `/student` returns `noindex`.
- These all redirect: http to https, `.html` and trailing-slash forms, `/placement_officer`, and the other `www`/bare host.

It accepts 301 or 308 as permanent redirects; Vercel documents 308 for its clean-URL and trailing-slash redirects.

Then by hand:
1. Google Search Console: add the domain, then submit `https://<domain>/sitemap.xml`.
2. The Rich Results Test and the Schema Markup Validator on the home and privacy pages.
3. A social-preview check of the home page.
4. Lighthouse on the live home, privacy and contact pages.
5. Sign in with each role on a phone and a desktop browser.

## 8. Operator details and Organization structured data

Nothing about the operator is published. In `client/src/config/site.js`, `operator`, `contactEmail` and `postalAddress` are empty, so:
- There is no Organization node in the JSON-LD, and no operator line in the footer.
- The legal pages use neutral wording that points users to their placement cell.
- The postal address is never put in structured data.

If you later want them published, fill in only the fields you can confirm, update `legalUpdated` if the legal wording changes, and redeploy.

## 9. Appendix: Docker on your own server

Not the chosen setup; kept for reference and **not tested** (Docker was not available here). `docker-compose.prod.yml` runs everything on one machine, with the client's nginx serving the site and proxying `/api`.

1. **DNS.** Point an `A` record (and an `AAAA` record only if the server really has IPv6) at the server. Add a `www` `CNAME` to the bare domain if you use one.
2. **`.env` next to the compose file:**

   ```
   JWT_SECRET=<long random string>
   MONGO_URI=<production connection string>
   SITE_URL=https://<domain>
   SITE_HOST=<domain>
   CLIENT_URL=https://<domain>
   CLIENT_BIND=127.0.0.1:8080
   TRUST_PROXY=2
   ```

3. **TLS proxy.** Put one in front, for example Caddy on the host with this Caddyfile (untested):

   ```
   {$SITE_HOST} {
   	reverse_proxy 127.0.0.1:8080
   }
   www.{$SITE_HOST} {
   	redir https://{$SITE_HOST}{uri} permanent
   }
   ```

4. **Start** with `docker compose -f docker-compose.prod.yml up -d --build`.
5. **Production data.** Load reference data and the first administrator with `seed:missing` and `admin:create`, as in 5.5.

The images use `node:20`, which reached end of life in April 2026. Moving them to Node 24, the version tested here, is advisable before using this path.

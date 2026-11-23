/**
 * Runs after `vite build` (see the build script in package.json).
 *
 *   1. Renders each public page to static HTML with its own <head>: title,
 *      description, robots, canonical, Open Graph, Twitter card and JSON-LD.
 *      Search engines and link previews read these without running
 *      JavaScript; the browser then hydrates the same markup.
 *   2. Writes app.html, the empty shell that serves the signed-in workspaces
 *      (noindex), and 404.html for unknown addresses.
 *   3. Writes sitemap.xml, robots.txt and llms.txt.
 *
 * The site's address comes from VITE_SITE_URL. Without it, pages are still
 * pre-rendered but anything that needs an absolute URL is left out, and the
 * build says so.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  APP_PREFIXES,
  APP_SHELL,
  NOT_FOUND,
  PAGES,
  SITE_DESCRIPTION,
  SITE_NAME,
  forSearch,
  headTags,
  indexablePages,
  normalizeSiteUrl,
  parseNoindex,
} from "../src/seo/meta.js";
import { SITE } from "../src/config/site.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const ssrEntry = path.join(root, ".prerender", "entry-server.js");

const siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL);
const noindexAll = parseNoindex(process.env.VITE_SITE_NOINDEX);
const { render } = await import(pathToFileURL(ssrEntry).href);
const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const tagHtml = (t) => {
  const attrs = Object.entries(t.attrs)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");
  if (t.tag === "script") return `<script${attrs} data-seo>${t.text.replace(/</g, "\\u003c")}</script>`;
  return `<${t.tag}${attrs} data-seo />`;
};

const page = (meta, body) => {
  if (!template.includes("<title>CareerCore</title>")) throw new Error("index.html no longer has the expected <title>");
  if (!template.includes('<div id="root"></div>')) throw new Error("index.html no longer has an empty #root");
  const head = headTags(meta, siteUrl).map((t) => `    ${tagHtml(t)}`).join("\n");
  return template
    .replace("<title>CareerCore</title>", `<title>${esc(meta.title)}</title>\n${head}`)
    .replace('<div id="root"></div>', body == null ? '<div id="root"></div>' : `<div id="root" data-prerendered="true">${body}</div>`);
};

const write = (file, html) => {
  fs.writeFileSync(path.join(dist, file), html);
  console.log(`  ${file}`);
};

console.log(`Pre-rendering public pages${siteUrl ? ` for ${siteUrl}` : ""}:`);

// The shell for signed-in workspaces is written first: the pages below
// overwrite index.html with the pre-rendered landing page.
write(
  "app.html",
  page(
    { title: APP_SHELL.title, description: APP_SHELL.description, robots: APP_SHELL.robots, path: null, crumbs: [], type: "WebPage" },
    null,
  ),
);

for (const p of PAGES) write(p.file, page(forSearch(p, noindexAll), await render(p.path)));
write(NOT_FOUND.file, page(forSearch(NOT_FOUND, noindexAll), await render("/this-page-does-not-exist")));

// ── robots.txt ──────────────────────────────────────────────────────────
// Keeps crawlers out of places with nothing public to read. It is not access
// control: the workspaces and API require sign-in regardless.
const robots = [
  "User-agent: *",
  "Allow: /",
  ...APP_PREFIXES.map((p) => `Disallow: ${p}`),
  "Disallow: /placement_officer",
  "Disallow: /api/",
  "Disallow: /uploads/",
  "Disallow: /app.html",
  ...(siteUrl && !noindexAll ? ["", `Sitemap: ${siteUrl}/sitemap.xml`] : []),
  "",
].join("\n");
write("robots.txt", robots);

// ── sitemap.xml ─────────────────────────────────────────────────────────
// Only indexable public pages. <lastmod> only where the page carries a real
// revision date (the legal pages); the rest leave it out rather than guess.
if (siteUrl && !noindexAll) {
  const urls = indexablePages()
    .map((p) => {
      const loc = p.path === "/" ? `${siteUrl}/` : `${siteUrl}${p.path}`;
      return `  <url>\n    <loc>${esc(loc)}</loc>${p.lastmod ? `\n    <lastmod>${p.lastmod}</lastmod>` : ""}\n  </url>`;
    })
    .join("\n");
  write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
} else {
  fs.rmSync(path.join(dist, "sitemap.xml"), { force: true });
}

// ── llms.txt ────────────────────────────────────────────────────────────
// A plain summary for language-model tools (https://llmstxt.org). Everything
// here describes what the software does; nothing about the operator is
// stated unless it is configured in src/config/site.js.
const link = (p) => (siteUrl ? `${siteUrl}${p === "/" ? "/" : p}` : p);
const llms = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE.operator ? `This installation is operated by ${SITE.operator}.` : "CareerCore is used by a college's placement cell together with its students and staff."} The workspaces require sign-in and are not public.

## What it does

- Placement drives: the placement cell publishes a drive with the company, role, CTC, eligibility rules (CGPA, backlogs, branches, batches) and interview rounds. Eligible students are notified and register before the deadline.
- Interview rounds: attendance and results are recorded per round, and students who clear a round move to the next. Selections and offers are recorded at the end, with an audit trail of changes.
- Placement readiness: each student gets a readiness score built from academics, skills, certifications, projects and an aptitude test, with skill-gap analysis against a chosen career path.
- Aptitude test: a timed test drawn from a question bank managed by administrators.
- Results import and export: result sheets from companies can be imported as spreadsheets, and the placement record exported as a workbook.
- Workspaces by role: students see their own records, faculty see their own department, placement officers run drives across departments, and administrators manage accounts, the skill taxonomy and the question bank.

## Public pages

- [Home](${link("/")}): overview of the workspaces, features and how a drive runs
- [Contact](${link("/contact")}): contact form that reaches the administrators of this installation
- [Privacy Policy](${link("/privacy")}): what personal data is stored, who can see it and how to request changes
- [Terms and Conditions](${link("/terms")}): rules for using the service

## Optional

- [Sign in](${link("/login")})
- [Create an account](${link("/register")}): open to students, faculty and placement officers
`;
write("llms.txt", llms);

if (noindexAll) {
  console.warn(
    "\n  VITE_SITE_NOINDEX is on: every page is noindex, nofollow and no sitemap.xml was written.\n" +
      "  Remove it once the site is on its final domain.\n",
  );
}
if (!siteUrl) {
  console.warn(
    "\n  VITE_SITE_URL is not set, so canonical links, og:url, og:image, structured data and\n" +
      "  sitemap.xml were left out. Set it to the site's https address and build again.\n",
  );
}

/**
 * Checks a production build (and optionally the live site) against the site
 * address it is meant for. Run it after setting your real domain:
 *
 *   VITE_SITE_URL=https://your-domain npm run build
 *   VITE_SITE_URL=https://your-domain npm run check:seo
 *   VITE_SITE_URL=https://your-domain npm run check:seo -- --live
 *
 * Without --live it reads dist/ only: every public page's title, description,
 * robots, canonical, Open Graph and Twitter tags, JSON-LD, sitemap.xml,
 * robots.txt and llms.txt, and it flags any absolute URL that points at a
 * host other than the configured one (a leftover placeholder domain, say).
 *
 * With --live it also requests the deployed site and checks status codes and
 * redirects: http to https, the other www/non-www host, .html and trailing
 * slash clean-up, the old /placement_officer address, real 404s, and the
 * noindex header on workspaces. It changes nothing on the server.
 *
 * Exit code 0 when every check passes, 1 otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_PREFIXES, NOT_FOUND, PAGES, SHARE_IMAGE, forSearch, indexablePages, normalizeSiteUrl, parseNoindex } from "../src/seo/meta.js";
import { SITE } from "../src/config/site.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const live = process.argv.includes("--live");
// Same switch the build reads: with it on, every page is expected to be noindex.
const noindexAll = parseNoindex(process.env.VITE_SITE_NOINDEX);

let failures = 0;
let passes = 0;
const ok = (cond, label, detail = "") => {
  if (cond) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`);
  }
};
const warn = (label) => console.log(`  WARN  ${label}`);

let siteUrl;
try {
  siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
if (!siteUrl) {
  console.error("Set VITE_SITE_URL to the site's https address (the same value the build used), then run this again.");
  process.exit(1);
}
if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("dist/ is missing. Run `npm run build` with the same VITE_SITE_URL first.");
  process.exit(1);
}

const read = (f) => fs.readFileSync(path.join(dist, f), "utf8");
const abs = (p) => (p === "/" ? `${siteUrl}/` : `${siteUrl}${p}`);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const headOf = (html) => html.slice(0, html.indexOf("</head>"));
const metas = (head, key, name) =>
  [...head.matchAll(new RegExp(`<meta ${key}="${name.replace(/[:.]/g, "\\$&")}" content="([^"]*)"`, "g"))].map((m) => unesc(m[1]));
const canonicals = (head) => [...head.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => unesc(m[1]));

// Hosts that may legitimately appear in absolute URLs besides the site itself.
const ALLOWED_HOSTS = new Set(["schema.org", "www.sitemaps.org", "llmstxt.org", "www.w3.org"]);
const foreignUrls = (text) =>
  [...text.matchAll(/https?:\/\/[a-z0-9.-]+(:\d+)?/gi)]
    .map((m) => m[0])
    .filter((u) => u.toLowerCase() !== siteUrl && !ALLOWED_HOSTS.has(new URL(u).hostname));

console.log(`Checking dist/ for ${siteUrl}\n`);

// ── Built for this address? ─────────────────────────────────────────────
const homeUrl = metas(headOf(read("index.html")), "property", "og:url")[0];
if (homeUrl !== `${siteUrl}/`) {
  console.log(
    `  FAIL  dist/ was not built for ${siteUrl} (home og:url is ${homeUrl || "missing"}).\n` +
      `        Rebuild with VITE_SITE_URL=${siteUrl} npm run build`,
  );
  process.exit(1);
}

// ── Public pages ────────────────────────────────────────────────────────
const titles = new Set();
const descriptions = new Set();
if (noindexAll) console.log("  VITE_SITE_NOINDEX is on: expecting every page to be noindex and no sitemap.\n");
for (const p of [...PAGES, NOT_FOUND].map((x) => forSearch(x, noindexAll))) {
  const label = p.file;
  const file = path.join(dist, p.file);
  ok(fs.existsSync(file), `${label} exists`);
  if (!fs.existsSync(file)) continue;
  const html = read(p.file);
  const head = headOf(html);
  const title = (head.match(/<title>([^<]*)<\/title>/) || [])[1];
  ok(unesc(title || "") === p.title, `${label} title`, title);
  ok(!titles.has(title), `${label} title is unique`);
  titles.add(title);
  const desc = metas(head, "name", "description");
  ok(desc.length === 1 && desc[0] === p.description, `${label} one meta description matching meta.js`);
  ok(!descriptions.has(desc[0]), `${label} description is unique`);
  descriptions.add(desc[0]);
  ok(metas(head, "name", "robots")[0] === p.robots, `${label} robots is "${p.robots}"`);

  const canon = canonicals(head);
  const indexable = p.robots.startsWith("index");
  if (indexable) ok(canon.length === 1 && canon[0] === abs(p.path), `${label} canonical`, canon.join(", ") || "missing");
  else ok(canon.length === 0, `${label} has no canonical (noindex page)`, canon.join(", "));
  if (p.path) ok(metas(head, "property", "og:url")[0] === abs(p.path), `${label} og:url`);
  ok(metas(head, "property", "og:title")[0] === p.title, `${label} og:title`);
  ok(metas(head, "property", "og:image")[0] === `${siteUrl}${SHARE_IMAGE.path}`, `${label} og:image`);
  ok(metas(head, "name", "twitter:card")[0] === "summary_large_image", `${label} twitter:card`);
  ok(metas(head, "name", "twitter:image")[0] === `${siteUrl}${SHARE_IMAGE.path}`, `${label} twitter:image`);
  ok((html.match(/<h1[\s>]/g) || []).length === 1, `${label} has exactly one <h1>`);
  ok(html.includes('data-prerendered="true"'), `${label} is pre-rendered`);

  const ld = [...head.matchAll(/<script type="application\/ld\+json" data-seo>([\s\S]*?)<\/script>/g)];
  if (p.path) {
    ok(ld.length === 1, `${label} has one JSON-LD block`, String(ld.length));
    if (ld.length === 1) {
      let data = null;
      try {
        data = JSON.parse(ld[0][1]);
      } catch (e) {
        ok(false, `${label} JSON-LD parses`, e.message);
      }
      if (data) {
        const urls = JSON.stringify(data).match(/"(url|item|@id)":"([^"]*)"/g) || [];
        const bad = urls.map((u) => u.split('":"')[1].slice(0, -1)).filter((u) => !u.startsWith(`${siteUrl}/`));
        ok(bad.length === 0, `${label} JSON-LD URLs are on ${siteUrl}`, bad.join(", "));
        const pageNode = data["@graph"].find((n) => n["@id"] === `${abs(p.path)}#webpage`);
        ok(pageNode && pageNode.url === abs(p.path) && pageNode.name === p.title, `${label} JSON-LD page matches canonical and title`);
        const orgs = data["@graph"].filter((n) => n["@type"] === "Organization");
        if (SITE.operator) ok(orgs.length === 1 && orgs[0].name === SITE.operator, `${label} Organization is "${SITE.operator}"`);
        else ok(orgs.length === 0, `${label} has no Organization (no operator set in src/config/site.js)`);
        if (p.crumbs.length) {
          const crumbs = data["@graph"].find((n) => n["@type"] === "BreadcrumbList");
          ok(crumbs && crumbs.itemListElement.length === p.crumbs.length + 1, `${label} BreadcrumbList`);
        }
      }
    }
  } else ok(ld.length === 0, `${label} has no JSON-LD`);
  const foreign = foreignUrls(html);
  ok(foreign.length === 0, `${label} has no absolute URLs to other hosts`, [...new Set(foreign)].join(", "));
}

// ── Workspace shell ─────────────────────────────────────────────────────
{
  const html = read("app.html");
  const head = headOf(html);
  ok(metas(head, "name", "robots")[0] === "noindex, nofollow", "app.html is noindex, nofollow");
  ok(canonicals(head).length === 0, "app.html has no canonical");
  ok(html.includes('<div id="root"></div>'), "app.html has an empty root");
}

// ── Share image ─────────────────────────────────────────────────────────
{
  const png = fs.readFileSync(path.join(dist, SHARE_IMAGE.path.slice(1)));
  const isPng = png.subarray(1, 4).toString() === "PNG";
  ok(isPng && png.readUInt32BE(16) === SHARE_IMAGE.width && png.readUInt32BE(20) === SHARE_IMAGE.height, `og-image.png is ${SHARE_IMAGE.width}x${SHARE_IMAGE.height}`);
}

// ── sitemap.xml ─────────────────────────────────────────────────────────
{
  const ok_ = fs.existsSync(path.join(dist, "sitemap.xml"));
  ok(noindexAll ? !ok_ : ok_, noindexAll ? "no sitemap.xml (noindex build)" : "sitemap.xml exists");
  if (ok_) {
    const xml = read("sitemap.xml");
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => unesc(m[1]));
    const expected = indexablePages().map((p) => abs(p.path));
    ok(JSON.stringify(locs) === JSON.stringify(expected), "sitemap.xml lists exactly the indexable pages", locs.join(", "));
    const lastmods = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]);
    ok(lastmods.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), "sitemap.xml lastmod values are dates");
    ok(foreignUrls(xml).length === 0, "sitemap.xml has no other hosts");
  }
}

// ── robots.txt ──────────────────────────────────────────────────────────
{
  const txt = read("robots.txt");
  if (noindexAll) ok(!/^Sitemap:/m.test(txt), "robots.txt has no sitemap line (noindex build)");
  else ok(txt.includes(`Sitemap: ${siteUrl}/sitemap.xml`), "robots.txt points at the sitemap");
  ok(/^Allow: \/$/m.test(txt), "robots.txt allows the public site");
  for (const p of APP_PREFIXES) ok(txt.includes(`Disallow: ${p}\n`), `robots.txt disallows ${p}`);
  ok(foreignUrls(txt).length === 0, "robots.txt has no other hosts");
}

// ── llms.txt ────────────────────────────────────────────────────────────
{
  const txt = read("llms.txt");
  const links = [...txt.matchAll(/\]\(([^)]*)\)/g)].map((m) => m[1]);
  ok(links.length > 0 && links.every((l) => l.startsWith(`${siteUrl}/`)), "llms.txt links are absolute on the site", links.filter((l) => !l.startsWith(siteUrl)).join(", "));
  ok(foreignUrls(txt).length === 0, "llms.txt has no other hosts", foreignUrls(txt).join(", "));
}

// ── Live site ───────────────────────────────────────────────────────────
if (live) {
  console.log(`\nChecking the live site at ${siteUrl}\n`);
  const host = new URL(siteUrl).host;
  const otherHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const get = async (url) => {
    try {
      return await fetch(url, { redirect: "manual", headers: { "User-Agent": "careercore-check-seo" } });
    } catch (e) {
      return { error: e.cause?.code || e.message };
    }
  };
  const permanent = (r) => r.status === 301 || r.status === 308;
  const expectRedirect = async (from, to, label) => {
    const r = await get(from);
    if (r.error) return ok(false, label, `${from} failed: ${r.error}`);
    const loc = r.headers.get("location") || "";
    const target = loc ? new URL(loc, from).href : "";
    ok(permanent(r) && target === to, label, `${from} gave ${r.status}${target ? ` to ${target}` : ""}, expected 301 or 308 to ${to}`);
  };

  for (const p of PAGES) {
    const r = await get(abs(p.path));
    if (r.error) {
      ok(false, `GET ${p.path}`, r.error);
      continue;
    }
    ok(r.status === 200, `GET ${p.path} is 200`, String(r.status));
    if (r.status === 200) {
      const body = await r.text();
      ok(body.includes(`<title>${p.title.replace(/&/g, "&amp;")}</title>`) || body.includes(`<title>${p.title}</title>`), `GET ${p.path} serves its pre-rendered page`);
    }
  }
  for (const f of ["robots.txt", ...(noindexAll ? [] : ["sitemap.xml"]), "llms.txt", "og-image.png", "favicon.ico"]) {
    const r = await get(`${siteUrl}/${f}`);
    ok(!r.error && r.status === 200, `GET /${f} is 200`, r.error || String(r.status));
  }
  const missing = await get(`${siteUrl}/this-page-does-not-exist-check`);
  ok(!missing.error && missing.status === 404, "unknown path returns 404", missing.error || String(missing.status));
  const ws = await get(`${siteUrl}/student`);
  ok(!ws.error && ws.status === 200, "/student serves the app shell", ws.error || String(ws.status));
  if (!ws.error) ok(/noindex/.test(ws.headers.get("x-robots-tag") || ""), "/student sends X-Robots-Tag noindex");

  await expectRedirect(`http://${host}/`, `${siteUrl}/`, "http redirects to https");
  await expectRedirect(`${siteUrl}/privacy.html`, `${siteUrl}/privacy`, "/privacy.html redirects to /privacy");
  await expectRedirect(`${siteUrl}/privacy/`, `${siteUrl}/privacy`, "/privacy/ redirects to /privacy");
  await expectRedirect(`${siteUrl}/placement_officer/drives`, `${siteUrl}/placement-officer/drives`, "/placement_officer redirects");

  const alt = await get(`https://${otherHost}/`);
  if (alt.error) warn(`https://${otherHost}/ did not respond (${alt.error}). Fine if you do not use that host; otherwise add its DNS record.`);
  else await expectRedirect(`https://${otherHost}/`, `${siteUrl}/`, `${otherHost} redirects to ${host}`);

  const home = await get(`${siteUrl}/`);
  if (!home.error) {
    const hsts = home.headers.get("strict-transport-security");
    if (hsts) passes++;
    else warn("no Strict-Transport-Security header on the home page");
  }
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

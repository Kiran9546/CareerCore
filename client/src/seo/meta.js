/**
 * Search and sharing metadata for every public page.
 *
 * Plain JavaScript with no browser or bundler dependencies: the build script
 * (scripts/prerender.mjs) imports it in Node to write each page's <head>, the
 * sitemap, robots.txt and llms.txt, and the app imports it to keep the <head>
 * in step during client-side navigation. One source, so they cannot drift.
 *
 * The site's own address comes from VITE_SITE_URL (for example
 * https://careercore.example.edu). Until it is set, nothing that needs an
 * absolute URL is emitted: no canonical links, og:url, og:image, structured
 * data or sitemap. A wrong domain would be worse than none.
 */
import { SITE } from "../config/site.js";

export const SITE_NAME = "CareerCore";
export const SITE_TAGLINE = "Campus placement management";
export const SITE_DESCRIPTION =
  "CareerCore is a campus placement management system for students, faculty, placement officers and administrators: drives, eligibility, interview rounds, offers and placement readiness in one place.";

/** Social sharing image, in public/. 1200 × 630, the size Open Graph expects. */
export const SHARE_IMAGE = { path: "/og-image.png", width: 1200, height: 630, alt: "CareerCore, campus placement management" };

/** "https://host" without a trailing slash, or "" when not configured. */
export const normalizeSiteUrl = (value) => {
  const v = String(value || "").trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v)) {
    throw new Error(`VITE_SITE_URL must be an https origin such as https://careercore.example.edu (got "${value}")`);
  }
  return v.toLowerCase();
};

const INDEX = "index, follow";
const NOINDEX = "noindex, follow";

/**
 * VITE_SITE_NOINDEX=true keeps the whole site out of search results, for
 * example while it runs on a temporary address before the final domain is
 * chosen. Every page is then "noindex, nofollow" with no canonical link, and
 * no sitemap is written. robots.txt still allows crawling, because a crawler
 * has to fetch a page to see its noindex.
 */
export const parseNoindex = (value) => /^(1|true|yes)$/i.test(String(value || "").trim());
export const forSearch = (page, noindexAll) => (noindexAll ? { ...page, robots: "noindex, nofollow" } : page);

/**
 * Public pages, in sitemap order. `file` is where the pre-rendered HTML is
 * written. `lastmod` is set only where a real revision date exists; other
 * pages leave it out rather than guess.
 */
export const PAGES = [
  {
    path: "/",
    file: "index.html",
    title: `${SITE_NAME} · Campus placement management for colleges`,
    description:
      "Run campus placement drives in one place: eligibility, registration, interview rounds and offers, with workspaces for students, faculty and placement officers.",
    robots: INDEX,
    type: "WebPage",
    crumbs: [],
  },
  {
    path: "/contact",
    file: "contact.html",
    title: `Contact · ${SITE_NAME}`,
    description:
      "Send a question about your CareerCore account, a placement drive, a result or your data to the administrators of this installation.",
    robots: INDEX,
    type: "ContactPage",
    crumbs: [{ name: "Contact", path: "/contact" }],
  },
  {
    path: "/privacy",
    file: "privacy.html",
    title: `Privacy Policy · ${SITE_NAME}`,
    description:
      "What personal data CareerCore stores to run campus placements, who can see it, how long it is kept, browser storage, and how to ask for a copy, correction or erasure.",
    robots: INDEX,
    type: "WebPage",
    lastmod: SITE.legalUpdated,
    crumbs: [{ name: "Privacy Policy", path: "/privacy" }],
  },
  {
    path: "/terms",
    file: "terms.html",
    title: `Terms and Conditions · ${SITE_NAME}`,
    description:
      "The rules for using CareerCore: accounts, accurate placement information, aptitude tests, how results and readiness scores are recorded, and limits of the service.",
    robots: INDEX,
    type: "WebPage",
    lastmod: SITE.legalUpdated,
    crumbs: [{ name: "Terms and Conditions", path: "/terms" }],
  },
  {
    // Sign-in pages are reachable and pre-rendered, but kept out of search
    // results: they have nothing to read beyond the form.
    path: "/login",
    file: "login.html",
    title: `Sign in · ${SITE_NAME}`,
    description: "Sign in to CareerCore as a student, faculty member, placement officer or administrator.",
    robots: NOINDEX,
    type: "WebPage",
    crumbs: [{ name: "Sign in", path: "/login" }],
  },
  {
    path: "/register",
    file: "register.html",
    title: `Create an account · ${SITE_NAME}`,
    description: "Create a CareerCore account as a student, faculty member or placement officer.",
    robots: NOINDEX,
    type: "WebPage",
    crumbs: [{ name: "Create an account", path: "/register" }],
  },
];

/** Shown for any URL that matches no page. Never indexed. */
export const NOT_FOUND = {
  path: null,
  file: "404.html",
  title: `Page not found · ${SITE_NAME}`,
  description: "The page you were looking for does not exist on CareerCore.",
  robots: "noindex, nofollow",
  type: "WebPage",
  crumbs: [],
};

/** Signed-in workspaces: private, never indexed, never in the sitemap. */
export const APP_PREFIXES = ["/student", "/faculty", "/placement-officer", "/admin"];
export const APP_SHELL = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  robots: "noindex, nofollow",
};

export const isAppPath = (path) => APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
export const pageFor = (path) => PAGES.find((p) => p.path === path) || null;
export const indexablePages = () => PAGES.filter((p) => p.robots === INDEX);

const abs = (siteUrl, path) => (path === "/" ? `${siteUrl}/` : `${siteUrl}${path}`);

/** JSON-LD for a page: the site, the page, and its breadcrumb trail. */
export const structuredData = (page, siteUrl) => {
  if (!siteUrl || !page.path) return null;
  const url = abs(siteUrl, page.path);
  const website = {
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: `${siteUrl}/`,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
  };
  const graph = [website];
  // An Organization is described only when the operator has been named in
  // config/site.js; nothing is invented in its place.
  if (SITE.operator) {
    const org = { "@type": "Organization", "@id": `${siteUrl}/#organization`, name: SITE.operator, url: `${siteUrl}/` };
    if (SITE.contactEmail) org.email = SITE.contactEmail;
    graph.push(org);
    website.publisher = { "@id": `${siteUrl}/#organization` };
  }
  const webpage = {
    "@type": page.type,
    "@id": `${url}#webpage`,
    url,
    name: page.title,
    description: page.description,
    isPartOf: { "@id": `${siteUrl}/#website` },
    inLanguage: "en",
  };
  if (page.lastmod) webpage.dateModified = page.lastmod;
  graph.push(webpage);
  if (page.crumbs.length) {
    webpage.breadcrumb = { "@id": `${url}#breadcrumb` };
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [{ name: "Home", path: "/" }, ...page.crumbs].map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: abs(siteUrl, c.path),
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
};

/**
 * The managed <head> tags for a page, as plain descriptors. Every one carries
 * data-seo so it can be replaced as a set, never duplicated.
 */
export const headTags = (page, siteUrl) => {
  const tags = [
    { tag: "meta", attrs: { name: "description", content: page.description } },
    { tag: "meta", attrs: { name: "robots", content: page.robots } },
    { tag: "meta", attrs: { property: "og:site_name", content: SITE_NAME } },
    { tag: "meta", attrs: { property: "og:title", content: page.title } },
    { tag: "meta", attrs: { property: "og:description", content: page.description } },
    { tag: "meta", attrs: { property: "og:type", content: "website" } },
    { tag: "meta", attrs: { property: "og:locale", content: "en_IN" } },
    { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
    { tag: "meta", attrs: { name: "twitter:title", content: page.title } },
    { tag: "meta", attrs: { name: "twitter:description", content: page.description } },
  ];
  if (siteUrl) {
    const image = `${siteUrl}${SHARE_IMAGE.path}`;
    tags.push(
      { tag: "meta", attrs: { property: "og:image", content: image } },
      { tag: "meta", attrs: { property: "og:image:width", content: String(SHARE_IMAGE.width) } },
      { tag: "meta", attrs: { property: "og:image:height", content: String(SHARE_IMAGE.height) } },
      { tag: "meta", attrs: { property: "og:image:alt", content: SHARE_IMAGE.alt } },
      { tag: "meta", attrs: { name: "twitter:image", content: image } },
      { tag: "meta", attrs: { name: "twitter:image:alt", content: SHARE_IMAGE.alt } },
    );
    if (page.path) {
      const url = abs(siteUrl, page.path);
      tags.push({ tag: "meta", attrs: { property: "og:url", content: url } });
      if (page.robots === INDEX) tags.push({ tag: "link", attrs: { rel: "canonical", href: url } });
    }
    const ld = structuredData(page, siteUrl);
    if (ld) tags.push({ tag: "script", attrs: { type: "application/ld+json" }, text: JSON.stringify(ld) });
  }
  return tags;
};

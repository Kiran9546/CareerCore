import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PublicHeader, SiteFooter } from "../../components/PublicChrome";
import { SITE, operatorName } from "../../config/site";
import CopyButton from "../../components/ui/CopyButton";
import Breadcrumbs from "../../components/Breadcrumbs";

const formatDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/** Layout for the Privacy Policy and Terms pages: title, contents list, sections. */
export default function LegalPage({ title, intro, sections }) {
  const { hash, pathname } = useLocation();
  const [current, setCurrent] = useState(sections[0]?.id);

  // Arriving with #section (from search or a shared link) lands on it;
  // otherwise a new page starts at the top.
  useEffect(() => {
    const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash, title]);

  // Highlight the section being read in the sticky contents list.
  const ids = sections.map((s) => s.id).join(",");
  useEffect(() => {
    const els = ids.split(",").map((id) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  const toc = (sticky) => (
    <ol className={sticky ? "mt-3 space-y-0.5 text-sm" : "mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2"}>
      {sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            aria-current={sticky && current === s.id ? "location" : undefined}
            className={
              sticky
                ? `block rounded-md border-l-2 px-3 py-1.5 ${current === s.id ? "border-indigo-600 bg-slate-50 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`
                : "text-slate-600 hover:text-indigo-700 hover:underline underline-offset-4"
            }
          >
            {i + 1}. {s.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <PublicHeader progress />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:py-20">
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-24">
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">On this page</p>
              {toc(true)}
            </nav>
          </aside>

          <div className="max-w-3xl">
            <Breadcrumbs path={pathname} className="mb-6" />
            <p className="text-sm text-slate-500">
              Last updated <time dateTime={SITE.legalUpdated}>{formatDate(SITE.legalUpdated)}</time>
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
            <div className="mt-6 space-y-4 text-base leading-7 text-slate-700">{intro}</div>

            <nav aria-label="On this page" className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-5 lg:hidden">
              <p className="text-sm font-semibold text-slate-900">On this page</p>
              {toc(false)}
            </nav>

            <div className="mt-12 space-y-12">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                    {i + 1}. {s.title}
                  </h2>
                  <div className="mt-4 space-y-4 text-base leading-7 text-slate-700">{s.body}</div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** How to reach the operator, using whatever contact details are configured. */
export function ContactLine() {
  if (SITE.contactEmail) {
    return (
      <>
        Write to {operatorName()} at{" "}
        <a href={`mailto:${SITE.contactEmail}`} className="font-medium text-indigo-700 underline underline-offset-4">
          {SITE.contactEmail}
        </a>
        <CopyButton value={SITE.contactEmail} label="email address" className="ml-1 align-middle" />
        {SITE.postalAddress ? `, or by post to ${SITE.postalAddress}` : ""}.
      </>
    );
  }
  return (
    <>
      Use the{" "}
      <Link to="/contact" className="font-medium text-indigo-700 underline underline-offset-4">
        contact form
      </Link>
      , which reaches the administrators of this installation, or speak to the placement cell of your institution.
    </>
  );
}

export const Bullets = ({ items }) => (
  <ul className="list-disc space-y-2 pl-6 marker:text-slate-400">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

export const InlineLink = ({ to, children }) => (
  <Link to={to} className="font-medium text-indigo-700 underline underline-offset-4">
    {children}
  </Link>
);

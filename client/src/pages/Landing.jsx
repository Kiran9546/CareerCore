import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PublicHeader, SiteFooter } from "../components/PublicChrome";
import Icon from "../components/ui/Icon";
import { ROLE_META } from "../config/roles";
import TiltCard from "../motion/TiltCard";
import RevealWords from "../motion/RevealWords";
import Ambient from "../components/landing/Ambient";

import { lowEffects, webglAvailable, whenIdle } from "../motion/motion";

// Below-the-fold sections load as separate chunks. The build-time render
// waits for them, so their content is in the HTML either way.
const Journey = lazy(() => import("../components/landing/Journey"));
const IsoWorkflow = lazy(() => import("../components/landing/IsoWorkflow"));

// The real-time 3D version of the hero map, loaded only where it will run.
const HeroNetwork = lazy(() => import("../components/landing/HeroNetwork"));
const NETWORK_LINKS = [
  ["students", "skills"],
  ["skills", "paths"],
  ["paths", "drives"],
  ["drives", "rounds"],
  ["rounds", "offers"],
  ["students", "drives"],
];
// Where the map (and so the 3D layer) is shown: tablets, and from 1280 px.
const MAP_MEDIA = "(min-width: 768px) and (max-width: 1023.98px), (min-width: 1280px)";

const FEATURES = [
  {
    icon: "briefcase",
    title: "Drive management",
    body: "Create a drive, set eligibility once, and CareerCore notifies every eligible student and takes registrations until the deadline.",
  },
  {
    icon: "layers",
    title: "Round-by-round tracking",
    body: "Record attendance and results for each round. Students who clear one round move to the next automatically.",
  },
  {
    icon: "target",
    title: "Placement readiness score",
    body: "A single score per student, built from academics, skills, aptitude and resume, that shows where help is needed.",
  },
  {
    icon: "brain",
    title: "Skill gaps and aptitude",
    body: "Compare each student's skills with their target career path, and run a timed aptitude test from a managed question bank.",
  },
  {
    icon: "upload",
    title: "Spreadsheet import and export",
    body: "Bring in result sheets from companies and export the placement record as a workbook for reports and audits.",
  },
  {
    icon: "shield",
    title: "Role-based access",
    body: "Each category sees only what it should. Faculty see their own department, students see only their own record, and recruitment decisions keep an audit trail.",
  },
];

const STEPS = [
  { n: "01", title: "Publish the drive", body: "Company, role, CTC, eligibility rules and rounds." },
  { n: "02", title: "Students register", body: "Eligible students are notified and register in one click." },
  { n: "03", title: "Run the rounds", body: "Enter results, or import them; progression is automatic." },
  { n: "04", title: "Record offers", body: "Selections, offers and statistics update everywhere at once." },
];

const PREVIEW_ROUNDS = [
  { name: "Eligibility check", detail: "CGPA, backlogs and branch", state: "done" },
  { name: "Registration", detail: "Open until the deadline", state: "done" },
  { name: "Aptitude round", detail: "Attendance and results recorded", state: "done" },
  { name: "Technical interview", detail: "Cleared students move here", state: "current" },
  { name: "HR interview", detail: "Final round", state: "next" },
  { name: "Offers", detail: "Role, CTC and location", state: "next" },
];

const STATE_STYLE = {
  done: { dot: "bg-emerald-600 text-white", label: "Complete", text: "text-emerald-700" },
  current: { dot: "bg-indigo-600 text-white", label: "In progress", text: "text-indigo-700" },
  next: { dot: "bg-white text-slate-400 ring-1 ring-inset ring-slate-300", label: "Upcoming", text: "text-slate-500" },
};

/**
 * The parts of a placement season CareerCore links together, drawn as a quiet
 * map behind the drive card. Positions are percentages of the scene, chosen
 * to sit in the margin around the card. No numbers: it shows relationships,
 * not statistics.
 */
const MAP_NODES = [
  { id: "students", label: "Students", icon: "users", x: 2, y: 30 },
  { id: "skills", label: "Skills", icon: "target", x: 30, y: 3 },
  { id: "paths", label: "Career paths", icon: "compare", x: 71, y: 3 },
  { id: "drives", label: "Drives", icon: "briefcase", x: 92, y: 33 },
  { id: "rounds", label: "Rounds", icon: "layers", x: 92, y: 73 },
  { id: "offers", label: "Offers", icon: "award", x: 62, y: 96 },
];
const node = (id) => MAP_NODES.find((n) => n.id === id);
const link = (a, b, bend = 0) => {
  const p = node(a);
  const q = node(b);
  const mx = (p.x + q.x) / 2 + bend;
  const my = (p.y + q.y) / 2 - bend;
  return `M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}`;
};
// The season in order, plus students registering for drives directly.
const MAP_LINKS = [
  link("students", "skills", -4),
  link("skills", "paths", -3),
  link("paths", "drives", 4),
  link("drives", "rounds", 3),
  link("rounds", "offers", 3),
  link("students", "drives", 6),
];
const MAP_FLOW = `${link("students", "skills", -4)} ${link("skills", "paths", -3).replace(/^M[^ ]+/, "")} ${link("paths", "drives", 4).replace(/^M[^ ]+/, "")} ${link("drives", "rounds", 3).replace(/^M[^ ]+/, "")} ${link("rounds", "offers", 3).replace(/^M[^ ]+/, "")}`;

/**
 * The hero visual: the drive card in front of the map, in gentle 3D.
 *
 * On large screens the scene rests at a slight angle and leans a few degrees
 * with the mouse (pointer only, written to CSS variables, no re-render). On
 * tablets it is flat, and on phones only the card is shown. Reduced motion
 * and low-power devices get the same layout with nothing moving.
 */
function HeroVisual() {
  const stage = useRef(null);
  // "off": static map only. "loading": 3D layer mounting behind the map.
  // "on": 3D layer shown, map fading out. "done": map removed.
  const [network, setNetwork] = useState("off");

  useEffect(() => {
    if (lowEffects() || !window.matchMedia(MAP_MEDIA).matches || !webglAvailable()) return undefined;
    return whenIdle(() => setNetwork("loading"));
  }, []);
  useEffect(() => {
    if (network !== "on") return undefined;
    const id = setTimeout(() => setNetwork("done"), 900);
    return () => clearTimeout(id);
  }, [network]);

  useEffect(() => {
    const el = stage.current;
    const area = el?.closest("section");
    if (!el || !area) return undefined;
    let frame = 0;
    const wide = window.matchMedia("(min-width: 1024px)");
    const move = (e) => {
      if (e.pointerType !== "mouse" || !wide.matches || lowEffects()) return;
      const r = area.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--hx", `${(7 - py * 6).toFixed(2)}deg`);
        el.style.setProperty("--hy", `${(-11 + px * 8).toFixed(2)}deg`);
        if (el.dataset.tilt !== "on") el.dataset.tilt = "on";
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.style.removeProperty("--hx");
      el.style.removeProperty("--hy");
      delete el.dataset.tilt;
    };
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <figure className="mx-auto w-full max-w-xl">
      <div ref={stage} className="hero-stage" aria-hidden="true">
        <div className="hero-scene md:pb-10 md:pt-14">
          {/* Back layer: how the parts connect. Hidden from 1024 to 1279 px,
              where the two-column hero leaves no margin around the card. */}
          <div className="hero-layer-back pointer-events-none absolute inset-0 hidden md:block lg:hidden xl:block">
            {(network === "loading" || network === "on" || network === "done") && (
              <div className={`absolute inset-0 transition-opacity duration-700 ${network === "loading" ? "opacity-0" : "opacity-100"}`}>
                <Suspense fallback={null}>
                  <HeroNetwork
                    nodes={MAP_NODES}
                    links={NETWORK_LINKS}
                    onReady={() => setNetwork((s) => (s === "loading" ? "on" : s))}
                    onFail={() => setNetwork("failed")}
                  />
                </Suspense>
              </div>
            )}
            {network !== "done" && (
            <div className={`absolute inset-0 transition-opacity duration-700 ${network === "on" ? "opacity-0" : "opacity-100"}`}>
            <svg className="absolute inset-0 h-full w-full overflow-visible text-slate-300" viewBox="0 0 100 100" preserveAspectRatio="none">
              {MAP_LINKS.map((d, i) => (
                <path
                  key={d}
                  d={d}
                  pathLength="1"
                  className="line-draw"
                  style={{ "--i": i * 2 }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.25"
                />
              ))}
              {/* One soft light travelling the season, student to offer. */}
              <path
                d={MAP_FLOW}
                pathLength="1"
                className="hero-pulse text-indigo-500"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.45"
                strokeLinecap="round"
              />
            </svg>
            {MAP_NODES.map((n, i) => (
              <span
                key={n.id}
                className="rise-in absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-(--cc-shadow-rest) ring-1 ring-slate-200"
                style={{ left: `${n.x}%`, top: `${n.y}%`, "--i": 4 + i }}
              >
                <Icon name={n.icon} className="h-3.5 w-3.5 text-indigo-600" />
                {n.label}
              </span>
            ))}
            </div>
            )}
          </div>

          {/* Middle layer: the drive card. */}
          <div className="hero-layer-card relative rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6 md:mx-auto md:max-w-[25rem]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Placement drive</p>
                <p className="mt-1 font-semibold text-slate-900">Software engineer, campus hiring</p>
              </div>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Rounds</span>
            </div>
            <ol className="mt-4 space-y-1">
              {PREVIEW_ROUNDS.map((r, i) => {
                const st = STATE_STYLE[r.state];
                return (
                  <li key={r.name} className="flex items-center gap-3 rounded-lg px-2 py-2">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${st.dot}`}>
                      {r.state === "done" ? <Icon name="tick" className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{r.name}</span>
                      <span className="block truncate text-xs text-slate-500">{r.detail}</span>
                    </span>
                    <span className={`text-xs font-medium ${st.text}`}>{st.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Front layer: a student's profile checklist, then a real feature.
              Neither carries a figure. The profile card overlaps only the drive
              card's padding, never its content. */}
          <div className="hero-layer-front pointer-events-none absolute top-[44%] hidden w-36 md:block lg:hidden xl:block" style={{ right: "calc(50% + 11rem)" }}>
            <div className="hero-float-late rounded-xl bg-white p-3 shadow-(--cc-shadow-float) ring-1 ring-slate-200">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white">
                  <Icon name="user" className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-semibold text-slate-900">Student profile</span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {["Academics", "Skills", "Projects", "Aptitude test"].map((item, i) => (
                  <li key={item} className="flex items-center gap-2 text-[11px] text-slate-600">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="7" className={i < 3 ? "fill-emerald-50 stroke-emerald-300" : "fill-white stroke-slate-300"} />
                      {i < 3 && (
                        <path
                          d="M5 8.2 7 10.2 11 6"
                          pathLength="1"
                          className="line-draw stroke-emerald-600"
                          style={{ "--i": 12 + i * 3 }}
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* Front layer: a real feature, not a figure. */}
          <div className="hero-layer-front pointer-events-none absolute bottom-0 -left-4 hidden md:block">
            <div className="hero-float flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 shadow-(--cc-shadow-float) ring-1 ring-slate-200">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon name="bell" className="h-4 w-4" />
              </span>
              <span className="text-xs leading-tight">
                <span className="block font-semibold text-slate-900">Eligible students notified</span>
                <span className="block text-slate-500">as soon as a drive is published</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-slate-500 md:mt-6">
        How a drive is organized in the placement officer workspace, and how students, skills, career paths, drives,
        rounds and offers connect.
      </figcaption>
    </figure>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <PublicHeader
        progress
        nav={
          <nav aria-label="Sections" className="hidden items-center gap-8 text-sm text-slate-600 lg:flex">
            <a href="#workspaces" className="hover:text-slate-900">Who it is for</a>
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#how" className="hover:text-slate-900">How a drive runs</a>
          </nav>
        }
      />

      {/* Hero */}
      <section className="overflow-x-clip">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pb-12 lg:pt-8 xl:pb-16 xl:pt-10">
          <div>
            <p className="hero-in text-sm font-semibold text-indigo-700">Placement management for colleges</p>
            <RevealWords
              as="h1"
              mode="load"
              text="Run every campus placement drive from one platform."
              className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:leading-[1.08] xl:text-[3.4rem]"
            />
            <p className="hero-in-soft mt-6 max-w-xl text-lg leading-8 text-slate-600" style={{ "--d": "300ms" }}>
              CareerCore connects students, faculty, placement officers and administrators in one system,
              from eligibility and registration through interview rounds to final offers. Every role
              works in its own workspace, at the same time.
            </p>
            <div className="hero-in mt-10 flex flex-wrap items-center gap-3" style={{ "--d": "560ms" }}>
              <Link
                to="/register"
                className="btn-raise inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                Create an account
                <Icon name="arrowRight" className="cta-arrow w-4 h-4" />
              </Link>
              <Link
                to="/login"
                className="rounded-lg px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
              >
                Sign in
              </Link>
            </div>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* Workspaces */}
      <section id="workspaces" className="relative overflow-hidden border-y border-slate-200 bg-slate-50 py-24">
        <Ambient />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-indigo-700">Built for every role</p>
            <RevealWords text="One platform, four workspaces." className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl" />
            <p className="mt-4 text-lg text-slate-600">
              Each user category gets the tools it needs and sees only the data it should,
              while everyone works from the same records.
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(ROLE_META).map(([key, m]) => (
              <TiltCard key={key} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <span className={`absolute inset-x-6 top-0 h-0.5 rounded-b ${m.accent}`} />
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Icon name={m.icon} className="w-5 h-5" />
                </span>
                <h3 className="mt-5 font-semibold text-slate-900">{m.label}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{m.tagline}</p>
                <ul className="mt-4 space-y-1.5">
                  {m.nav.slice(0, 4).map((n) => (
                    <li key={n.to} className="flex items-center gap-2 text-xs text-slate-500">
                      <Icon name={n.icon} className="w-3.5 h-3.5 text-slate-400" />
                      {n.label}
                    </li>
                  ))}
                </ul>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-indigo-700">Features</p>
            <RevealWords text="Everything a placement cell needs to run the season." className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl" />
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <TiltCard key={f.title} max={3} className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
                <span className="feature-icon flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                  <Icon name={f.icon} className="w-5 h-5" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{f.body}</p>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <Journey />
      </Suspense>

      {/* How it works */}
      <section id="how" className="keep-palette relative overflow-hidden bg-slate-950 py-24 text-white">
        <Ambient tone="dark" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-indigo-300">How a drive runs</p>
              <RevealWords text="From announcement to offer letter in four steps." className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl" />
            </div>
            <div className="mx-auto w-full max-w-xl">
              <Suspense fallback={null}>
                <IsoWorkflow />
              </Suspense>
            </div>
          </div>
          <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <TiltCard as="li" key={s.n} className="rounded-2xl bg-white/3 p-6 ring-1 ring-white/10 hover:ring-white/20">
                <span className="font-mono text-sm text-indigo-300">{s.n}</span>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{s.body}</p>
              </TiltCard>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <RevealWords text="Ready to run your next drive?" className="text-3xl font-semibold tracking-tight sm:text-4xl" />
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Students, faculty and placement officers can create their own accounts. Administrator accounts are set up by your institution.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="btn-raise inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Create an account
              <Icon name="arrowRight" className="w-4 h-4" />
            </Link>
            <Link
              to="/login"
              className="rounded-lg px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

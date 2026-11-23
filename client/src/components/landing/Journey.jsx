import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import RevealWords from "../../motion/RevealWords";
import useInView from "../../motion/useInView";
import { useMedia } from "../../motion/motion";

/**
 * The student journey, told as you scroll: seven steps from registration to
 * placement analytics, each describing a feature CareerCore actually has.
 *
 * Desktop: the steps scroll on the left while a panel on the right stays in
 * view and changes with them. The panel's scenes are layered (back card,
 * front note) and arrive at slightly different depths; the heading above it
 * changes state; a soft backdrop shape morphs between steps; a rail beside
 * the steps fills as you go. Phones: each step shows its own illustration
 * inline, with no sticky panel.
 *
 * The active step comes from one IntersectionObserver watching the middle of
 * the viewport, so there is no scroll listener. The illustrations are
 * schematic (no names, companies or figures) and hidden from assistive
 * technology; the steps themselves are an ordered list of headed text.
 */
const STEPS = [
  {
    title: "Register",
    body: "Students, faculty and placement officers create their own accounts and land in their own workspace. Administrator accounts are set up by the institution.",
    tint: "fill-sky-500/10",
  },
  {
    title: "Build the profile",
    body: "Academics and backlogs, skills with a proficiency level, projects and certifications, all in one profile, with a resume builder alongside.",
    tint: "fill-indigo-500/10",
  },
  {
    title: "Assess skills and close gaps",
    body: "A timed aptitude test and a skill-gap analysis show what to work on, with learning resources ranked by how much they close each gap.",
    tint: "fill-emerald-500/10",
  },
  {
    title: "Career path suggestions",
    body: "CareerCore's model suggests career paths from the student's profile and aptitude results, with its confidence for each. The student picks the path to aim for, and readiness and skill gaps are measured against it.",
    tint: "fill-amber-500/10",
  },
  {
    title: "Discover eligible drives",
    body: "When the placement cell publishes a drive, every eligible student is notified and can register before the deadline.",
    tint: "fill-indigo-500/10",
  },
  {
    title: "Track every round",
    body: "Attendance and results are recorded round by round. Students follow their own progress, and the placement cell sees who moves on.",
    tint: "fill-sky-500/10",
  },
  {
    title: "See the results",
    body: "Placement statistics by batch, branch and company for the placement cell, readiness across the cohort for faculty, and a workbook export for reports.",
    tint: "fill-emerald-500/10",
  },
];

/** A smooth closed shape through six points around a centre; same structure for every step, so it can morph. */
const blob = (radii) => {
  const cx = 200;
  const cy = 190;
  const pts = radii.map((r, i) => {
    const a = (i / radii.length) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.86];
  });
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
};
const SHAPES = [
  [170, 150, 175, 160, 168, 150],
  [160, 178, 150, 172, 155, 176],
  [178, 150, 168, 182, 150, 165],
  [150, 172, 182, 150, 176, 158],
  [176, 160, 150, 170, 182, 150],
  [158, 182, 165, 150, 172, 176],
  [172, 156, 180, 166, 150, 178],
].map(blob);

const card = "rounded-xl bg-white p-4 ring-1 ring-slate-200 shadow-(--cc-shadow-raised)";
const note = "flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 shadow-(--cc-shadow-float)";
const field = "mt-1 h-8 rounded-md border border-slate-200 bg-slate-50";
const bar = (w, cls = "bg-slate-200") => <span className={`block h-2 rounded-full ${cls}`} style={{ width: w }} />;

function SceneRegister() {
  return (
    <>
      <div className={`j-layer j-back ${card} w-72`}>
        <p className="text-sm font-semibold text-slate-900">Create an account</p>
        {["Full name", "College email", "Password"].map((l) => (
          <div key={l} className="mt-3">
            <p className="text-[11px] font-medium text-slate-500">{l}</p>
            <div className={field} />
          </div>
        ))}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-center text-[11px] font-medium">
          <span className="rounded-md bg-white py-1 text-slate-900 shadow-sm">Student</span>
          <span className="py-1 text-slate-500">Faculty</span>
          <span className="py-1 text-slate-500">Officer</span>
        </div>
      </div>
      <div className={`j-layer j-front ${note} absolute bottom-10 right-6`}>
        <Icon name="shield" className="h-4 w-4 text-indigo-600" />
        Each role gets its own workspace
      </div>
    </>
  );
}

function SceneProfile() {
  return (
    <>
      <div className={`j-layer j-back ${card} w-72`}>
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
            <Icon name="user" className="h-5 w-5" />
          </span>
          <div className="flex-1 space-y-1.5">{bar("70%", "bg-slate-300")}{bar("45%")}</div>
        </div>
        {[
          ["award", "Academics and backlogs"],
          ["target", "Skills, with proficiency"],
          ["layers", "Projects"],
          ["check", "Certifications"],
        ].map(([icon, label]) => (
          <div key={label} className="mt-3 flex items-center gap-2 text-xs text-slate-700">
            <Icon name={icon} className="h-4 w-4 text-indigo-600" />
            {label}
          </div>
        ))}
      </div>
      <div className={`j-layer j-front ${note} absolute bottom-10 right-6`}>
        <Icon name="file" className="h-4 w-4 text-indigo-600" />
        Resume builder alongside
      </div>
    </>
  );
}

function SceneSkills() {
  return (
    <>
      <div className={`j-layer j-back ${card} w-72`}>
        <p className="text-sm font-semibold text-slate-900">Skill gaps</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Your level against the path's requirement</p>
        {[["Data structures", "55%", "90%"], ["SQL", "80%", "70%"], ["Operating systems", "25%", "60%"]].map(([s, have, need]) => (
          <div key={s} className="mt-3">
            <p className="text-xs text-slate-700">{s}</p>
            <div className="relative mt-1 h-2 rounded-full bg-slate-100">
              <span className="absolute inset-y-0 left-0 rounded-full border border-dashed border-slate-300" style={{ width: need }} />
              <span className="bar-grow absolute inset-y-0 left-0 rounded-full bg-slate-900" style={{ width: have }} />
            </div>
          </div>
        ))}
      </div>
      <div className={`j-layer j-front ${note} absolute bottom-10 right-6`}>
        <Icon name="clock" className="h-4 w-4 text-indigo-600" />
        Timed aptitude test
      </div>
    </>
  );
}

function ScenePath({ active }) {
  const skills = [40, 82, 124, 166];
  return (
    <div className={`j-layer j-back ${card} w-80`}>
      <p className="text-sm font-semibold text-slate-900">Target path</p>
      {/* Re-mounted when the step becomes active, so the lines draw again. */}
      <svg key={active ? "on" : "off"} viewBox="0 0 280 200" className="mt-2 w-full" fill="none">
        {skills.map((y, i) => (
          <g key={y}>
            <path d={`M40,100 C90,100 80,${y} 120,${y}`} pathLength="1" className="line-draw" style={{ "--i": i }} stroke={i < 2 ? "#059669" : "#cbd5e1"} strokeWidth="2" />
            <path d={`M190,${y} C226,${y} 220,100 246,100`} pathLength="1" className="line-draw" style={{ "--i": i + 3 }} stroke={i < 2 ? "#059669" : "#cbd5e1"} strokeWidth="2" strokeDasharray={i < 2 ? undefined : "3 4"} />
            <rect x="120" y={y - 13} width="70" height="26" rx="6" className={i < 2 ? "fill-emerald-50 stroke-emerald-200" : "fill-white stroke-slate-200"} />
            <rect x="130" y={y - 3} width={34 + i * 6} height="6" rx="3" className="fill-slate-300" />
          </g>
        ))}
        <circle cx="30" cy="100" r="18" className="fill-slate-900" />
        <text x="30" y="104" textAnchor="middle" className="fill-white text-[10px] font-semibold">You</text>
        <rect x="236" y="84" width="40" height="32" rx="8" className="fill-amber-50 stroke-amber-200" />
        <Icon name="compare" x="248" y="92" width="16" height="16" className="text-amber-700" />
      </svg>
    </div>
  );
}

function SceneDrives() {
  return (
    <>
      <div className={`j-layer j-back ${card} w-80 space-y-2.5`}>
        <p className="text-sm font-semibold text-slate-900">Drives open to you</p>
        {[["Software engineer", "Campus hiring"], ["Data analyst", "Off-campus drive"]].map(([role, kind], i) => (
          <div key={role} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-xs font-medium text-slate-900">{role}</p>
              <p className="text-[11px] text-slate-500">{kind}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Eligible</span>
              {i === 0 && <span className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white">Register</span>}
            </div>
          </div>
        ))}
      </div>
      <div className={`j-layer j-front ${note} absolute right-4 top-8`}>
        <Icon name="bell" className="h-4 w-4 text-indigo-600" />
        Eligible students are notified
      </div>
    </>
  );
}

function SceneRounds({ active }) {
  const steps = ["Registration", "Aptitude", "Technical", "HR", "Offer"];
  return (
    <>
      <div className={`j-layer j-back ${card} w-80`}>
        <p className="text-sm font-semibold text-slate-900">Your progress</p>
        <div className="relative mt-6">
          <div className="absolute left-3 right-3 top-3 h-0.5 bg-slate-200" />
          <div key={active ? "on" : "off"} className="bar-grow absolute left-3 top-3 h-0.5 bg-indigo-600" style={{ width: "50%" }} />
          <ol className="relative flex justify-between">
            {steps.map((s, i) => (
              <li key={s} className="flex w-12 flex-col items-center gap-1.5">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
                    i < 2 ? "bg-emerald-600 text-white" : i === 2 ? "bg-indigo-600 text-white" : "bg-white text-slate-400 ring-1 ring-inset ring-slate-300"
                  }`}
                >
                  {i < 2 ? <Icon name="tick" className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="text-center text-[10px] leading-tight text-slate-600">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className={`j-layer j-front ${note} absolute bottom-10 right-6`}>
        <Icon name="layers" className="h-4 w-4 text-indigo-600" />
        Results recorded per round
      </div>
    </>
  );
}

function SceneResults({ active }) {
  const bars = [62, 80, 48, 70, 36];
  return (
    <>
      <div className={`j-layer j-back ${card} w-80`}>
        <p className="text-sm font-semibold text-slate-900">Branch-wise placement</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Illustration</p>
        <div key={active ? "on" : "off"} className="mt-4 flex h-28 items-end gap-3 border-b border-slate-200 px-1">
          {bars.map((h, i) => (
            <span key={i} className="iso-rise flex-1 rounded-t-md bg-slate-900/80" style={{ height: `${h}%`, "--i": i * 0.4 }} />
          ))}
        </div>
        <div className="mt-1.5 flex gap-3 px-1 text-center text-[10px] text-slate-500">
          {["CSE", "ISE", "ECE", "EEE", "ME"].map((b) => <span key={b} className="flex-1">{b}</span>)}
        </div>
      </div>
      <div className={`j-layer j-front ${note} absolute bottom-8 right-6`}>
        <Icon name="upload" className="h-4 w-4 text-indigo-600" />
        Export as a workbook
      </div>
    </>
  );
}

const SCENES = [SceneRegister, SceneProfile, SceneSkills, ScenePath, SceneDrives, SceneRounds, SceneResults];

/** One step's text, reporting when it crosses the middle of the viewport. */
function Step({ index, step, active, onActive, wide }) {
  const ref = useRef(null);
  const inMiddle = useInView(ref, { rootMargin: "-48% 0px -48% 0px" });
  useEffect(() => {
    if (inMiddle) onActive(index);
  }, [inMiddle, index, onActive]);
  const Scene = SCENES[index];
  const inline = useRef(null);
  const seen = useInView(inline, { once: true, rootMargin: "0px 0px -10% 0px" });
  // Mount the illustration only as it approaches the viewport.
  const near = useInView(inline, { once: true, rootMargin: "400px 0px" });
  return (
    <li ref={ref} className="journey-step relative md:flex md:min-h-[62vh] md:items-center" data-active={active ? "true" : "false"}>
      <div className="w-full">
        {/* Phones and small tablets: the illustration sits with its step. */}
        <div ref={inline} className="journey-stage relative mb-6 flex h-[22rem] items-center justify-center overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 md:hidden" aria-hidden="true">
          {wide === false && near && (
            <div className="journey-scene flex scale-90 items-center justify-center" data-active={seen ? "true" : "false"}>
              <Scene active={!!seen} />
            </div>
          )}
        </div>
        <span className="font-mono text-sm text-indigo-700">{String(index + 1).padStart(2, "0")}</span>
        <h3 className="mt-2 text-xl font-semibold text-slate-900">{step.title}</h3>
        <p className="mt-3 max-w-md leading-7 text-slate-600">{step.body}</p>
      </div>
    </li>
  );
}

export default function Journey() {
  const [active, setActive] = useState(0);
  // The illustrations are decorative, so they are not in the pre-rendered
  // HTML: after hydration only the set this screen needs is mounted (the
  // boxes keep their size, so nothing shifts).
  const wide = useMedia("(min-width: 768px)");
  return (
    <section id="journey" className="border-t border-slate-200 py-24" aria-labelledby="journey-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-indigo-700">The student journey</p>
          <RevealWords id="journey-title" text="From registration to placement, step by step." className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl" />
          <p className="mt-4 text-lg text-slate-600">What a student does in CareerCore, and what the placement cell sees at each stage.</p>
        </div>

        <div className="mt-14 grid gap-12 md:grid-cols-2 md:gap-16">
          <div className="relative">
            {/* Progress rail: fills as the active step advances. */}
            <div className="absolute bottom-0 left-0 top-0 hidden w-px bg-slate-200 md:block" aria-hidden="true">
              <div className="journey-rail h-full w-full bg-indigo-600" style={{ transform: `scaleY(${(active + 1) / STEPS.length})` }} />
            </div>
            <ol className="space-y-16 md:space-y-0 md:pl-10">
              {STEPS.map((s, i) => (
                <Step key={s.title} index={i} step={s} active={active === i} onActive={setActive} wide={wide} />
              ))}
            </ol>
          </div>

          {/* Desktop: the panel that stays in view and follows the steps. */}
          <div className="hidden md:block" aria-hidden="true">
            <div className="sticky top-24">
              <p key={active} className="journey-title text-sm font-medium text-slate-500">
                Step {String(active + 1).padStart(2, "0")} · <span className="text-slate-900">{STEPS[active].title}</span>
              </p>
              <div className="journey-stage relative mt-4 h-[26rem] overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 380" preserveAspectRatio="xMidYMid slice">
                  <path className={`journey-blob ${STEPS[active].tint}`} d={SHAPES[active]} style={{ d: `path("${SHAPES[active]}")` }} />
                </svg>
                {/* Only the active scene and its neighbours are mounted: enough
                    for the crossfade, without building all seven up front. */}
                {wide &&
                  SCENES.map((Scene, i) =>
                    Math.abs(i - active) <= 1 ? (
                      <div key={i} className="journey-scene flex items-center justify-center" data-active={active === i ? "true" : "false"}>
                        <Scene active={active === i} />
                      </div>
                    ) : null,
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

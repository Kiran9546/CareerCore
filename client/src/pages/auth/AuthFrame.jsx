import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fieldClass } from "./authStyles";
import ThemeToggle from "../../components/ui/ThemeToggle";
import Logo from "../../components/ui/Logo";
import Icon from "../../components/ui/Icon";
import Ambient from "../../components/landing/Ambient";
import { LEGAL_LINKS } from "../../config/site";
import { ROLE_META } from "../../config/roles";
import { lowEffects } from "../../motion/motion";

const POINTS = [
  { icon: "briefcase", text: "Drives run end to end: eligibility, rounds, results and offers" },
  { icon: "target", text: "A readiness score and skill-gap plan for every student" },
  { icon: "users", text: "Separate workspaces for students, faculty, placement officers and administrators" },
];

/**
 * The four real CareerCore workspaces as a stack of cards in depth, turning a
 * few degrees with the mouse anywhere on the page. Mouse only; still with
 * reduced motion and on low-power devices. Decorative: the same information
 * is in the list above it.
 */
function WorkspaceStack() {
  const stage = useRef(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    let frame = 0;
    const move = (e) => {
      if (e.pointerType !== "mouse" || lowEffects()) return;
      const px = e.clientX / window.innerWidth - 0.5;
      const py = e.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--px", `${(8 - py * 10).toFixed(2)}deg`);
        el.style.setProperty("--py", `${(-14 + px * 16).toFixed(2)}deg`);
        if (el.dataset.tilt !== "on") el.dataset.tilt = "on";
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.style.removeProperty("--px");
      el.style.removeProperty("--py");
      delete el.dataset.tilt;
    };
    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  const roles = Object.entries(ROLE_META);
  return (
    <div ref={stage} className="auth-stage mt-12" aria-hidden="true">
      <div className="auth-stack relative h-52">
        {roles.map(([key, m], i) => (
          <div
            key={key}
            className="rise-in absolute left-0 right-10 flex items-center gap-3 rounded-xl bg-slate-900 p-3.5 ring-1 ring-white/10 shadow-[0_18px_40px_-16px_rgb(0_0_0_/_0.7)]"
            style={{
              top: `${(roles.length - 1 - i) * 2.6}rem`,
              transform: `translateZ(${-i * 30}px) translateX(${i * 1.4}rem)`,
              // Opaque cards, dimmed with depth, so nothing shows through.
              filter: `brightness(${1 - i * 0.16})`,
              "--i": 3 + i,
            }}
          >
            <span className={`absolute inset-x-4 top-0 h-0.5 rounded-b ${m.accent}`} />
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-indigo-200">
              <Icon name={m.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">{m.label}</span>
              <span className="block truncate text-xs text-slate-400">{m.tagline}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Split-screen frame shared by the sign-in and sign-up pages: the product
 * side on the left (large screens), and the form on a raised card in a quiet
 * field on the right.
 */
export default function AuthFrame({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-white">
      <aside className="keep-palette relative hidden overflow-hidden lg:flex flex-col justify-between bg-slate-950 p-12 text-white">
        <Ambient tone="dark" />
        <Link to="/" className="relative self-start">
          <Logo tone="light" />
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            Every placement, from first drive to final offer, in one place.
          </p>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p, i) => (
              <li key={p.text} className="rise-in flex gap-3 text-slate-300" style={{ "--i": i }}>
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                  <Icon name={p.icon} className="w-4 h-4 text-indigo-300" />
                </span>
                <span className="text-sm leading-6">{p.text}</span>
              </li>
            ))}
          </ul>
          <WorkspaceStack />
        </div>
        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} CareerCore</p>
      </aside>

      <main className="relative flex flex-col justify-center overflow-hidden bg-slate-50 px-4 py-12 sm:px-12">
        <Ambient />
        <ThemeToggle className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6" />
        <div className="rise-in relative mx-auto w-full max-w-md sm:rounded-2xl sm:bg-white sm:p-8 sm:shadow-(--cc-shadow-float) sm:ring-1 sm:ring-slate-200">
          <Link to="/" className="lg:hidden mb-10 inline-block">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-slate-500">{footer}</div>}
          <nav aria-label="Legal" className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-6 text-xs text-slate-500">
            <Link to="/contact" className="hover:text-slate-800 hover:underline underline-offset-4">
              Contact
            </Link>
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="hover:text-slate-800 hover:underline underline-offset-4">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </main>
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="feedback-in mb-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
      {children}
    </div>
  );
}

export function PasswordInput({ value, onChange, id, autoComplete, placeholder, invalid = false, describedBy }) {
  const [shown, setShown] = useState(false);
  const [toggled, setToggled] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`${fieldClass(invalid)} pr-11`}
        required
      />
      <button
        type="button"
        onClick={() => {
          setShown((s) => !s);
          setToggled(true);
        }}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
        aria-label={shown ? "Hide password" : "Show password"}
      >
        <Icon key={shown ? "hide" : "show"} name={shown ? "eyeOff" : "eye"} className={`w-4 h-4 ${toggled ? "icon-swap" : ""}`} />
      </button>
    </div>
  );
}

/** 0-4: length first, then a mix of letters, digits and symbols. */
const passwordScore = (pw = "") => {
  if (pw.length < 8) return pw.length ? 0 : -1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((rx) => rx.test(pw)).length;
  let score = 1;
  if (pw.length >= 12) score += 1;
  if (kinds >= 3) score += 1;
  if (pw.length >= 14 && kinds >= 3) score += 1;
  return Math.min(score, 4);
};
const STRENGTH = [
  { label: "Too short", bar: "bg-rose-500", text: "text-rose-700" },
  { label: "Okay", bar: "bg-amber-500", text: "text-amber-700" },
  { label: "Good", bar: "bg-green-500", text: "text-green-700" },
  { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-700" },
  { label: "Very strong", bar: "bg-emerald-600", text: "text-emerald-700" },
];

/**
 * A four-segment meter under a new-password field. Segments fill as the
 * password gets longer and more varied; the label is announced politely.
 */
export function PasswordStrength({ password }) {
  const score = passwordScore(password);
  if (score < 0) return null;
  const s = STRENGTH[score];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
            <span
              className={`block h-full rounded-full transition-[transform,background-color] duration-300 ease-out origin-left ${s.bar}`}
              style={{ transform: `scaleX(${score >= n || (score === 0 && n === 1) ? 1 : 0})` }}
            />
          </span>
        ))}
      </div>
      <p className={`mt-1 text-xs ${s.text}`}>
        {s.label}
        {score === 0 ? ": use at least 8 characters" : score < 3 ? ". Longer, with numbers or symbols, is stronger" : ""}
      </p>
    </div>
  );
}

/** A tick that draws itself inside a circle that pops in. Decorative. */
export function SuccessMark({ icon }) {
  return (
    <div className="success-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60" aria-hidden="true">
      {icon ? (
        <Icon name={icon} className="h-6 w-6 text-emerald-600" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-7 w-7 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path className="success-draw" pathLength="1" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </div>
  );
}

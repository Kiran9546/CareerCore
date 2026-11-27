import { useState } from "react";
import api from "../api/axios";
import Icon from "./ui/Icon";
import TiltCard from "../motion/TiltCard";
import AnimatedNumber from "../motion/AnimatedNumber";

const pct = (c) => Math.round(Math.max(0, Math.min(1, Number(c) || 0)) * 1000) / 10;

/**
 * Career paths CareerCore's model suggests from the student's own profile
 * (CGPA, backlogs, aptitude section scores, projects, certifications and
 * skills), with the model's confidence for each.
 *
 * Shows the suggestions already saved on the profile, and asks for fresh
 * ones only when the student presses the button: the existing endpoint
 * (GET /student/career-prediction) saves what it returns to the profile, so
 * it is not called automatically. The confidence bars grow to the real
 * values. Worded as guidance, matching the Terms: an estimate, not a
 * prediction of any outcome.
 */
export default function CareerSuggestions({ initial = [], target }) {
  const [items, setItems] = useState(() =>
    (initial || []).map((p) => ({ name: p.name, confidence: p.confidence })).filter((p) => p.name),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [round, setRound] = useState(0);

  const refresh = async () => {
    setBusy(true);
    setNote("");
    try {
      const { data } = await api.get("/student/career-prediction");
      if (data.available === false || !data.predictions?.length) {
        setNote("Suggestions are not available right now. The analysis service may be offline; try again later.");
      } else {
        setItems(data.predictions.map((p) => ({ name: p.careerPath, confidence: p.confidence })));
        setRound((r) => r + 1);
      }
    } catch (e) {
      setNote(e.response?.data?.message || "Could not get suggestions. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6" aria-labelledby="suggest-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="suggest-title" className="font-semibold text-slate-900">Suggested career paths</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Estimated from your profile and aptitude results by CareerCore's model. A guide to compare against your target, not a guarantee.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" aria-hidden="true" />
          ) : (
            <Icon name="zap" className="h-4 w-4 text-indigo-600" />
          )}
          {busy ? "Analysing…" : items.length ? "Refresh suggestions" : "Get suggestions"}
        </button>
      </div>

      {note && <p className="feedback-in mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">{note}</p>}

      {items.length > 0 ? (
        <ol key={round} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {items.map((p, i) => {
            const value = pct(p.confidence);
            const isTarget = target && p.name === target;
            return (
              <TiltCard key={p.name} as="li" max={3} className="rise-in rounded-lg border border-slate-200 bg-slate-50 p-4" style={{ "--i": i }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">
                    <span className="mr-1.5 font-mono text-xs text-slate-400">{i + 1}</span>
                    {p.name}
                  </p>
                  {isTarget && (
                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      Your target
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline justify-between text-xs text-slate-500">
                  <span>Model confidence</span>
                  <span className="font-semibold text-slate-800">
                    <AnimatedNumber value={value} suffix="%" />
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                  <div className="bar-grow h-full rounded-full bg-indigo-600" style={{ width: `${value}%`, "--i": i }} />
                </div>
              </TiltCard>
            );
          })}
        </ol>
      ) : (
        !note && <p className="mt-4 text-sm text-slate-500">No suggestions yet. Press the button to get the first set from your current profile.</p>
      )}
    </section>
  );
}

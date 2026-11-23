import { useEffect, useState, useRef } from "react";
import api from "../../api/axios";

/**
 * The test in progress is saved in this tab's sessionStorage, so leaving the
 * page (or reloading it) does not lose the answers. The server keeps the
 * attempt and its clock; this only remembers what was selected.
 */
const SAVE_KEY = "cc_aptitude_progress";
const loadSaved = () => {
  try {
    const v = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null");
    return v && v.attemptId && v.deadline ? v : null;
  } catch {
    return null;
  }
};
const saveProgress = (v) => {
  try {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify(v));
  } catch {
    /* storage blocked: the test still works, it just cannot be resumed */
  }
};
const clearSaved = () => {
  try {
    sessionStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
};

const SECTION_LABELS = {
  quantitative: "Quantitative",
  logical: "Logical Reasoning",
  verbal: "Verbal Ability",
  technical: "Technical",
};

export default function Aptitude() {
  const [view, setView] = useState("intro");
  const [history, setHistory] = useState([]);
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  // A test left in progress earlier in this tab.
  const [saved, setSaved] = useState(() => {
    const v = loadSaved();
    if (!v) return null;
    const left = v.deadline - Date.now();
    if (left <= 0) {
      clearSaved();
      return { expired: true };
    }
    return { ...v, minutesLeft: Math.max(1, Math.round(left / 60000)) };
  });
  const timerRef = useRef(null);
  const submittingRef = useRef(false);
  const deadlineRef = useRef(0);
  const submitRef = useRef(null);

  useEffect(() => {
    api
      .get("/student/aptitude/history")
      .then((res) => setHistory(res.data.attempts || []))
      .catch(() => setHistory([]));
  }, []);

  const start = async () => {
    if (starting) return;
    setError("");
    setNotice("");
    setStarting(true);
    try {
      const res = await api.post("/student/aptitude/start");
      // Resuming the same attempt: restore what was answered before.
      const previous = loadSaved();
      const restore = res.data.resumed && previous?.attemptId === String(res.data.attemptId) ? previous : null;
      submittingRef.current = false;
      // Track an absolute deadline rather than decrementing a counter:
      // browsers throttle setInterval in background tabs, so a tick-based
      // countdown would hand the student far more than the allotted 30 min.
      deadlineRef.current = Date.now() + res.data.timeRemainingSeconds * 1000;
      setTest(res.data);
      setRemaining(res.data.timeRemainingSeconds);
      setAnswers(restore?.answers || {});
      setCurrent(Math.min(restore?.current || 0, res.data.questions.length - 1));
      setSaved(null);
      if (res.data.resumed) setNotice(restore ? "Your test is resumed where you left it." : "Your test in progress is resumed. The clock kept running while you were away.");
      setView("test");
    } catch (e) {
      setError(e.response?.data?.message || "Could not start the test");
    } finally {
      setStarting(false);
    }
  };

  const submit = async () => {
    // The countdown effect and the Submit button can both land here.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    clearInterval(timerRef.current);
    try {
      const payload = {
        attemptId: test.attemptId,
        answers: test.questions.map((q) => ({
          questionId: q._id,
          selected: answers[q._id] ?? null,
        })),
      };
      const res = await api.post("/student/aptitude/submit", payload);
      clearSaved();
      setResult(res.data);
      setView("result");
    } catch (e) {
      setError(e.response?.data?.message || "Submission failed");
      // An expired attempt cannot be resumed; anything else can be retried.
      if (e.response?.status === 400 || e.response?.status === 404) clearSaved();
      else setSaved(loadSaved());
      setView("intro");
      submittingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  // Keep a live handle on submit. The old code called submit() from inside a
  // setRemaining updater, and that updater was created once when the test
  // started — so it closed over the empty `answers` object and auto-submit on
  // timeout sent a blank answer sheet, scoring the student 0.
  useEffect(() => {
    submitRef.current = submit;
  });

  // Save progress as the student answers, and warn before closing the tab.
  useEffect(() => {
    if (view !== "test" || !test) return;
    saveProgress({ attemptId: String(test.attemptId), answers, current, deadline: deadlineRef.current });
  }, [view, test, answers, current]);

  useEffect(() => {
    if (view !== "test") return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [view]);

  useEffect(() => {
    if (view !== "test") return;

    const tick = () => {
      const left = Math.max(
        0,
        Math.round((deadlineRef.current - Date.now()) / 1000),
      );
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timerRef.current);
        submitRef.current?.();
      }
    };

    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [view]);

  const mmss = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (view === "intro") {
    return (
      <div className="space-y-6">
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-1">Aptitude Test</h2>
          <p className="text-sm text-slate-500 mb-5">
            20 questions across four sections, 30 minutes. Your score
            contributes 20% to your PRS.
          </p>

          {error && (
            <div role="alert" className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {saved?.attemptId && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-indigo-50 px-4 py-3 ring-1 ring-inset ring-indigo-200">
              <div className="text-sm">
                <p className="font-medium text-indigo-900">You have a test in progress</p>
                <p className="text-indigo-800">
                  {Object.keys(saved.answers || {}).length} answered, about {saved.minutesLeft} minutes left. The clock keeps running.
                </p>
              </div>
              <button
                onClick={start}
                disabled={starting}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-60"
              >
                {starting ? "Resuming…" : "Resume test"}
              </button>
            </div>
          )}
          {saved?.expired && (
            <div role="status" className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
              Your earlier test ran out of time before it was submitted, so it was not scored. You can start a new one.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {Object.values(SECTION_LABELS).map((s) => (
              <div
                key={s}
                className="px-4 py-3 rounded-lg border border-slate-200 text-center"
              >
                <p className="text-sm text-slate-700">{s}</p>
                <p className="text-xs text-slate-400 mt-1">5 questions</p>
              </div>
            ))}
          </div>

          {!saved?.attemptId && (
            <button
              onClick={start}
              disabled={starting}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
            >
              {starting ? "Starting…" : "Start test"}
            </button>
          )}
        </section>

        {history.length > 0 && (
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4">
              Previous Attempts
            </h2>
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h._id}
                  className="flex flex-wrap justify-between items-center gap-3 px-4 py-3 rounded-lg border border-slate-200"
                >
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    {Object.entries(SECTION_LABELS).map(([k, label]) => (
                      <span key={k} className="text-slate-500">
                        {label.split(" ")[0]}{" "}
                        <strong className="text-slate-800">
                          {h.sectionScores[k]}
                        </strong>
                      </span>
                    ))}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">
                      {h.totalScore}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(h.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  if (view === "test") {
    const q = test.questions[current];
    const answered = Object.keys(answers).length;

    return (
      <div className="space-y-4">
        {notice && (
          <div role="status" className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm text-slate-700">{notice}</div>
        )}
        <div className="sticky top-16 z-20 flex justify-between items-center bg-white rounded-xl border border-slate-200 px-4 sm:px-6 py-4">
          <div>
            <p className="text-sm text-slate-500">
              {SECTION_LABELS[q.section]}
            </p>
            <p className="text-sm text-slate-400">
              Question {current + 1} of {test.questions.length}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-sm text-slate-500">{answered} answered</span>
            <span
              role="timer"
              aria-label={`Time remaining ${mmss(remaining)}`}
              className={`font-mono text-lg ${remaining < 300 ? "text-red-600" : "text-slate-900"}`}
            >
              {mmss(remaining)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-slate-900 mb-5">{q.questionText}</p>
          <div className="space-y-2">
            {q.options.map((o) => (
              <button
                key={o.label}
                onClick={() => setAnswers({ ...answers, [q._id]: o.label })}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  answers[q._id] === o.label
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="font-medium text-slate-500 mr-3">
                  {o.label}
                </span>
                <span className="text-slate-800">{o.text}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3">
          <button
            onClick={() => setCurrent(Math.max(0, current - 1))}
            disabled={current === 0}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>

          <div className="order-last flex w-full flex-wrap justify-center gap-1 sm:order-none sm:w-auto">
            {test.questions.map((qq, i) => (
              <button
                key={qq._id}
                onClick={() => setCurrent(i)}
                aria-label={`Question ${i + 1}${answers[qq._id] ? ", answered" : ""}`}
                aria-current={i === current ? "step" : undefined}
                className={`w-7 h-7 rounded text-xs ${
                  i === current
                    ? "bg-slate-900 text-white"
                    : answers[qq._id]
                      ? "bg-slate-200 text-slate-700"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {current < test.questions.length - 1 ? (
            <button
              onClick={() => setCurrent(current + 1)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
            >
              Next
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit test"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
      <p className="text-sm text-slate-500 uppercase tracking-wide">
        Your Score
      </p>
      <p className="text-6xl font-bold text-slate-900 my-3">
        {result.totalScore}
      </p>
      <p className="text-slate-500 mb-8">
        {result.correctCount} of {result.totalQuestions} correct
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {Object.entries(SECTION_LABELS).map(([k, label]) => (
          <div key={k} className="px-4 py-4 rounded-lg border border-slate-200">
            <p className="text-2xl font-bold text-slate-900">
              {result.sectionScores[k]}
            </p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          setView("intro");
          setResult(null);
          api
            .get("/student/aptitude/history")
            .then((r) => setHistory(r.data.attempts || []))
            .catch(() => {});
        }}
        className="px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
      >
        Back
      </button>
    </div>
  );
}

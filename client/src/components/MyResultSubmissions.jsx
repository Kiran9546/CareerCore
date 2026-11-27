import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import { STAGE_LABEL, formatDate } from "../utils/placement";

/**
 * The student's side of the result pipeline.
 *
 * A student cannot start one of these. The panel only ever shows requests
 * their department's faculty has already opened for them, which is what the
 * permission actually is — there is no "add" button because there is no way
 * to self-report unasked. Once submitted, faculty review it and forward it,
 * and only then does it touch the official record above.
 */

const STATUS_STYLE = {
  requested: "bg-amber-100 text-amber-800",
  submitted: "bg-blue-100 text-blue-700",
  forwarded: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const STATUS_LABEL = {
  requested: "Waiting for you",
  submitted: "With your faculty",
  forwarded: "Added to your record",
  rejected: "Declined",
};

const PASS_FAIL = [
  ["not_reached", "Did not reach this round"],
  ["passed", "Cleared"],
  ["failed", "Did not clear"],
];
const FINAL = [
  ["not_reached", "Did not reach this round"],
  ["selected", "Selected, received the offer"],
  ["rejected", "Not selected"],
];

const blankStages = (sub) => {
  const out = {};
  for (const stage of ["aptitude", "technical", "interview", "final"]) {
    out[stage] = sub?.stages?.[stage]?.status ?? "not_reached";
  }
  return out;
};

export default function MyResultSubmissions() {
  const [subs, setSubs] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState({});
  const [note, setNote] = useState("");
  const [ctc, setCtc] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get("/results/mine")
      .then((r) => setSubs(r.data.submissions))
      .catch((e) =>
        setError(e.response?.data?.message || "Could not load your result requests"),
      );
  }, []);

  useEffect(load, [load]);

  const open = (sub) => {
    setOpenId(sub._id);
    setDraft(blankStages(sub));
    setNote(sub.studentNote || "");
    setCtc(sub.offer?.ctc ? String(sub.offer.ctc / 100000) : "");
    setError("");
    setNotice("");
  };

  const submit = async (sub) => {
    setError("");
    setNotice("");
    const stages = {};
    for (const [stage, status] of Object.entries(draft)) {
      if (sub.drive.stagesRun && !sub.drive.stagesRun.includes(stage)) continue;
      stages[stage] = { status };
    }
    if (!Object.values(stages).some((s) => s.status !== "not_reached")) {
      return setError("Record at least one round you actually sat");
    }

    setBusy(true);
    try {
      await api.put(`/results/mine/${sub._id}`, {
        stages,
        studentNote: note,
        ...(draft.final === "selected" && ctc
          ? { offer: { ctc: Number(ctc) * 100000 } }
          : {}),
      });
      setNotice("Sent to your faculty for review");
      setOpenId(null);
      load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not send your results");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
  const label = "block text-xs font-medium text-slate-600 mb-1";

  const pending = subs.filter((s) => s.status === "requested");

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="mb-1">
        <h3 className="font-semibold text-slate-900">Result submissions</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          When your department asks you to report how a drive went, it appears
          here. Your faculty reviews what you send and forwards it to the
          placement cell. You cannot change your official record directly.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 mt-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 mt-3">
          <p className="text-sm text-green-700">{notice}</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 mt-3">
          <p className="text-sm text-amber-800">
            {pending.length} request{pending.length === 1 ? "" : "s"} waiting on you.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {subs.map((sub) => (
          <div key={sub._id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap justify-between items-start gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-900">
                    {sub.drive.company}
                  </p>
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_STYLE[sub.status] ?? ""}`}>
                    {STATUS_LABEL[sub.status] ?? sub.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[sub.drive.role, formatDate(sub.drive.driveDate)].filter(Boolean).join(" · ")}
                </p>
                {sub.requestNote && (
                  <p className="text-xs text-slate-600 mt-1.5 italic">
                    “{sub.requestNote}”
                  </p>
                )}
                {sub.status === "rejected" && sub.facultyNote && (
                  <p className="text-xs text-red-700 mt-1.5">{sub.facultyNote}</p>
                )}
              </div>
              {sub.status === "requested" && (
                <button
                  onClick={() => (openId === sub._id ? setOpenId(null) : open(sub))}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                >
                  {openId === sub._id ? "Cancel" : "Fill this in"}
                </button>
              )}
            </div>

            {/* What was already sent, once it is out of the student's hands */}
            {sub.status !== "requested" && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {["aptitude", "technical", "interview", "final"].map((stage) => {
                  const st = sub.stages?.[stage]?.status ?? "not_reached";
                  if (st === "not_reached") return null;
                  return (
                    <span
                      key={stage}
                      className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700"
                    >
                      {STAGE_LABEL[stage]}: {st.replace("_", " ")}
                    </span>
                  );
                })}
              </div>
            )}

            {openId === sub._id && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {["aptitude", "technical", "interview", "final"].map((stage) => {
                    const runs = !sub.drive.stagesRun || sub.drive.stagesRun.includes(stage);
                    if (!runs) return null;
                    const options = stage === "final" ? FINAL : PASS_FAIL;
                    return (
                      <div key={stage}>
                        <label className={label}>{STAGE_LABEL[stage]}</label>
                        <select
                          className={input}
                          value={draft[stage] ?? "not_reached"}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [stage]: e.target.value }))
                          }
                        >
                          {options.map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                {draft.final === "selected" && (
                  <div className="sm:w-56">
                    <label className={label}>Offer CTC (LPA)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className={input}
                      placeholder="e.g. 7.5"
                      value={ctc}
                      onChange={(e) => setCtc(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <label className={label}>Anything worth adding</label>
                  <textarea
                    rows={3}
                    className={input}
                    placeholder="What the rounds involved, when you heard back, anything your department should know."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => submit(sub)}
                    disabled={busy}
                    className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busy ? "Sending…" : "Send to my faculty"}
                  </button>
                  <button
                    onClick={() => setOpenId(null)}
                    className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {!subs.length && (
          <p className="text-sm text-slate-400">
            Nothing to submit. Your department will ask you here when they need
            your results.
          </p>
        )}
      </div>
    </div>
  );
}

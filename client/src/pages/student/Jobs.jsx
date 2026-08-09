import { useEffect, useState } from "react";
import api from "../../api/axios";

export default function Jobs() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [applying, setApplying] = useState(null);

  const load = () => {
    api.get("/student/jobs").then((res) => setData(res.data));
  };

  useEffect(load, []);

  const apply = async (jobId) => {
    setApplying(jobId);
    setMsg("");
    try {
      const res = await api.post(`/student/jobs/${jobId}/apply`);
      setMsg(`Applied — match ${res.data.matchPercent}%`);
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || "Application failed");
    } finally {
      setApplying(null);
    }
  };

  if (!data) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">
          {data.eligibleCount} of {data.totalCount} jobs match your eligibility
        </p>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      {data.jobs.map((j) => (
        <div key={j._id} className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-slate-900">{j.title}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  j.eligible ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                }`}>
                  {j.eligible ? `${j.matchPercent}% match` : "Not eligible"}
                </span>
              </div>

              <p className="text-sm text-slate-500 mt-1">
                {j.company?.name} · {j.location}
                {j.ctc && ` · ₹${(j.ctc / 100000).toFixed(1)}L`}
              </p>

              {j.description && (
                <p className="text-sm text-slate-600 mt-3">{j.description}</p>
              )}

              <div className="flex flex-wrap gap-1.5 mt-3">
                {j.requiredSkills?.map((s) => {
                  const has = j.matchedSkills?.includes(s.name);
                  return (
                    <span key={s.name} className={`px-2 py-0.5 rounded text-xs ${
                      has ? "bg-slate-900 text-white"
                          : s.isMandatory ? "bg-red-50 text-red-600 border border-red-200"
                          : "bg-slate-100 text-slate-500"
                    }`}>
                      {s.name}{s.isMandatory && !has ? " *" : ""}
                    </span>
                  );
                })}
              </div>

              <p className="text-xs text-slate-400 mt-3">
                Min CGPA {j.minCgpa} · Max backlogs {j.maxBacklogs}
                {j.eligible && ` · Skill overlap ${j.skillOverlapPercent}%`}
              </p>

              {!j.eligible && (
                <p className="text-xs text-red-500 mt-1">{j.ineligibleReason}</p>
              )}
              {j.eligible && j.missingMandatory?.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Missing required: {j.missingMandatory.join(", ")}
                </p>
              )}
            </div>

            <div className="ml-6">
              {j.applicationStatus ? (
                <span className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-600">
                  {j.applicationStatus.replace("_", " ")}
                </span>
              ) : (
                <button
                  onClick={() => apply(j._id)}
                  disabled={!j.eligible || applying === j._id}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {applying === j._id ? "Applying…" : "Apply"}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {!data.jobs.length && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500">No open positions right now.</p>
        </div>
      )}
    </div>
  );
}
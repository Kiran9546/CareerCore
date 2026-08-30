import { useEffect, useState } from "react";
import api from "../../api/axios";

const STAGES = ["applied", "shortlisted", "interview_scheduled", "offered"];

const STATUS_STYLE = {
  applied: "bg-slate-100 text-slate-700",
  shortlisted: "bg-blue-100 text-blue-700",
  interview_scheduled: "bg-amber-100 text-amber-700",
  offered: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function Applications() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/student/applications")
      .then((res) => setData(res.data))
      .catch((e) =>
        // 404 here means the student has not created a profile yet; without a
        // catch the page sat on "Loading…" forever.
        setError(e.response?.data?.message || "Could not load your applications"),
      );
  }, []);

  if (error)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">{error}</p>
      </div>
    );
  if (!data) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        {["applied", "shortlisted", "interview_scheduled", "offered", "rejected"].map((s) => (
          <div key={s} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{data.byStatus[s] || 0}</p>
            <p className="text-xs text-slate-500 mt-1 capitalize">{s.replace("_", " ")}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {data.applications.map((a) => {
          const stageIndex = STAGES.indexOf(a.status);
          const rejected = a.status === "rejected";

          return (
            <div key={a._id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-slate-900">{a.jobId?.title}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {a.jobId?.companyId?.name || a.jobId?.companyName} · {a.jobId?.location}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Applied {new Date(a.appliedAt).toLocaleDateString()} · Match {a.matchPercent}% · PRS {a.prsAtApplication}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-medium ${STATUS_STYLE[a.status]}`}>
                  {a.status.replace("_", " ")}
                </span>
              </div>

              {!rejected && (
                <div className="flex items-center gap-1 mt-4">
                  {STAGES.map((s, i) => (
                    <div key={s} className="flex-1">
                      <div className={`h-1 rounded-full ${i <= stageIndex ? "bg-slate-900" : "bg-slate-100"}`} />
                      <p className={`text-[10px] mt-1 capitalize ${i <= stageIndex ? "text-slate-600" : "text-slate-300"}`}>
                        {s.replace("_", " ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {!data.applications.length && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500">You haven't applied to any jobs yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
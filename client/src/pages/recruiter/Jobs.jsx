import { useEffect, useState } from "react";
import api from "../../api/axios";

const STATUS_COLORS = {
  applied: "bg-slate-100 text-slate-700",
  shortlisted: "bg-blue-100 text-blue-700",
  interview_scheduled: "bg-amber-100 text-amber-700",
  offered: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const STATUSES = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "offered",
  "rejected",
];

const errMsg = (e, fallback) => e.response?.data?.message || fallback;

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("candidates");
  const [candidates, setCandidates] = useState(null);
  const [applicants, setApplicants] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadJobs = async () => {
    try {
      const res = await api.get("/recruiter/jobs");
      setJobs(res.data.jobs);
      setError("");
    } catch (e) {
      // 404 = no company profile yet, 403 = still awaiting admin approval.
      // Without this the page sat on an empty list with no explanation.
      setJobs([]);
      setError(errMsg(e, "Could not load your jobs"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // loadJobs only touches state after awaiting the request, so this is not
    // the synchronous cascade the rule is guarding against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadJobs();
  }, []);

  const openJob = async (job) => {
    setSelected(job);
    setTab("candidates");
    setCandidates(null);
    setApplicants(null);
    setError("");
    try {
      const res = await api.get(`/recruiter/jobs/${job._id}/candidates`);
      setCandidates(res.data);
    } catch (e) {
      setCandidates({ candidates: [], eligibleCount: 0, totalCount: 0 });
      setError(errMsg(e, "Could not load candidates"));
    }
  };

  const fetchApplicants = async () => {
    try {
      const res = await api.get(`/recruiter/jobs/${selected._id}/applicants`);
      setApplicants(res.data);
      setError("");
    } catch (e) {
      setApplicants({ applications: [] });
      setError(errMsg(e, "Could not load applicants"));
    }
  };

  const loadApplicants = async () => {
    setTab("applicants");
    setApplicants(null);
    await fetchApplicants();
  };

  const changeStatus = async (appId, status) => {
    try {
      await api.patch(`/recruiter/applications/${appId}/status`, { status });
    } catch (e) {
      setError(errMsg(e, "Could not update the application status"));
    }
    await fetchApplicants();
  };

  const toggle = async (id) => {
    try {
      await api.patch(`/recruiter/jobs/${id}/toggle`);
    } catch (e) {
      setError(errMsg(e, "Could not update the job"));
    }
    loadJobs();
  };

  const banner = error && (
    <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
      {error}
    </div>
  );

  if (selected) {
    return (
      <div className="space-y-4">
        {banner}
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to jobs
        </button>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {selected.title}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Min CGPA {selected.minCgpa} · Max backlogs {selected.maxBacklogs} ·{" "}
            {selected.applicantCount} applicants
          </p>

          <div className="flex gap-1 mt-4 border-b border-slate-200">
            <button
              onClick={() => openJob(selected)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === "candidates" ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-slate-500"}`}
            >
              All Candidates
            </button>
            <button
              onClick={loadApplicants}
              className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === "applicants" ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-slate-500"}`}
            >
              Applicants
            </button>
          </div>
        </div>

        {tab === "candidates" && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            {!candidates ? (
              <p className="text-slate-400">Loading…</p>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-4">
                  {candidates.eligibleCount} of {candidates.totalCount} students
                  eligible
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="pb-2 font-medium">Student</th>
                      <th className="pb-2 font-medium">CGPA</th>
                      <th className="pb-2 font-medium">PRS</th>
                      <th className="pb-2 font-medium">Skills</th>
                      <th className="pb-2 font-medium">Match</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.candidates.map((c) => (
                      <tr
                        key={c.studentId}
                        className="border-b border-slate-100"
                      >
                        <td className="py-3">
                          <p className="text-slate-800">{c.name}</p>
                          <p className="text-xs text-slate-400">
                            {c.usn} · {c.branch}
                          </p>
                        </td>
                        <td className="py-3 text-slate-600">{c.cgpa}</td>
                        <td className="py-3 text-slate-600">{c.prs}</td>
                        <td className="py-3 text-slate-600">
                          {c.skillOverlapPercent}%
                        </td>
                        <td className="py-3">
                          <span
                            className={`font-semibold ${c.eligible ? "text-slate-900" : "text-slate-300"}`}
                          >
                            {c.matchPercent}%
                          </span>
                          {c.missingMandatory?.length > 0 && (
                            <p className="text-xs text-red-500 mt-0.5">
                              missing {c.missingMandatory.join(", ")}
                            </p>
                          )}
                          {!c.eligible && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {c.ineligibleReason}
                            </p>
                          )}
                        </td>
                        <td className="py-3">
                          {c.applicationStatus ? (
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[c.applicationStatus]}`}
                            >
                              {c.applicationStatus.replace("_", " ")}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {tab === "applicants" && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            {!applicants ? (
              <p className="text-slate-400">Loading…</p>
            ) : (
              <div className="space-y-3">
                {applicants.applications.map((a) => (
                  <div
                    key={a._id}
                    className="flex justify-between items-center px-4 py-3 rounded-lg border border-slate-200"
                  >
                    <div>
                      <p className="text-slate-800">
                        {a.studentId?.userId?.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {a.studentId?.usn} · CGPA {a.studentId?.cgpa} · PRS{" "}
                        {a.prsAtApplication} · Match {a.matchPercent}%
                      </p>
                    </div>
                    <select
                      value={a.status}
                      onChange={(e) => changeStatus(a._id, e.target.value)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-slate-300"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {!applicants.applications.length && (
                  <p className="text-sm text-slate-400">No applications yet.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-3">
      {banner}
      {jobs.map((j) => (
        <div
          key={j._id}
          className="bg-white rounded-xl border border-slate-200 p-5 flex justify-between items-center"
        >
          <div className="flex-1 cursor-pointer" onClick={() => openJob(j)}>
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-slate-900">{j.title}</h3>
              {!j.isActive && (
                <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500">
                  Closed
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {j.location} · Min CGPA {j.minCgpa} · {j.applicantCount}{" "}
              applicants · {j.requiredSkills?.length} skills
            </p>
          </div>
          <button
            onClick={() => toggle(j._id)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
          >
            {j.isActive ? "Close" : "Reopen"}
          </button>
        </div>
      ))}
      {!jobs.length && !error && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500">No jobs posted yet.</p>
        </div>
      )}
    </div>
  );
}

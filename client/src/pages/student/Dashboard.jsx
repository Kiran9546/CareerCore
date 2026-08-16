import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../api/axios";
import PRSGauge from "../../components/PRSGauge";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const LABELS = {
  academic: "Academic",
  skills: "Skills",
  certifications: "Certs",
  projects: "Projects",
  aptitude: "Aptitude",
};

export default function Dashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [noProfile, setNoProfile] = useState(false);

  useEffect(() => {
    api
      .get("/student/dashboard")
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.response?.status === 404) {
          setNoProfile(true);
        } else {
          setError(
            err.response?.data?.message || "Failed to load dashboard",
          );
        }
      });
  }, []);

  if (noProfile) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto">
        <h2 className="font-semibold text-slate-900 mb-2">
          Welcome to CareerCore
        </h2>

        <p className="text-sm text-slate-500 mb-5">
          Create your profile to see your Placement Readiness Score, skill
          gaps and job matches.
        </p>

        <button
          onClick={() => navigate("/student/profile")}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          Create profile
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-600">{error}</p>
        <button
          onClick={logout}
          className="mt-4 text-sm underline text-slate-500"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!data) {
    return <div className="py-12 text-center text-slate-400">Loading…</div>;
  }

  const { profile, counts, prs, prsHistory } = data;

  const radarData = prs.computable
    ? Object.entries(prs.breakdown).map(([k, v]) => ({
        component: LABELS[k],
        value: v,
      }))
    : [];

  const trendData = (prsHistory || []).map((h, i) => ({
    n: i + 1,
    score: h.score,
  }));

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          ["CGPA", profile.cgpa],
          ["Skills", counts.skills],
          ["Projects", counts.projects],
          ["Certifications", counts.certifications],
        ].map(([label, value]) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-200 p-4"
          >
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              {label}
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      {!prs.computable ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="text-amber-900 font-medium">{prs.message}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center justify-center">
              <PRSGauge score={prs.total} level={prs.readinessLevel} />

              <p className="text-sm text-slate-500 mt-4 text-center">
                Targeting{" "}
                <strong className="text-slate-700">
                  {prs.careerPath.name}
                </strong>
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 col-span-2">
              <h2 className="font-semibold text-slate-900 mb-1">
                Component Breakdown
              </h2>

              <p className="text-sm text-slate-500 mb-4">
                Held back by{" "}
                <strong className="text-slate-700">
                  {LABELS[prs.weakestComponent.name]}
                </strong>{" "}
                — costing {prs.weakestComponent.pointsLost} PRS points
              </p>

              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis
                    dataKey="component"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                  />
                  <PolarRadiusAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "#cbd5e1" }}
                  />
                  <Radar
                    dataKey="value"
                    stroke="#0f172a"
                    fill="#0f172a"
                    fillOpacity={0.15}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-semibold text-slate-900 mb-4">
                Priority Skill Gaps
              </h2>

              {prs.skillAnalysis.available ? (
                <div className="space-y-3">
                  {prs.skillAnalysis.gaps.slice(0, 6).map((g) => (
                    <div key={g.skill}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700">{g.skill}</span>
                        <span className="text-slate-400">
                          {g.currentLevel} / {g.targetLevel}
                        </span>
                      </div>

                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-900 rounded-full"
                          style={{
                            width: `${(g.currentLevel / g.targetLevel) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Skill analysis unavailable — is the ML service running?
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-semibold text-slate-900 mb-4">
                PRS Trend
              </h2>

              {trendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendData}>
                    <XAxis
                      dataKey="n"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                    />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#0f172a"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-400">
                  Not enough history yet — update your profile to see the
                  trend.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
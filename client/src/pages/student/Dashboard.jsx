import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import api from "../../api/axios";
import { chartTooltip, useChartColors } from "../../theme/theme";
import PRSGauge from "../../components/PRSGauge";
import SkillNetwork from "../../components/SkillNetwork";
import CareerSuggestions from "../../components/CareerSuggestions";
import ErrorState from "../../components/ui/ErrorState";
import { PageSkeleton } from "../../components/ui/Skeleton";
import ContactBanner from "../../components/ContactBanner";
import TiltCard from "../../motion/TiltCard";
import AnimatedNumber from "../../motion/AnimatedNumber";
import { useReducedMotion } from "../../motion/motion";
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
  const chart = useChartColors();
  const reduce = useReducedMotion();
  // Charts draw in once, unless the visitor prefers reduced motion.
  const anim = { isAnimationActive: !reduce, animationDuration: 800, animationEasing: "ease-out" };
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [noProfile, setNoProfile] = useState(false);
  // Bumped by "Try again" to fetch the dashboard once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api
      .get("/student/dashboard")
      .then((res) => {
        setData(res.data);
        setError("");
      })
      .catch((err) => {
        if (err.response?.status === 404) {
          setNoProfile(true);
        } else {
          setError(
            err.response?.data?.message || "Failed to load dashboard",
          );
        }
      });
  }, [attempt]);

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

  if (error && !data) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError("");
          setAttempt((a) => a + 1);
        }}
      >
        <button onClick={logout} className="text-sm underline text-slate-500">
          Sign out
        </button>
      </ErrorState>
    );
  }

  if (!data) {
    return <PageSkeleton label="Loading your dashboard" />;
  }

  const { profile, counts, prs, prsHistory, predictedCareers } = data;

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
      <ContactBanner />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          ["CGPA", profile.cgpa],
          ["Skills", counts.skills],
          ["Projects", counts.projects],
          ["Certifications", counts.certifications],
        ].map(([label, value], i) => (
          <TiltCard
            key={label}
            className="rise-in bg-white rounded-xl border border-slate-200 p-4"
            style={{ "--i": i }}
          >
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              {label}
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedNumber value={value} />
            </p>
          </TiltCard>
        ))}
      </div>

      {!prs.computable ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="text-amber-900 font-medium">{prs.message}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center justify-center">
              <PRSGauge score={prs.total} level={prs.readinessLevel} />

              <p className="text-sm text-slate-500 mt-4 text-center">
                Targeting{" "}
                <strong className="text-slate-700">
                  {prs.careerPath.name}
                </strong>
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 lg:col-span-2">
              <h2 className="font-semibold text-slate-900 mb-1">
                Component Breakdown
              </h2>

              <p className="text-sm text-slate-500 mb-4">
                Held back by{" "}
                <strong className="text-slate-700">
                  {LABELS[prs.weakestComponent.name]}
                </strong>{" "}
                costing {prs.weakestComponent.pointsLost} PRS points
              </p>

              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke={chart.grid} />
                  <PolarAngleAxis
                    dataKey="component"
                    tick={{ fontSize: 12, fill: chart.axis }}
                  />
                  <PolarRadiusAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: chart.gridMuted }}
                  />
                  <Tooltip {...chartTooltip(chart)} />
                  <Radar
                    name="Score"
                    dataKey="value"
                    stroke={chart.ink}
                    fill={chart.ink}
                    fillOpacity={0.15}
                    {...anim}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {prs.skillAnalysis.available &&
            ((prs.skillAnalysis.matched?.length ?? 0) > 0 || prs.skillAnalysis.gaps.length > 0) && (
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 mb-6" aria-labelledby="skill-map-title">
                <h2 id="skill-map-title" className="font-semibold text-slate-900">
                  How your skills connect to {prs.careerPath.name}
                </h2>
                <p className="text-sm text-slate-500 mt-1 mb-5">
                  The skills this career path requires, and where your profile stands on each.
                </p>
                <SkillNetwork
                  careerPath={prs.careerPath.name}
                  matched={prs.skillAnalysis.matched}
                  gaps={prs.skillAnalysis.gaps}
                  matchedCount={prs.skillAnalysis.matchedCount}
                  totalGaps={prs.skillAnalysis.totalGaps}
                />
              </section>
            )}

          <div className="mb-6">
            <CareerSuggestions initial={predictedCareers} target={prs.careerPath?.name} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-semibold text-slate-900 mb-4">
                Priority Skill Gaps
              </h2>

              {prs.skillAnalysis.available ? (
                <div className="space-y-3">
                  {prs.skillAnalysis.gaps.slice(0, 6).map((g, i) => (
                    <div key={g.skill}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700">{g.skill}</span>
                        <span className="text-slate-400">
                          {g.currentLevel} / {g.targetLevel}
                        </span>
                      </div>

                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="bar-grow h-full bg-slate-900 rounded-full"
                          style={{
                            width: `${(g.currentLevel / g.targetLevel) * 100}%`,
                            "--i": i,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Skill analysis is unavailable. Check that the ML service is running.
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
                      tick={{ fontSize: 11, fill: chart.axisMuted }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: chart.axisMuted }}
                    />
                    <Tooltip {...chartTooltip(chart)} />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke={chart.ink}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      {...anim}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-400">
                  Not enough history yet. Update your profile to see the
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
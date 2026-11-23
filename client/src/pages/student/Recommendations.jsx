import { useEffect, useState } from "react";
import api from "../../api/axios";
import { ListSkeleton } from "../../components/ui/Skeleton";

const TYPE_STYLE = {
  course: "bg-blue-100 text-blue-700",
  certification: "bg-green-100 text-green-700",
  tutorial: "bg-amber-100 text-amber-700",
  documentation: "bg-slate-100 text-slate-600",
  video: "bg-purple-100 text-purple-700",
};

const DIFFICULTY_STYLE = {
  beginner: "text-green-600",
  intermediate: "text-amber-600",
  advanced: "text-red-600",
};

export default function Recommendations() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/student/recommendations")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.message || "Could not load recommendations"));
  }, []);

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <p className="text-amber-900">{error}</p>
      </div>
    );
  }

  if (!data) return <ListSkeleton label="Loading recommendations" />;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Your Priority Gaps</h2>
        <p className="text-sm text-slate-500 mb-4">
          Targeting <strong className="text-slate-700">{data.careerPath.name}</strong>. Resources below are
          ranked by how much they close these gaps.
        </p>
        <div className="flex flex-wrap gap-2">
          {data.topGaps.map((g, i) => (
            <span key={g.skill}
              className={`px-3 py-1 rounded-lg text-sm ${
                i === 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}>
              {g.skill}
              <span className="ml-2 opacity-60 text-xs">{g.currentLevel}/{g.targetLevel}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {data.recommendations.map((r) => (
          <a key={r._id} href={r.url} target="_blank" rel="noopener noreferrer"
            className="block bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-400 transition-colors">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs ${TYPE_STYLE[r.type]}`}>
                    {r.type}
                  </span>
                  <span className={`text-xs font-medium ${DIFFICULTY_STYLE[r.difficulty]}`}>
                    {r.difficulty}
                  </span>
                  {r.isFree && (
                    <span className="px-2 py-0.5 rounded text-xs bg-green-50 text-green-600 border border-green-200">
                      free
                    </span>
                  )}
                </div>

                <h3 className="font-semibold text-slate-900">{r.title}</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {r.provider}
                  {r.durationHours && ` · ~${r.durationHours} hours`}
                </p>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {r.addressesSkills.map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded text-xs bg-slate-900 text-white">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {r.skillsCovered > 1 && (
                <div className="ml-4 text-right">
                  <p className="text-lg font-bold text-slate-900">{r.skillsCovered}</p>
                  <p className="text-xs text-slate-400">gaps covered</p>
                </div>
              )}
            </div>
          </a>
        ))}
      </div>

      {!data.recommendations.length && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500">No matching resources found for your current gaps.</p>
        </div>
      )}
    </div>
  );
}
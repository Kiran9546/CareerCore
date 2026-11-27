import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../../api/axios";
import PlacementProfileView from "../../components/PlacementProfileView";
import RecruitmentHistory from "../../components/drive/RecruitmentHistory";
import { DetailSkeleton } from "../../components/ui/Skeleton";

/**
 * The placement cell's view of one student's placement profile.
 *
 * Renders the same PlacementProfileView the student sees, from the same
 * endpoint shape, so the officer and the student are never looking at
 * different numbers for the same person.
 */
export default function PlacementProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/placement/students/${id}/profile`)
      .then((res) => {
        setProfile(res.data);
        setError("");
      })
      .catch((e) => {
        setProfile(null);
        setError(
          e.response?.data?.message || "Could not load this placement profile",
        );
      });
  }, [id]);

  if (error)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">{error}</p>
        <Link
          to={"/placement-officer/students"}
          className="inline-block mt-4 text-sm text-slate-700 underline"
        >
          Back to students
        </Link>
      </div>
    );
  if (!profile) return <DetailSkeleton label="Loading placement profile" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to={"/placement-officer/students"} className="text-sm text-slate-500 hover:text-slate-700">
          ← All students
        </Link>
        <Link
          to={`/placement-officer/compare?ids=${profile.studentId}`}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
        >
          Compare with another student
        </Link>
      </div>

      <PlacementProfileView profile={profile} showIdentity />

      <RecruitmentHistory endpoint={`/placement/students/${id}/recruitment`} />

      {/* Skills / projects / certifications — the profile side of the
          picture, shown next to the outcomes so the contrast between a
          strong profile and a weak outcome is visible on one page. */}
      {profile.student && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Skills</h3>
            {profile.student.skills?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.student.skills.map((s) => (
                  <span
                    key={s.skillId || s.name}
                    className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700"
                  >
                    {s.name} · {s.proficiency}/5
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No skills recorded.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Projects</h3>
            {profile.student.projects?.length ? (
              <ul className="space-y-2">
                {profile.student.projects.map((p) => (
                  <li key={p._id}>
                    <p className="text-sm text-slate-800">{p.title}</p>
                    <p className="text-xs text-slate-400">
                      {(p.techStack || []).join(", ") || "–"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No projects recorded.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Certifications</h3>
            {profile.student.certifications?.length ? (
              <ul className="space-y-2">
                {profile.student.certifications.map((c) => (
                  <li key={c._id}>
                    <p className="text-sm text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.issuer}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No certifications recorded.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import api from "../../api/axios";
import PlacementProfileView from "../../components/PlacementProfileView";
import MyResultSubmissions from "../../components/MyResultSubmissions";
import RecruitmentHistory from "../../components/drive/RecruitmentHistory";
import { PLACEMENT_STATUS_LABEL, PLACEMENT_STATUS_STYLE } from "../../utils/placement";
import { DetailSkeleton } from "../../components/ui/Skeleton";

/**
 * The student's own placement journey.
 *
 * Read-only by design. Official stage results are entered by the placement
 * cell, so this page has no editing affordances at all — not disabled ones,
 * simply none. The banner says so explicitly, because a student seeing a
 * wrong result needs to know who to ask rather than hunting for an edit
 * button that will never exist.
 */
export default function Placement() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/student/placement")
      .then((res) => setProfile(res.data))
      .catch((e) =>
        setError(
          e.response?.data?.message || "Could not load your placement history",
        ),
      );
  }, []);

  if (error)
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-500">{error}</p>
      </div>
    );
  if (!profile) return <DetailSkeleton label="Loading your placement journey" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Placement journey</h2>
          <p className="text-sm text-slate-500">
            Your official campus drive history, recorded by the placement cell
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded text-xs font-medium ${
            PLACEMENT_STATUS_STYLE[profile.placementStatus] ?? ""
          }`}
        >
          {PLACEMENT_STATUS_LABEL[profile.placementStatus] ?? profile.placementStatus}
        </span>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
        <p className="text-xs text-slate-600 leading-relaxed">
          These are official records. Stage results are entered and corrected
          only by the placement cell and authorized faculty. You cannot edit
          them here. If something looks wrong, contact the placement cell.
        </p>
      </div>

      {/* Current standing and every drive round by round, including drives
          run through the recruitment workflow. */}
      <RecruitmentHistory endpoint="/student/placement/status" linkDrives />

      <PlacementProfileView profile={profile} showIdentity={false} />

      {/* Requests opened by the student's own department. The student can
          only fill in what has been asked for, and faculty review it before
          any of it reaches the official record above. */}
      <MyResultSubmissions />
    </div>
  );
}

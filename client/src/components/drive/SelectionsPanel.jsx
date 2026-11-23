import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { OFFER_STATUSES, toDateInput, ui } from "../../utils/placement";
import { CardSkeleton } from "../ui/Skeleton";

/** Inline editor for one selected student's offer. */
function OfferRow({ s, onSave }) {
  const [v, setV] = useState({
    ctc: s.offer?.ctc ?? "",
    location: s.offer?.location || "",
    offerDate: toDateInput(s.offer?.offerDate),
    status: s.offer?.status || "pending",
  });
  const [dirty, setDirty] = useState(false);
  const set = (k, x) => {
    setV((p) => ({ ...p, [k]: x }));
    setDirty(true);
  };
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2"><Link to={`/placement-officer/students/${s.studentId}`} className="text-slate-800 hover:underline">{s.name}</Link></td>
      <td className="py-2 text-slate-600">{s.usn}</td>
      <td className="py-2 text-slate-600">{s.branch}</td>
      <td className="py-2 text-slate-600">{s.cgpa}</td>
      <td className="py-2"><input type="number" step="0.1" min="0" className={`${ui.select} w-24`} value={v.ctc} onChange={(e) => set("ctc", e.target.value)} aria-label="CTC" /></td>
      <td className="py-2"><input className={`${ui.select} w-32`} value={v.location} onChange={(e) => set("location", e.target.value)} aria-label="Location" /></td>
      <td className="py-2"><input type="date" className={ui.select} value={v.offerDate} onChange={(e) => set("offerDate", e.target.value)} aria-label="Selection date" /></td>
      <td className="py-2">
        <select className={ui.select} value={v.status} onChange={(e) => set("status", e.target.value)} aria-label="Offer status">
          {OFFER_STATUSES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
      <td className="py-2 text-right">
        <button className={ui.secondary} disabled={!dirty} onClick={async () => { if (await onSave(s, v)) setDirty(false); }}>Save</button>
      </td>
    </tr>
  );
}

/**
 * Final selections of the drive with their offers. Selections themselves
 * come only from finalizing the last round; this panel records the offer.
 */
export default function SelectionsPanel({ drive, onError, onNotice }) {
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/placement/drives/${drive._id}/students?view=selected&limit=200`)
      .then((r) => setData(r.data))
      .catch((e) => onError(e, "Could not load selections"));
  }, [drive._id, onError]);

  useEffect(load, [load]);

  const save = async (s, v) => {
    try {
      await api.patch(`/placement/participations/${s.participationId}/offer`, {
        ctc: v.ctc === "" ? undefined : Number(v.ctc),
        location: v.location,
        offerDate: v.offerDate || undefined,
        status: v.status,
      });
      onNotice(`Offer saved for ${s.name}`);
      return true;
    } catch (e) {
      onError(e, "Could not save the offer");
      return false;
    }
  };

  if (!data) return <CardSkeleton rows={5} />;

  return (
    <div className={ui.card}>
      <h3 className="font-semibold text-slate-900">Final selected students</h3>
      <p className="text-sm text-slate-500 mb-4">{drive.companyName} · {drive.role} · {data.total} student{data.total === 1 ? "" : "s"} selected</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-medium">Student</th>
              <th className="pb-2 font-medium">USN</th>
              <th className="pb-2 font-medium">Branch</th>
              <th className="pb-2 font-medium">CGPA</th>
              <th className="pb-2 font-medium">CTC (LPA)</th>
              <th className="pb-2 font-medium">Location</th>
              <th className="pb-2 font-medium">Selection date</th>
              <th className="pb-2 font-medium">Offer status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => <OfferRow key={s.participationId} s={s} onSave={save} />)}
            {!data.students.length && (
              <tr><td colSpan={9} className="py-6 text-center text-slate-400">No final selections yet. They are recorded when the last round is finalized.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

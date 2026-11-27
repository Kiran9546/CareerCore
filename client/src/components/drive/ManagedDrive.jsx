import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import Alerts from "./Alerts";
import DriveStudentList from "./DriveStudentList";
import EligibilityPanel from "./EligibilityPanel";
import RoundSetupPanel from "./RoundSetupPanel";
import RoundManager from "./RoundManager";
import SelectionsPanel from "./SelectionsPanel";
import AuditPanel from "./AuditPanel";
import NotificationDeliveryPanel from "./NotificationDeliveryPanel";
import CloneDriveDialog from "./CloneDriveDialog";
import TiltCard from "../../motion/TiltCard";
import AnimatedNumber from "../../motion/AnimatedNumber";
import {
  DRIVE_STATUS_LABEL,
  DRIVE_STATUS_STYLE,
  ROUND_STATUS_LABEL,
  ROUND_STATUS_STYLE,
  STATUS_ACTION,
  errorMessage,
  formatDate,
  formatDateTime,
  ui,
} from "../../utils/placement";
import { DetailSkeleton } from "../ui/Skeleton";
import { confirmAction } from "../ui/confirm";

const TABS = [
  ["overview", "Dashboard"],
  ["eligibility", "Eligibility"],
  ["students", "Students"],
  ["process", "Interview process"],
  ["rounds", "Rounds & results"],
  ["selections", "Final selections"],
  ["notifications", "Notifications"],
  ["audit", "Audit history"],
];

/** What each status change does, shown in the confirmation. */
const CONFIRM = {
  open: "Publish this drive? Eligibility is recalculated and every eligible student is notified automatically in CareerCore and by email.",
  registration_closed: "Close registration now? Students will no longer be able to register or re-register.",
  in_progress: "Start the drive? Registered students enter round 1 and the participant list is fixed.",
  completed: "Complete the drive? All rounds are finalized; results are stored permanently.",
  cancelled: "Cancel this drive? Registered students are notified. This cannot be undone.",
};

/** A clickable statistic card. */
function Stat({ label, value, onClick, hint }) {
  return (
    <TiltCard as="button" type="button" onClick={onClick} disabled={!onClick}
      className={`text-left rounded-xl border border-slate-200 bg-white p-4 ${onClick ? "hover:border-slate-400" : "cursor-default"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1"><AnimatedNumber value={value} /></p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </TiltCard>
  );
}

/**
 * The dashboard of one drive running the recruitment workflow. Every number
 * comes from GET /placement/drives/:id/dashboard, and every statistic opens
 * the list it counts.
 */
export default function ManagedDrive({ id }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(location.state?.notice || "");
  const [busy, setBusy] = useState(false);
  const [cloning, setCloning] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/placement/drives/${id}/dashboard`)
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e, "Could not load this drive")));
  }, [id]);

  useEffect(load, [load]);

  // On phones the tab bar scrolls sideways: bring the selected tab into view
  // when it changes (a deep link, or a statistic that opens another tab).
  // Only the bar scrolls, never the page.
  const tabBar = useRef(null);
  const loaded = Boolean(data);
  useEffect(() => {
    const bar = tabBar.current;
    const el = bar?.querySelector('[aria-current="page"]');
    if (!bar || !el || bar.scrollWidth <= bar.clientWidth) return;
    const left = el.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft || left + el.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollLeft = left - (bar.clientWidth - el.offsetWidth) / 2;
    }
  }, [tab, loaded]);

  const go = (next) => setParams(next);
  // Stable identities: the panels list these as effect dependencies.
  const flash = useCallback((msg) => {
    setError("");
    setNotice(msg);
  }, []);
  const fail = useCallback((e, fallback) => {
    setNotice("");
    setError(errorMessage(e, fallback));
  }, []);

  const savedAndReload = useCallback((msg) => {
    flash(msg);
    load();
  }, [flash, load]);

  const changeStatus = async (to) => {
    let reason;
    if (!(await confirmAction(CONFIRM[to]))) return;
    if (to === "cancelled") {
      reason = window.prompt("Reason for cancelling (recorded in the audit history):") || undefined;
    }
    setBusy(true);
    try {
      const r = await api.patch(`/placement/drives/${id}/status`, { status: to, reason });
      const notified = Number(r.data.notified) || 0;
      const extra =
        to === "open" ? ` ${notified} ${notified === 1 ? "student" : "students"} notified.` :
        to === "in_progress" ? ` ${r.data.roundOneParticipants} student(s) entered round 1.` : "";
      flash(`Drive is now ${DRIVE_STATUS_LABEL[to].toLowerCase()}.${extra}`);
      load();
    } catch (e) {
      fail(e, "Could not change the drive status");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmAction("Delete this draft drive?"))) return;
    try {
      await api.delete(`/placement/drives/${id}`);
      navigate("/placement-officer/drives");
    } catch (e) {
      fail(e, "Could not delete the drive");
    }
  };

  if (!data) return error ? <Alerts error={error} /> : <DetailSkeleton label="Loading drive" stats={8} />;
  const { drive, dashboard, allowedTransitions } = data;
  const s = dashboard.stats;
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-5">
      <Link to="/placement-officer/drives" className="text-sm text-slate-500 hover:text-slate-700">← All drives</Link>

      <div className={ui.card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{drive.companyName}</h2>
            <p className="text-slate-600">{drive.role}{drive.ctc ? ` · ₹${drive.ctc} LPA` : ""}{drive.location ? ` · ${drive.location}` : ""}</p>
            <p className="text-sm text-slate-500 mt-1">
              Drive date {formatDate(drive.driveDate)} · Registration closes {formatDateTime(drive.registrationDeadline)}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`${ui.badge} ${DRIVE_STATUS_STYLE[drive.status] ?? ""}`}>{DRIVE_STATUS_LABEL[drive.status]}</span>
              {dashboard.criteria.map((c) => (
                <span key={c} className={`${ui.badge} bg-slate-100 text-slate-600`}>{c}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {allowedTransitions.filter((t) => t !== "cancelled").map((t) => (
              <button key={t} className={ui.primary} disabled={busy} onClick={() => changeStatus(t)}>{STATUS_ACTION[t]}</button>
            ))}
            {!["completed", "cancelled"].includes(drive.status) && (
              <Link to={`/placement-officer/drives/${id}/edit`} className={ui.secondary}>Edit details</Link>
            )}
            <button className={ui.secondary} onClick={() => setCloning(true)}>Clone drive</button>
            {allowedTransitions.includes("cancelled") && (
              <button className={ui.danger} disabled={busy} onClick={() => changeStatus("cancelled")}>Cancel drive</button>
            )}
            {drive.status === "draft" && <button className={ui.danger} onClick={remove}>Delete</button>}
          </div>
        </div>
      </div>

      <Alerts error={error} notice={notice} />
      {cloning && <CloneDriveDialog drive={drive} onClose={() => setCloning(false)} />}

      {/* One swipeable row on phones, wrapping from sm up. The baseline is an
          inset shadow so the active underline is not clipped by the scroll. */}
      <nav ref={tabBar} aria-label="Drive sections" className="tab-strip -mx-4 px-4 sm:mx-0 sm:px-0 gap-1 shadow-[inset_0_-1px_0_var(--color-slate-200)]">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => go({ tab: key })}
            aria-current={tab === key ? "page" : undefined}
            className={`px-4 py-2.5 sm:py-2 text-sm border-b-2 ${tab === key ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-5">
          {dashboard.eligibilityStale && (
            <div className={ui.error}>The criteria changed since eligibility was last calculated. Recalculate on the Eligibility tab.</div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Total students" value={s.totalStudents} onClick={() => go({ tab: "students", view: "all" })} />
            <Stat label="Eligible" value={s.eligible} onClick={() => go({ tab: "students", view: "eligible" })} />
            <Stat label="Not eligible" value={s.ineligible} onClick={() => go({ tab: "students", view: "ineligible" })} hint={s.missingData ? `${s.missingData} with missing data` : undefined} />
            <Stat label="Notified" value={s.notified} onClick={() => go({ tab: "students", view: "notified" })} hint={`${s.viewed} viewed the drive`} />
            <Stat label="Registered" value={s.registered} onClick={() => go({ tab: "students", view: "registered" })} hint={`${s.notRegistered} eligible not registered`} />
            <Stat label="Withdrawn" value={s.withdrawn} onClick={() => go({ tab: "students", view: "withdrawn" })} />
          </div>
          {s.flaggedIneligible > 0 && (
            <button className={`${ui.error} w-full text-left`} onClick={() => go({ tab: "students", view: "flagged" })}>
              {s.flaggedIneligible} registered student(s) no longer meet the criteria and will not enter round 1 unless overridden. Review →
            </button>
          )}

          <div className={ui.card}>
            <h3 className="font-semibold text-slate-900 mb-3">Recruitment funnel</h3>
            {dashboard.rounds.length === 0 ? (
              <p className="text-sm text-slate-400">No interview process configured yet. <button className="underline" onClick={() => go({ tab: "process" })}>Configure rounds</button></p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="pb-2 font-medium">Round</th>
                      <th className="pb-2 font-medium">Schedule</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Participants</th>
                      <th className="pb-2 font-medium text-right">Appeared</th>
                      <th className="pb-2 font-medium text-right">Absent</th>
                      <th className="pb-2 font-medium text-right">{"Passed"}</th>
                      <th className="pb-2 font-medium text-right">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.rounds.map((r, i) => {
                      const open = (filter) => go({ tab: "rounds", round: r._id, ...filter });
                      const cell = (n, filter) =>
                        r.counts ? (
                          <button className="underline decoration-dotted hover:text-slate-900" onClick={() => open(filter)}>{n}</button>
                        ) : "–";
                      return (
                        <tr key={r._id} className="border-b border-slate-100">
                          <td className="py-2.5 text-slate-800">{i + 1}. {r.name}</td>
                          <td className="py-2.5 text-xs text-slate-500">
                            {r.schedule?.date ? `${formatDate(r.schedule.date)} ${r.schedule.startTime || ""} · ${r.schedule.mode === "online" ? "Online" : r.schedule.venue || ""}` : "Not scheduled"}
                          </td>
                          <td className="py-2.5"><span className={`${ui.badge} ${ROUND_STATUS_STYLE[r.status]}`}>{ROUND_STATUS_LABEL[r.status]}</span></td>
                          <td className="py-2.5 text-right">{cell(r.counts?.participants, {})}</td>
                          <td className="py-2.5 text-right">{cell(r.counts?.appeared, { attendance: "appeared" })}</td>
                          <td className="py-2.5 text-right">{cell(r.counts?.absent, { attendance: "absent" })}</td>
                          <td className="py-2.5 text-right font-medium">{cell(r.counts?.passed, { result: "passed" })}</td>
                          <td className="py-2.5 text-right">{cell(r.counts?.failed, { result: "failed" })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Final selected" value={s.finalSelected} onClick={() => go({ tab: "selections" })} />
            <Stat label="Offers accepted" value={s.offersAccepted} onClick={() => go({ tab: "selections" })} />
          </div>
          <p className="text-xs text-slate-400">{dashboard.definitions.unit}. {dashboard.definitions.totalStudents}.</p>
        </div>
      )}

      {tab === "eligibility" && <EligibilityPanel key={drive.updatedAt} drive={drive} onSaved={savedAndReload} onError={fail} />}
      {tab === "students" && <DriveStudentList drive={drive} params={params} setParams={setParams} onChanged={load} onError={fail} onNotice={flash} />}
      {tab === "process" && <RoundSetupPanel key={drive.updatedAt} drive={drive} onSaved={savedAndReload} onError={fail} />}
      {tab === "rounds" && (
        <RoundManager drive={drive} rounds={dashboard.rounds} params={params} setParams={setParams} isAdmin={isAdmin}
          onChanged={load} onError={fail} onNotice={flash} />
      )}
      {tab === "selections" && <SelectionsPanel drive={drive} onError={fail} onNotice={flash} />}
      {tab === "notifications" && (
        <NotificationDeliveryPanel drive={drive} canRetry={["placement_officer", "admin"].includes(user?.role)}
          onError={fail} onNotice={flash} />
      )}
      {tab === "audit" && <AuditPanel driveId={drive._id} />}
    </div>
  );
}

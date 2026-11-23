import CopyButton from "./ui/CopyButton";
import TiltCard from "../motion/TiltCard";
import AnimatedNumber from "../motion/AnimatedNumber";
import {
  STAGES,
  STAGE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  PLACEMENT_STATUS_LABEL,
  PLACEMENT_STATUS_STYLE,
  OUTCOME_LABEL,
  OUTCOME_STYLE,
  CONFIDENCE_LABEL,
  showMetric,
  formatDate,
} from "../utils/placement";

/**
 * Renders one placement profile as returned by buildPlacementProfile().
 *
 * Shared by the student's own journey page and the faculty individual
 * profile so the two cannot drift apart: a student and their faculty
 * member look at the same numbers, described the same way. The only
 * difference is the `showIdentity` flag — a student does not need their own
 * name and USN printed back at them.
 */

const Card = ({ title, subtitle, children, className = "" }) => (
  <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
    {title && (
      <div className="mb-4">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    )}
    {children}
  </div>
);

const Stat = ({ label, value, hint }) => (
  <TiltCard className="bg-white rounded-xl border border-slate-200 p-4">
    <p className="text-2xl font-bold text-slate-900"><AnimatedNumber value={value} /></p>
    <p className="text-xs text-slate-500 mt-1">{label}</p>
    {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
  </TiltCard>
);

/**
 * One stage's record. `attempts` excludes rounds the student never reached,
 * so the "never reached" count is shown separately rather than folded into
 * the failures.
 */
const StageRow = ({ label, attempts, passed, failed, notReached, passPercent }) => (
  <tr className="border-b border-slate-100 last:border-0">
    <td className="py-2.5 text-slate-800">{label}</td>
    <td className="py-2.5 text-slate-600">{attempts}</td>
    <td className="py-2.5 text-green-700">{passed}</td>
    <td className="py-2.5 text-red-700">{failed}</td>
    <td className="py-2.5 text-slate-400">{notReached}</td>
    <td className="py-2.5 font-medium text-slate-900">
      {showMetric(passPercent, "%")}
    </td>
  </tr>
);

const Funnel = ({ funnel }) => {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  return (
    <div className="space-y-2">
      {funnel.map((f) => (
        <div key={f.stage} className="flex items-center gap-3">
          <span className="w-40 shrink-0 text-xs text-slate-500">{f.stage}</span>
          <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
            <div
              className="h-full bg-slate-800 rounded"
              style={{ width: `${(f.count / max) * 100}%`, transition: "width .5s ease" }}
            />
          </div>
          <span className="w-8 text-right text-sm font-medium text-slate-900">
            {f.count}
          </span>
        </div>
      ))}
    </div>
  );
};

const FindingCard = ({ finding, tone }) => {
  const border =
    tone === "strength"
      ? "border-l-green-500"
      : tone === "weakness"
        ? "border-l-red-500"
        : "border-l-slate-300";

  return (
    <div className={`border-l-4 ${border} bg-slate-50 rounded-r-lg px-4 py-3`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-900">{finding.title}</p>
        {finding.confidence && finding.confidence !== "reliable" && (
          <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">
            {CONFIDENCE_LABEL[finding.confidence] ?? finding.confidence}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{finding.detail}</p>
    </div>
  );
};

export default function PlacementProfileView({ profile, showIdentity = true }) {
  if (!profile) return null;

  const { student, metrics, funnel, history, placementStatus, insights } = profile;
  const m = metrics;

  return (
    <div className="space-y-5">
      {/* ── Identity & academics ───────────────────────────── */}
      {showIdentity && student && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{student.name}</h2>
              <p className="flex flex-wrap items-center gap-x-1 text-sm text-slate-500">
                <span>{student.usn}</span>
                <CopyButton value={student.usn} label="USN" />
                <span>· {student.branch} · Batch {student.batch}</span>
              </p>
              {student.email && (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                  <a href={`mailto:${student.email}`} className="hover:text-slate-700 hover:underline">{student.email}</a>
                  <CopyButton value={student.email} label="email address" />
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded text-xs font-medium ${
                  PLACEMENT_STATUS_STYLE[placementStatus] ?? ""
                }`}
              >
                {PLACEMENT_STATUS_LABEL[placementStatus] ?? placementStatus}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-5 pt-4 border-t border-slate-100">
            <div>
              <p className="text-lg font-semibold text-slate-900">{student.cgpa}</p>
              <p className="text-xs text-slate-500">CGPA</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">{student.backlogs}</p>
              <p className="text-xs text-slate-500">Backlogs</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">{student.prs}</p>
              <p className="text-xs text-slate-500">PRS · {student.readinessLevel}</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {student.skills?.length ?? 0}
              </p>
              <p className="text-xs text-slate-500">Skills</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {student.projects?.length ?? 0} / {student.certifications?.length ?? 0}
              </p>
              <p className="text-xs text-slate-500">Projects / Certs</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Headline outcome metrics ───────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Drives registered" value={m.drivesRegistered} />
        <Stat label="Drives attended" value={m.drivesAttended} />
        <Stat
          label="Aptitude"
          value={`${m.aptitude.passed}/${m.aptitude.attempts}`}
          hint="cleared / attempted"
        />
        <Stat
          label="Technical"
          value={`${m.technical.passed}/${m.technical.attempts}`}
          hint="cleared / attempted"
        />
        <Stat label="Interviews reached" value={m.interview.reached} />
        <Stat
          label="Offers"
          value={m.offers}
          hint={`${showMetric(m.successRate, "%")} success rate`}
        />
      </div>

      {/* ── Insights ───────────────────────────────────────── */}
      <Card
        title="Placement pattern"
        subtitle="Generated from the official drive records below, not from the profile score"
      >
        <p className="text-sm text-slate-700 leading-relaxed">{insights.summary}</p>

        {!insights.sufficientData && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-xs text-amber-800 leading-relaxed">
              There is insufficient placement history to identify a reliable
              pattern. At least {insights.thresholds.minDrivesForPattern} attended
              drives are needed before strengths or weak areas are reported, so
              that a single result is not mistaken for a trend.
            </p>
          </div>
        )}

        {(insights.strengths.length > 0 ||
          insights.weakAreas.length > 0 ||
          insights.observations.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Strengths
              </p>
              {insights.strengths.length ? (
                insights.strengths.map((f) => (
                  <FindingCard key={f.code} finding={f} tone="strength" />
                ))
              ) : (
                <p className="text-xs text-slate-400">
                  None identified from the recorded results.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Weak areas
              </p>
              {insights.weakAreas.length ? (
                insights.weakAreas.map((f) => (
                  <FindingCard key={f.code} finding={f} tone="weakness" />
                ))
              ) : (
                <p className="text-xs text-slate-400">
                  None identified from the recorded results.
                </p>
              )}
            </div>
          </div>
        )}

        {insights.observations.length > 0 && (
          <div className="space-y-2 mt-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Observations
            </p>
            {insights.observations.map((f) => (
              <FindingCard key={f.code} finding={f} tone="neutral" />
            ))}
          </div>
        )}
      </Card>

      {/* ── Stage breakdown & funnel ───────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card
          title="Stage record"
          subtitle="Rounds never reached are counted separately. They are not failures"
        >
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium">Attempts</th>
                <th className="pb-2 font-medium">Passed</th>
                <th className="pb-2 font-medium">Failed</th>
                <th className="pb-2 font-medium">Not reached</th>
                <th className="pb-2 font-medium">Pass %</th>
              </tr>
            </thead>
            <tbody>
              <StageRow label="Aptitude" {...m.aptitude} />
              <StageRow label="Technical" {...m.technical} />
              <StageRow
                label="Interview"
                attempts={m.interview.reached}
                passed={m.interview.passed}
                failed={m.interview.failed}
                notReached={m.interview.notReached}
                passPercent={m.interview.passPercent}
              />
            </tbody>
          </table>
          </div>
        </Card>

        <Card title="Stage funnel" subtitle="Where the pipeline narrows">
          <Funnel funnel={funnel} />
        </Card>
      </div>

      {/* ── Company-wise history ───────────────────────────── */}
      <Card
        title="Company-wise history"
        subtitle={`${history.length} official drive record${history.length === 1 ? "" : "s"}`}
      >
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">
            No drive participation on record yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-medium">Company</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Date</th>
                  {STAGES.map((s) => (
                    <th key={s} className="pb-2 font-medium">
                      {STAGE_LABEL[s]}
                    </th>
                  ))}
                  <th className="pb-2 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.participationId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 text-slate-800">{h.company}</td>
                    <td className="py-2.5 text-slate-600">{h.role}</td>
                    <td className="py-2.5 text-slate-500 text-xs">
                      {formatDate(h.driveDate)}
                    </td>
                    {STAGES.map((s) => {
                      const runs = h.stagesRun.includes(s);
                      const status = h.stages[s]?.status ?? "not_reached";
                      return (
                        <td key={s} className="py-2.5">
                          {runs ? (
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${STATUS_STYLE[status] ?? ""}`}
                            >
                              {STATUS_LABEL[status] ?? status}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300" title="This drive did not run this stage">
                              n/a
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${OUTCOME_STYLE(h.outcome)}`}
                      >
                        {OUTCOME_LABEL[h.outcome] ?? h.outcome}
                      </span>
                      {h.offer?.ctc ? (
                        <span className="ml-2 text-xs text-slate-500">
                          ₹{h.offer.ctc} LPA
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

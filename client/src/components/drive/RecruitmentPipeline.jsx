import Icon from "../ui/Icon";
import TiltCard from "../../motion/TiltCard";
import AnimatedNumber from "../../motion/AnimatedNumber";

/**
 * Where students stand in the recruitment process, from the same totals as
 * the statistics cards (GET /placement/statistics). Connectors draw in from
 * stage to stage and the counts run up to their real values; the placement
 * bar grows to the real placement percentage.
 *
 * Each figure is counted independently by the server, so the stages show the
 * order of the process, not conversion between them, and the caption says
 * so. No rates are computed here.
 */
export default function RecruitmentPipeline({ totals, definitions }) {
  const stages = [
    { label: "Students", value: totals.totalStudents, icon: "users" },
    { label: "In recruitment now", value: totals.studentsInRecruitment, icon: "layers" },
    { label: "Final selections", value: totals.finalSelections, icon: "check" },
    { label: "Students placed", value: totals.placedStudents, icon: "award" },
  ];
  const pct = totals.placementPercentage;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="pipeline-title">
      <h4 id="pipeline-title" className="font-semibold text-slate-900">Recruitment at a glance</h4>
      <p className="text-xs text-slate-500">The order students move through. Each count is taken separately, so these are not conversion rates.</p>

      <ol className="mt-5 flex flex-col items-stretch gap-0 md:flex-row md:items-center">
        {stages.map((s, i) => (
          <li key={s.label} className="flex flex-col items-stretch md:flex-1 md:flex-row md:items-center">
            <TiltCard max={3} className="rise-in flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 md:flex-1" style={{ "--i": i }}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 ring-1 ring-slate-200">
                <Icon name={s.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-tight text-slate-900"><AnimatedNumber value={s.value} /></span>
                <span className="block text-xs text-slate-500">{s.label}</span>
              </span>
            </TiltCard>
            {i < stages.length - 1 && (
              <span className="flex items-center justify-center py-1 text-slate-400 md:w-10 md:py-0" aria-hidden="true">
                <span className="line-grow-y h-4 w-px bg-current md:hidden" style={{ "--i": i }} />
                <span className="bar-grow hidden h-0.5 flex-1 rounded-full bg-current md:block" style={{ "--i": i + 1 }} />
                <Icon name="chevronDown" className="feedback-in hidden h-3.5 w-3.5 -rotate-90 md:block" />
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-slate-600">Placement progress</span>
          <span className="font-semibold text-slate-900">
            <AnimatedNumber value={pct} suffix={pct === null || pct === undefined ? "" : "%"} />
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="presentation">
          <div className="bar-grow h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%`, "--i": 4 }} />
        </div>
        {definitions?.placed && <p className="mt-1.5 text-xs text-slate-500">{definitions.placed}.</p>}
      </div>
    </section>
  );
}

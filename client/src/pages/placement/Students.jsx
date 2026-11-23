import StudentOutcomesTable from "../../components/StudentOutcomesTable";

/** Placement officer's student roster, with drive outcomes joined on. */
export default function Students() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Students</h2>
        <p className="text-sm text-slate-500">
          How far each student got in every round. Open a student for their
          full placement profile, or download the whole batch as a spreadsheet.
        </p>
      </div>
      <StudentOutcomesTable basePath="/placement-officer" />
    </div>
  );
}

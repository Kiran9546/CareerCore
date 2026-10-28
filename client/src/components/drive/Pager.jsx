import { ui } from "../../utils/placement";

/** Server-side pagination controls. */
export default function Pager({ page, limit, total, onPage, onLimit }) {
  const pages = Math.max(Math.ceil(total / limit), 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 mt-3">
      <span>
        {total === 0 ? "No students" : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        {onLimit && (
          <select value={limit} onChange={(e) => onLimit(Number(e.target.value))} className={ui.select} aria-label="Rows per page">
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}
        <button className={ui.secondary} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className={ui.secondary} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

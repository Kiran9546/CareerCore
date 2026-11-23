/** A grey placeholder block shown while content loads. */
export function Skeleton({ className = "" }) {
  return <span aria-hidden="true" className={`skeleton block rounded-md bg-slate-200/80 ${className}`} />;
}

/** Placeholder rows for a table or list. */
export function SkeletonRows({ rows = 5, className = "" }) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Placeholder for a whole workspace page: a row of stat cards and two panels.
 * It matches the common page layout, so content arriving does not jump.
 */
export function PageSkeleton({ label = "Loading" }) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-14" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-6">
            <Skeleton className="h-4 w-40" />
            <SkeletonRows rows={4} className="mt-6" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** One white panel: a heading and some rows, the shape of most cards. */
export function CardSkeleton({ rows = 4, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`} aria-hidden="true">
      <Skeleton className="h-4 w-40" />
      <SkeletonRows rows={rows} className="mt-5" />
    </div>
  );
}

/**
 * A record page: the header card (title, subtitle, status badge), a row of
 * statistics, then a panel of rows. Matches drive and placement-profile
 * pages.
 */
export function DetailSkeleton({ label = "Loading", stats = 4, className = "" }) {
  return (
    <div role="status" aria-label={label} className={`space-y-5 ${className}`}>
      <div className="rounded-xl border border-slate-200 bg-white p-5" aria-hidden="true">
        <div className="flex justify-between gap-4">
          <div className="flex-1">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-1.5 h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-12" />
            </div>
          ))}
        </div>
      )}
      <CardSkeleton rows={5} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A heading card followed by a list of item cards. */
export function ListSkeleton({ label = "Loading", items = 4 }) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6" aria-hidden="true">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-2 h-3 w-2/3" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-7 w-24 rounded-lg" />)}
        </div>
      </div>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: items }, (_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-5/6" />
            <Skeleton className="mt-1.5 h-3 w-2/3" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A form card: label and field pairs in two columns. */
export function FormSkeleton({ label = "Loading", fields = 8 }) {
  return (
    <div role="status" aria-label={label} className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-1.5 h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** The resume editor: form sections on the left, the paper preview on the right. */
export function ResumeSkeleton({ label = "Loading your resume" }) {
  return (
    <div role="status" aria-label={label} className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} rows={3} />)}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-8" aria-hidden="true">
        <Skeleton className="mx-auto h-5 w-1/3" />
        <Skeleton className="mx-auto mt-2 h-3 w-1/2" />
        <SkeletonRows rows={10} className="mt-8" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

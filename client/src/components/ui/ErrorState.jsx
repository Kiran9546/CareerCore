import Icon from "./Icon";

/**
 * What a page shows when its data could not be loaded: the reason, and a way
 * to try again. Distinct from an empty state (the request worked, there is
 * just nothing to show) and from loading (skeletons).
 */
export default function ErrorState({ message, onRetry, children }) {
  return (
    <div role="alert" className="feedback-in rounded-xl border border-slate-200 bg-white p-8 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <Icon name="zap" className="h-5 w-5" />
      </span>
      <p className="mt-3 text-slate-600">{message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Try again
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

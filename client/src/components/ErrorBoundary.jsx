import { Component } from "react";

/**
 * Catches a render error anywhere below it and shows a recovery screen
 * instead of a blank page. A failed lazy-loaded chunk (typically after a new
 * deploy replaced the old files) is the common case, and reloading fixes it.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold text-indigo-600">Something went wrong</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">This page couldn't be displayed</h1>
          <p className="mt-3 text-sm text-slate-600">
            This is often fixed by reloading, especially just after an update. Your data has not been affected.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Reload page
            </button>
            <a
              href="/"
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-white"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}

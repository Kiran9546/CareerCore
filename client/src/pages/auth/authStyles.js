/** Form styles shared by the public (signed-out) pages. */
const inputBase =
  "block w-full rounded-lg border-0 bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 shadow-sm ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset outline-none transition";

export const inputClass = `${inputBase} ring-1 ring-slate-300 focus:ring-indigo-600`;

/** The same input with a red border, for a field that failed validation. */
export const invalidInputClass = `${inputBase} ring-2 ring-red-500 focus:ring-red-500`;

/** inputClass, or the error variant when `invalid`. */
export const fieldClass = (invalid) => (invalid ? invalidInputClass : inputClass);

export const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";
export const primaryButton =
  "flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed transition";

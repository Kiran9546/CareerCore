/**
 * An in-app replacement for window.confirm:
 *
 *   if (!(await confirmAction("Delete this draft drive?"))) return;
 *
 * Resolves true when confirmed, false when cancelled (button, Escape or a
 * click outside). Rendered by <ConfirmHost />, which App mounts once. Only
 * one question is open at a time; asking again while one is open answers the
 * first with "cancel", as the native dialog cannot be stacked either.
 *
 * Options: confirmLabel (default "Confirm"), danger (red confirm button).
 * Destructive wording (delete, cancel, withdraw) is detected when danger is
 * not given.
 */
let current = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l(current));

export const confirmAction = (message, { confirmLabel, danger } = {}) =>
  new Promise((resolve) => {
    if (current) current.resolve(false);
    const destructive = danger ?? /\b(delete|cancel|withdraw|remove)\b/i.test(message);
    current = {
      id: Date.now() + Math.random(),
      message,
      confirmLabel: confirmLabel || (destructive ? "Yes, continue" : "Confirm"),
      danger: destructive,
      resolve: (answer) => {
        current = null;
        emit();
        resolve(answer);
      },
    };
    emit();
  });

export const subscribeConfirm = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

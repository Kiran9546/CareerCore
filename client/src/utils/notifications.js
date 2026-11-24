/**
 * Keeps every view of the user's notifications in step. The bell and the
 * notification centre each load from the API; when either changes read
 * state it announces the new unread count, and the other updates at once
 * instead of waiting for its next poll.
 */
const EVENT = "cc:notifications-changed";

export const announceUnread = (unread) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { unread } }));
};

export const onUnreadChange = (listener) => {
  if (typeof window === "undefined") return () => {};
  const handler = (e) => listener(e.detail?.unread);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};

/** The structured drive details a drive notification carries, if any. */
export const driveDetails = (n) => {
  const m = n?.metadata || {};
  if (!m.driveId || !m.companyName) return null;
  return {
    driveId: m.driveId,
    companyName: m.companyName,
    role: m.role,
    deadline: m.registrationDeadline,
    ctc: m.ctc,
    location: m.location,
  };
};

/**
 * Where the signed-in session lives in the browser.
 *
 * Each tab keeps its own session in sessionStorage, so several people — or
 * one person checking the student and placement-officer views side by side —
 * can be signed in to different accounts in different tabs of the same
 * browser without one sign-in replacing another. (localStorage alone is
 * shared by every tab: the last sign-in used to win everywhere, and a tab
 * would silently start acting as someone else.)
 *
 * "Keep me signed in" also writes the session to localStorage. That copy is
 * only ever used to start a tab that has no session of its own, such as a
 * newly opened tab or the browser after a restart; it never overrides a tab
 * that is already signed in.
 */

const TOKEN = "cc_token";
const USER = "cc_user";

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback; // storage blocked (private mode, browser policy)
  }
};

const read = (store) => {
  const token = safe(() => store.getItem(TOKEN));
  const raw = safe(() => store.getItem(USER));
  if (!token || !raw) return null;
  try {
    return { token, user: JSON.parse(raw) };
  } catch {
    return null;
  }
};

const write = (store, token, user) =>
  safe(() => {
    store.setItem(TOKEN, token);
    store.setItem(USER, JSON.stringify(user));
  });

const remove = (store) =>
  safe(() => {
    store.removeItem(TOKEN);
    store.removeItem(USER);
  });

/**
 * This tab's session. A tab without one adopts the remembered session (if
 * any) once, and from then on keeps its own copy.
 */
export const loadSession = () => {
  const own = read(sessionStorage);
  if (own) return own;
  const remembered = read(localStorage);
  if (remembered) write(sessionStorage, remembered.token, remembered.user);
  return remembered;
};

export const getToken = () => safe(() => sessionStorage.getItem(TOKEN));

export const saveSession = (token, user, { remember = false } = {}) => {
  write(sessionStorage, token, user);
  if (remember) write(localStorage, token, user);
};

/** Refresh the cached user without changing where the session is kept. */
export const updateUser = (user) => {
  const token = getToken();
  if (!token) return;
  write(sessionStorage, token, user);
  if (safe(() => localStorage.getItem(TOKEN)) === token) write(localStorage, token, user);
};

/**
 * Sign this tab out. The remembered copy is cleared too, but only when it is
 * this same session — signing out of one account must not sign another tab's
 * remembered account out.
 */
export const clearSession = () => {
  const token = getToken();
  remove(sessionStorage);
  if (token && safe(() => localStorage.getItem(TOKEN)) === token) remove(localStorage);
};

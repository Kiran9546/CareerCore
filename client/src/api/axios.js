import axios from "axios";
import { getToken, clearSession } from "../auth/session";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
});

/**
 * How many requests are in flight, for the activity bar. Requests made with
 * { background: true } (polling, live search) are left out so the bar only
 * shows for things the user is waiting on.
 */
let inFlight = 0;
const activityListeners = new Set();
const setInFlight = (n) => {
  inFlight = Math.max(0, n);
  activityListeners.forEach((l) => l(inFlight));
};
export const subscribeActivity = (l) => {
  activityListeners.add(l);
  return () => activityListeners.delete(l);
};
export const activeRequests = () => inFlight;
api.interceptors.request.use((config) => {
  if (!config.background) setInFlight(inFlight + 1);
  return config;
});
api.interceptors.response.use(
  (res) => {
    if (!res.config?.background) setInFlight(inFlight - 1);
    return res;
  },
  (err) => {
    if (!err.config?.background) setInFlight(inFlight - 1);
    return Promise.reject(err);
  },
);

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // A failed sign-in is also a 401; only an expired or revoked session
    // should bounce the user to the sign-in page.
    const isAuthCall = /\/auth\/(login|register)$/.test(err.config?.url || "");
    if (err.response?.status === 401 && !isAuthCall) {
      clearSession();
      const { pathname, search } = window.location;
      if (!["/login", "/register", "/"].includes(pathname)) {
        // Come back to the same page after signing in again.
        window.location.href = `/login?expired=1&next=${encodeURIComponent(pathname + search)}`;
      }
    }
    return Promise.reject(err);
  },
);

/**
 * Address of a file the API serves, such as an uploaded photo stored as
 * "/uploads/...". When the API is on the same origin (VITE_API_URL unset or
 * relative) the path is used as-is; when VITE_API_URL is an absolute address
 * on another host, the path is resolved against that host.
 */
const API_ORIGIN = (() => {
  try {
    const base = import.meta.env.VITE_API_URL || "";
    return /^https?:\/\//i.test(base) ? new URL(base).origin : "";
  } catch {
    return "";
  }
})();
export const fileUrl = (path) => (path && API_ORIGIN && path.startsWith("/") && !path.startsWith("//") ? `${API_ORIGIN}${path}` : path);

export default api;

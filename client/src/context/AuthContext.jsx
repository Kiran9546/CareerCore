import { useState, useEffect } from "react";
import api from "../api/axios";
import { AuthContext } from "./useAuth";
import { loadSession, saveSession, updateUser, clearSession } from "../auth/session";

/**
 * `deferSession` is set when React hydrates a pre-rendered public page. That
 * HTML was rendered signed out, so the first render must be signed out too;
 * the saved session is applied straight after. Otherwise the session is read
 * during the first render, which avoids a signed-out flash on workspace pages.
 */
export function AuthProvider({ children, deferSession = false }) {
  const [user, setUser] = useState(() => (deferSession ? null : loadSession()?.user ?? null));
  const [loading, setLoading] = useState(() => !deferSession && !!loadSession());

  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    // Show the cached account at once, then confirm it with the server.
    if (deferSession) Promise.resolve().then(() => setUser(session.user));

    // Revalidate against the server: the account may have been deactivated
    // or changed since the session was cached.
    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user);
        updateUser(res.data.user);
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [deferSession]);

  const login = async (email, password, { remember = false } = {}) => {
    const res = await api.post("/auth/login", { email, password });
    saveSession(res.data.token, res.data.user, { remember });
    setUser(res.data.user);
    return res.data.user;
  };

  /**
   * Returns the new user, with `verification` describing the email link and
   * WhatsApp code that sign-up sent (or simulated, in sandbox mode).
   */
  const register = async (payload) => {
    const res = await api.post("/auth/register", payload);
    saveSession(res.data.token, res.data.user);
    setUser(res.data.user);
    return { ...res.data.user, verification: res.data.verification };
  };

  /** Re-read the account, e.g. after a contact detail was verified. */
  const refreshUser = async () => {
    const res = await api.get("/auth/me");
    setUser(res.data.user);
    updateUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

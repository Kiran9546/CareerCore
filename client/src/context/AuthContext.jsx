import { useState, useEffect } from "react";
import api from "../api/axios";
import { AuthContext } from "./useAuth";

/**
 * Read the cached user out of localStorage. A corrupt `cc_user` value used to
 * throw straight out of JSON.parse inside the effect and blank the whole app,
 * so a parse failure clears the cache and falls back to signed-out.
 */
const readStoredUser = () => {
  const stored = localStorage.getItem("cc_user");
  const token = localStorage.getItem("cc_token");
  if (!stored || !token) return null;
  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem("cc_user");
    localStorage.removeItem("cc_token");
    return null;
  }
};

export function AuthProvider({ children }) {
  // Hydrate on the first render instead of via setState in an effect — that
  // avoided a cascading render and the signed-out flash on reload.
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(() => !!readStoredUser());

  useEffect(() => {
    if (!readStoredUser()) return;

    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem("cc_user", JSON.stringify(res.data.user));
      })
      .catch(() => {
        localStorage.removeItem("cc_token");
        localStorage.removeItem("cc_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("cc_token", res.data.token);
    localStorage.setItem("cc_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (payload) => {
    const res = await api.post("/auth/register", payload);
    localStorage.setItem("cc_token", res.data.token);
    localStorage.setItem("cc_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

import { createContext, useContext } from "react";

/**
 * The auth context and its hook live apart from AuthProvider so that
 * AuthContext.jsx exports only a component, which keeps React Fast Refresh
 * working for it.
 */
export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

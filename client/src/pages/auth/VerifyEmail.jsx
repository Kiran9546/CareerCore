import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import { workspacePath } from "../../config/roles";
import AuthFrame, { ErrorNote } from "./AuthFrame";

/**
 * Opened from the verification email: /verify-email?token=…
 * Works signed in or out; the token alone identifies the account.
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const { user, refreshUser } = useAuth() || {};
  const [state, setState] = useState({ status: "checking" });
  const sent = useRef(false);

  useEffect(() => {
    // Strict mode runs effects twice in development; the link works once.
    if (sent.current) return;
    sent.current = true;
    const token = params.get("token") || "";
    api
      .post("/auth/email/verify", { token })
      .then((r) => {
        setState({ status: "done", email: r.data.email });
        if (user) refreshUser?.().catch(() => {});
      })
      .catch((e) => setState({ status: "failed", message: e.response?.data?.message || "This link could not be verified." }));
  }, [params, user, refreshUser]);

  const next = user ? (user.role === "student" ? "/student/profile#contact" : workspacePath(user.role)) : "/login";

  return (
    <AuthFrame
      title={state.status === "done" ? "Email verified" : state.status === "failed" ? "Link not valid" : "Verifying your email…"}
      subtitle={
        state.status === "done"
          ? `${state.email} is confirmed. Placement drive alerts will reach you there.`
          : state.status === "failed"
            ? "Sign in and send a new verification email from your profile."
            : "One moment."
      }
      footer={<Link to={next} className="font-semibold text-indigo-600 hover:text-indigo-500">{user ? "Continue to CareerCore" : "Sign in"}</Link>}
    >
      {state.status === "failed" && <ErrorNote>{state.message}</ErrorNote>}
      {state.status === "checking" && (
        <div className="flex justify-center py-6" role="status" aria-label="Verifying">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
        </div>
      )}
    </AuthFrame>
  );
}

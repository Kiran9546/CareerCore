import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import AuthFrame, { ErrorNote, SuccessMark } from "./AuthFrame";
import { fieldClass, labelClass, primaryButton } from "./authStyles";
import Icon from "../../components/ui/Icon";
import FieldError from "../../components/ui/FieldError";

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Matches the server: one email a minute per account. */
const RESEND_AFTER_S = 60;

/**
 * "Forgot password": ask for a one-time link by email. The answer never says
 * whether the address has an account, so the confirmation is worded for both.
 */
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(() => params.get("email") || "");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [message, setMessage] = useState("");
  const [wait, setWait] = useState(0);
  const sending = useRef(false);

  // Countdown before another link can be requested.
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async (address) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/auth/password/forgot", { email: address });
      setMessage(r.data.message);
      setSentTo(address);
      setWait(RESEND_AFTER_S);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (err.request ? "Can't reach the server. Check your connection and try again." : "Something went wrong. Try again."),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return (setFieldError("Enter your email address."), document.getElementById("email")?.focus());
    if (!EMAIL_RX.test(value)) {
      return (setFieldError("Enter a valid email address, like name@college.edu."), document.getElementById("email")?.focus());
    }
    send(value);
  };

  const backToSignIn = (
    <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:text-indigo-500">
      <Icon name="arrowRight" className="h-4 w-4 rotate-180" />
      Back to sign in
    </Link>
  );

  if (sentTo) {
    return (
      <AuthFrame title="Check your email" footer={backToSignIn}>
        <div className="step-in text-center" role="status">
          <SuccessMark icon="mail" />
          <p className="mt-5 text-sm leading-6 text-slate-600">
            If <span className="font-medium text-slate-900 break-all">{sentTo}</span> has a CareerCore account, a link to
            reset its password is on its way. It works once and expires in {message.match(/(\d+) minutes/)?.[1] || 30} minutes.
          </p>
        </div>
        <ul className="step-in mt-6 space-y-2 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-500 ring-1 ring-inset ring-slate-200" style={{ animationDelay: "120ms" }}>
          <li>Nothing yet? Check your spam or promotions folder.</li>
          <li>Use the newest email if you asked more than once: each link replaces the one before.</li>
        </ul>
        <ErrorNote>{error}</ErrorNote>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => send(sentTo)}
            disabled={busy || wait > 0}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? "Sending…" : wait > 0 ? `Send again in ${wait}s` : "Send the link again"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSentTo("");
              setError("");
            }}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Use a different email
          </button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Forgot your password?"
      subtitle="Enter the email address you sign in with and we'll send you a link to choose a new password."
      footer={backToSignIn}
    >
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="email" className={labelClass}>Email address</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldError) setFieldError("");
            }}
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? "email-error" : undefined}
            className={fieldClass(fieldError)}
            placeholder="you@college.edu"
            required
            autoFocus
          />
          <FieldError id="email-error">{fieldError}</FieldError>
        </div>
        <button type="submit" disabled={busy} className={`${primaryButton} btn-raise`}>
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              Sending link…
            </>
          ) : (
            <>
              Send reset link
              <Icon name="arrowRight" className="cta-arrow h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </AuthFrame>
  );
}

import { useRef, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import AuthFrame, { ErrorNote, PasswordInput } from "./AuthFrame";
import { fieldClass, labelClass, primaryButton } from "./authStyles";
import Icon from "../../components/ui/Icon";
import FieldError from "../../components/ui/FieldError";
import { workspacePath } from "../../config/roles";

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Only same-site paths, so ?next= cannot send anyone to another website. */
const safeNext = (value) => (value && value.startsWith("/") && !value.startsWith("//") ? value : null);

const validate = ({ email, password }) => {
  const e = {};
  if (!email.trim()) e.email = "Enter your email address.";
  else if (!EMAIL_RX.test(email.trim())) e.email = "Enter a valid email address, like name@college.edu.";
  if (!password) e.password = "Enter your password.";
  return e;
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  const justReset = params.get("reset") === "1";
  const [email, setEmail] = useState(() => params.get("email") || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending.current) return;
    setError("");
    const found = validate({ email, password });
    setErrors(found);
    if (found.email) return document.getElementById("email")?.focus();
    if (found.password) return document.getElementById("password")?.focus();

    sending.current = true;
    setBusy(true);
    try {
      const user = await login(email.trim(), password, { remember });
      navigate(next || workspacePath(user.role), { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (err.request ? "Can't reach the server. Check your connection and try again." : "Sign-in failed"),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Sign in to CareerCore"
      subtitle="Students, faculty, placement officers and administrators all sign in here."
      footer={
        <>
          New to CareerCore?{" "}
          <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Create an account
          </Link>
        </>
      }
    >
      {justReset && !error && (
        <div role="status" className="feedback-in mb-6 flex gap-2.5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
          <Icon name="tick" className="mt-0.5 h-4 w-4 shrink-0" />
          Your password has been changed. Sign in with the new password.
        </div>
      )}
      {params.get("expired") && !error && (
        <div role="status" className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          Your session ended. Sign in again{next ? " to return to the page you were on" : ""}.
        </div>
      )}
      {!params.get("expired") && next && !error && (
        <div role="status" className="mb-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
          Sign in to continue to that page.
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
              if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
            }}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={fieldClass(errors.email)}
            placeholder="you@college.edu"
            required
            autoFocus={!email}
          />
          <FieldError id="email-error">{errors.email}</FieldError>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
            <Link
              to={`/forgot-password${EMAIL_RX.test(email.trim()) ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
              className="-my-1 py-1 text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            invalid={!!errors.password}
            describedBy={errors.password ? "password-error" : undefined}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
            }}
          />
          <FieldError id="password-error">{errors.password}</FieldError>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-slate-600 select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
          />
          Keep me signed in on this device
        </label>

        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <Icon name="arrowRight" className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 flex gap-3 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-500 ring-1 ring-inset ring-slate-200">
        <Icon name="layers" className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        <p>
          Each browser tab keeps its own sign-in, so you can use different accounts side by side,
          for example a student account in one tab and a placement officer account in another.
          On a shared computer, leave “Keep me signed in” unticked.
        </p>
      </div>
    </AuthFrame>
  );
}

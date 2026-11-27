import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import AuthFrame, { ErrorNote, PasswordInput, PasswordStrength, SuccessMark } from "./AuthFrame";
import { labelClass, primaryButton } from "./authStyles";
import Icon from "../../components/ui/Icon";
import FieldError from "../../components/ui/FieldError";

const MIN = 8;

/**
 * Opened from the reset email: /reset-password?token=…
 * The link is checked first, so an expired one says so before anyone types.
 * The first render does not read the token, so the pre-rendered page and the
 * page in the browser start out identical.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const token = params.get("token") || "";

  useEffect(() => {
    let live = true;
    api
      .post("/auth/password/check", { token })
      .then(() => live && setState({ status: "ready" }))
      .catch((e) =>
        live &&
        setState({
          status: "invalid",
          message:
            e.response?.data?.message ||
            (e.request ? "Can't reach the server. Check your connection and reload the page." : "This link could not be checked."),
        }),
      );
    return () => {
      live = false;
    };
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (sending.current) return;
    const found = {};
    if (password.length < MIN) found.password = `Use at least ${MIN} characters.`;
    if (!confirm) found.confirm = "Type the new password again.";
    else if (password !== confirm) found.confirm = "The passwords do not match.";
    setErrors(found);
    if (found.password) return document.getElementById("password")?.focus();
    if (found.confirm) return document.getElementById("confirm")?.focus();

    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api.post("/auth/password/reset", { token, password });
      setState({ status: "done", email: r.data.email });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.request ? "Can't reach the server. Check your connection and try again." : "The password could not be changed.");
      // The link went stale while the form was open: show the "ask again" view.
      if (err.response?.status === 400 && /link/i.test(msg)) setState({ status: "invalid", message: msg });
      else setError(msg);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const askAgain = (
    <Link to="/forgot-password" className="font-semibold text-indigo-600 hover:text-indigo-500">
      Send me a new link
    </Link>
  );

  if (state.status === "checking") {
    return (
      <AuthFrame title="Reset your password" subtitle="Checking your link…">
        <div className="flex justify-center py-6" role="status" aria-label="Checking link">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
        </div>
      </AuthFrame>
    );
  }

  if (state.status === "invalid") {
    return (
      <AuthFrame
        title="This link can't be used"
        subtitle="Reset links work once and expire after a short time, for your security."
        footer={
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Back to sign in
          </Link>
        }
      >
        <ErrorNote>{state.message}</ErrorNote>
        <Link to="/forgot-password" className={`${primaryButton} btn-raise`}>
          Send me a new link
          <Icon name="arrowRight" className="cta-arrow h-4 w-4" />
        </Link>
      </AuthFrame>
    );
  }

  if (state.status === "done") {
    return (
      <AuthFrame title="Password changed">
        <div className="step-in text-center" role="status">
          <SuccessMark />
          <p className="mt-5 text-sm leading-6 text-slate-600">
            Your new password is set. For your security you have been signed out on every device. Sign in again with the
            new password.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/login?reset=1${state.email ? `&email=${encodeURIComponent(state.email)}` : ""}`, { replace: true })}
          className={`${primaryButton} btn-raise mt-6`}
        >
          Sign in
          <Icon name="arrowRight" className="cta-arrow h-4 w-4" />
        </button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Choose a new password" subtitle="Pick something you don't use on other websites." footer={askAgain}>
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={submit} className="step-in space-y-5" noValidate>
        <div>
          <label htmlFor="password" className={labelClass}>New password</label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder={`${MIN}+ characters`}
            value={password}
            invalid={!!errors.password}
            describedBy={errors.password ? "password-error" : undefined}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
            }}
          />
          <FieldError id="password-error">{errors.password}</FieldError>
          {!errors.password && <PasswordStrength password={password} />}
        </div>
        <div>
          <label htmlFor="confirm" className={labelClass}>Confirm new password</label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirm}
            invalid={!!errors.confirm}
            describedBy={errors.confirm ? "confirm-error" : undefined}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (errors.confirm) setErrors((x) => ({ ...x, confirm: undefined }));
            }}
          />
          <FieldError id="confirm-error">{errors.confirm}</FieldError>
          {confirm && password && confirm === password && !errors.confirm && (
            <p className="feedback-in mt-1.5 flex items-center gap-1 text-xs text-emerald-700">
              <Icon name="tick" className="h-3.5 w-3.5" />
              Passwords match
            </p>
          )}
        </div>
        <button type="submit" disabled={busy} className={`${primaryButton} btn-raise`}>
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>
              <Icon name="lock" className="h-4 w-4" />
              Set new password
            </>
          )}
        </button>
      </form>
    </AuthFrame>
  );
}

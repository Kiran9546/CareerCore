import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import api from "../../api/axios";
import { ROLE_META, workspacePath } from "../../config/roles";
import AuthFrame, { ErrorNote, PasswordInput, PasswordStrength } from "./AuthFrame";
import { fieldClass, labelClass, primaryButton } from "./authStyles";
import FieldError from "../../components/ui/FieldError";
import Icon from "../../components/ui/Icon";
import { useAlertChannels } from "../../utils/alertChannels";

/** Categories open to self-registration; administrators are provisioned. */
const ROLES = Object.entries(ROLE_META)
  .filter(([, m]) => m.selfRegister)
  .map(([value, m]) => ({ value, ...m }));

const ROLE_HINT = {
  student: "Build your profile and track placement readiness",
  faculty: "Monitor and record results for your department",
  placement_officer: "Run drives and record official results",
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    role: "student",
    department: "",
    phone: "",
    whatsappConsent: false,
  });
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  // Fetched rather than hardcoded: a duplicated list had already drifted out
  // of step with the server, leaving whole departments unable to register.
  const [departments, setDepartments] = useState([]);
  const channels = useAlertChannels();

  useEffect(() => {
    api
      .get("/auth/departments")
      .then((r) => setDepartments(r.data.departments))
      .catch(() => setDepartments([]));
  }, []);

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const fieldProps = (k) => ({
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `${k}-error` : undefined,
    className: fieldClass(errors[k]),
  });

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (sending.current) return;

    const found = {};
    if (form.role === "faculty" && !form.department) found.department = "Select your department.";
    if (form.name.trim().length < 2) found.name = "Enter your full name.";
    if (!form.email.trim()) found.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) found.email = "Enter a valid email address, like name@college.edu.";
    // Students give a mobile number: it is kept on their account as contact
    // details (and is where WhatsApp alerts go, when those are in use).
    if (form.role === "student") {
      const digits = form.phone.replace(/\D/g, "");
      if (!form.phone.trim()) found.phone = "Enter your mobile number.";
      else if (!/^[+\d\s().-]+$/.test(form.phone.trim()) || digits.length < 10 || digits.length > 15) {
        found.phone = "Enter a valid mobile number, like +91 98765 43210.";
      }
    }
    if (form.password.length < 8) found.password = "Use at least 8 characters.";
    if (!form.confirm) found.confirm = "Type the password again.";
    else if (form.password !== form.confirm) found.confirm = "The passwords do not match.";
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) return document.getElementById(first)?.focus();

    sending.current = true;
    setBusy(true);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        ...(form.role === "faculty" ? { department: form.department } : {}),
        ...(form.role === "student"
          ? { phone: form.phone.trim(), whatsappConsent: channels.whatsapp && form.whatsappConsent }
          : {}),
      });
      // Students continue to their profile, where the academic details are
      // filled in (and, when WhatsApp is in use, the code they were sent).
      if (user.role === "student") {
        navigate("/student/profile", { replace: true, state: { verification: user.verification } });
      } else {
        navigate(workspacePath(user.role), { replace: true });
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (err.request ? "Can't reach the server. Check your connection and try again." : "Registration failed"),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Create your account"
      subtitle="Choose the category that matches your role. Each one opens its own workspace."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>

      <form onSubmit={submit} className="space-y-5" noValidate>
        <fieldset>
          <legend className={labelClass}>I am a</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ROLES.map((r) => {
              const selected = form.role === r.value;
              return (
                <label
                  key={r.value}
                  className={`relative flex cursor-pointer flex-col rounded-xl p-3.5 ring-1 ring-inset transition ${
                    selected ? "bg-indigo-50/60 ring-2 ring-indigo-600" : "ring-slate-200 hover:ring-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={selected}
                    onChange={set("role")}
                    className="sr-only"
                  />
                  <Icon name={r.icon} className={`w-5 h-5 ${selected ? "text-indigo-600" : "text-slate-400"}`} />
                  <span className="mt-2 text-sm font-medium text-slate-900">{r.label}</span>
                  <span className="mt-0.5 text-xs leading-4 text-slate-500">{ROLE_HINT[r.value]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Faculty are scoped to one department everywhere in the app, so
            this is required rather than optional: an account without one
            can see nothing. */}
        {form.role === "faculty" && (
          <div>
            <label htmlFor="department" className={labelClass}>Department</label>
            <select id="department" value={form.department} onChange={set("department")} {...fieldProps("department")}>
              <option value="">Select your department…</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} · {d.label}
                </option>
              ))}
            </select>
            <FieldError id="department-error">{errors.department}</FieldError>
            <p className="mt-1.5 text-xs text-slate-500">You will only see students from this department.</p>
          </div>
        )}

        <div>
          <label htmlFor="name" className={labelClass}>Full name</label>
          <input id="name" autoComplete="name" value={form.name} onChange={set("name")} maxLength={100} {...fieldProps("name")} placeholder="e.g. Asha Rao" />
          <FieldError id="name-error">{errors.name}</FieldError>
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>Email address</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            {...fieldProps("email")}
            placeholder="you@college.edu"
          />
          <FieldError id="email-error">{errors.email}</FieldError>
        </div>

        {form.role === "student" && (
          <div>
            <label htmlFor="phone" className={labelClass}>Mobile number</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={set("phone")}
              {...fieldProps("phone")}
              placeholder="+91 98765 43210"
            />
            <FieldError id="phone-error">{errors.phone}</FieldError>
            <p className="mt-1.5 text-xs text-slate-500">Include the country code if you are outside India.</p>
            {channels.whatsapp && (
              <label className="mt-3 flex items-start gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  checked={form.whatsappConsent}
                  onChange={(e) => setForm({ ...form, whatsappConsent: e.target.checked })}
                />
                <span>
                  Send me placement drive alerts on WhatsApp at this number. I'll confirm it with a code sent on WhatsApp, and can stop any time by replying STOP.
                </span>
              </label>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set("password")}
              placeholder="8+ characters"
              invalid={!!errors.password}
              describedBy={errors.password ? "password-error" : undefined}
            />
            <FieldError id="password-error">{errors.password}</FieldError>
            {!errors.password && <PasswordStrength password={form.password} />}
          </div>
          <div>
            <label htmlFor="confirm" className={labelClass}>Confirm password</label>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              value={form.confirm}
              onChange={set("confirm")}
              invalid={!!errors.confirm}
              describedBy={errors.confirm ? "confirm-error" : undefined}
            />
            <FieldError id="confirm-error">{errors.confirm}</FieldError>
          </div>
        </div>

        <button type="submit" disabled={busy} className={primaryButton}>
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="text-xs leading-5 text-slate-500">
          By creating an account you agree to the{" "}
          <Link to="/terms" className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900">Terms and Conditions</Link>
          {" "}and confirm you have read the{" "}
          <Link to="/privacy" className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900">Privacy Policy</Link>.
        </p>

        <p className="text-xs text-slate-500">
          Administrator accounts are created by your institution. Contact the placement cell if you need one.
        </p>
      </form>
    </AuthFrame>
  );
}

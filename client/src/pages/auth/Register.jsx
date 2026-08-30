import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ROLES = [
  {
    value: "student",
    label: "Student",
    hint: "Build your profile and track placement readiness",
  },
  {
    value: "faculty",
    label: "Faculty",
    hint: "Monitor batch-level placement analytics",
  },
  {
    value: "placement_officer",
    label: "Placement Officer",
    hint: "Post openings, run drives and record official results",
  },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    role: "student",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");

    if (!form.name.trim()) return setError("Name is required");
    if (!form.email.trim()) return setError("Email is required");
    if (form.password.length < 8)
      return setError("Password must be at least 8 characters");
    if (form.password !== form.confirm)
      return setError("Passwords do not match");

    setBusy(true);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
      navigate(`/${user.role}`);
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
  const label = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">CareerCore</h1>
          <p className="text-sm text-slate-500 mt-1">
            Placement Intelligence Platform
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Create an account
          </h2>

          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className={label}>I am a</label>
          <div className="space-y-2 mb-5">
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => setForm({ ...form, role: r.value })}
                className={`w-full text-left px-4 py-2.5 rounded-lg border transition-colors ${
                  form.role === r.value
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-medium text-slate-800">{r.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{r.hint}</p>
              </button>
            ))}
          </div>

          <label className={label}>Full name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={`${input} mb-4`}
            placeholder="Kiran Bhat"
          />

          <label className={label}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={`${input} mb-4`}
            placeholder="you@mite.ac.in"
          />

          <label className={label}>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={`${input} mb-1`}
            placeholder="At least 8 characters"
          />
          <p className="text-xs text-slate-400 mb-4">Minimum 8 characters</p>

          <label className={label}>Confirm password</label>
          <input
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className={`${input} mb-5`}
          />

          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-2 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>

          {form.role === "recruiter" && (
            <p className="text-xs text-amber-600 text-center mt-3">
              Recruiter accounts require admin verification before posting jobs.
            </p>
          )}

          <p className="text-sm text-slate-500 text-center mt-4">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-slate-900 font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

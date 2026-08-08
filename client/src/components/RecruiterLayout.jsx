import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/recruiter", label: "Jobs", end: true },
  { to: "/recruiter/post", label: "Post Job" },
  { to: "/recruiter/company", label: "Company" },
];

export default function RecruiterLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">CareerCore</h1>
              <p className="text-sm text-slate-500">{user?.name} · Recruiter</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
          <nav className="flex gap-1 -mb-px">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `px-4 py-2 text-sm border-b-2 transition-colors ${
                    isActive
                      ? "border-slate-900 text-slate-900 font-medium"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

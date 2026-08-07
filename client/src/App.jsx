import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/auth/Login";
import StudentDashboard from "./pages/student/Dashboard";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? `/${user.role}` : "/login"} replace />;
}

function Placeholder({ title }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <button
          onClick={logout}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-slate-600">
          Signed in as <strong>{user?.name}</strong> ({user?.email})
        </p>
        <p className="text-slate-600 mt-1">
          Role: <strong>{user?.role}</strong>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/student"
            element={
              <ProtectedRoute roles={["student"]}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recruiter"
            element={
              <ProtectedRoute roles={["recruiter"]}>
                <Placeholder title="Recruiter Portal" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/faculty"
            element={
              <ProtectedRoute roles={["faculty"]}>
                <Placeholder title="Faculty Analytics" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["admin"]}>
                <Placeholder title="Admin Panel" />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

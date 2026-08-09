import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/auth/Login";
import StudentDashboard from "./pages/student/Dashboard";
import Profile from "./pages/student/Profile";
import Skills from "./pages/student/Skills";
import Aptitude from "./pages/student/Aptitude";
import RecruiterLayout from "./components/RecruiterLayout";
import RecruiterJobs from "./pages/recruiter/Jobs";
import PostJob from "./pages/recruiter/PostJob";
import Company from "./pages/recruiter/Company";
import StudentJobs from "./pages/student/Jobs";
import Applications from "./pages/student/Applications";
import FacultyLayout from "./components/FacultyLayout";
import Analytics from "./pages/faculty/Analytics";
import FacultyStudents from "./pages/faculty/Students";
import AdminLayout from "./components/AdminLayout";
import AdminOverview from "./pages/admin/Overview";
import AdminUsers from "./pages/admin/Users";
import AdminSkills from "./pages/admin/Skills";
import AdminQuestions from "./pages/admin/Questions";
import Recommendations from "./pages/student/Recommendations";

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
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<StudentDashboard />} />
            <Route path="profile" element={<Profile />} />
            <Route path="skills" element={<Skills />} />
            <Route path="aptitude" element={<Aptitude />} />
            <Route path="jobs" element={<StudentJobs />} />
            <Route path="applications" element={<Applications />} />
            <Route path="learn" element={<Recommendations />} />
          </Route>

          <Route
            path="/recruiter"
            element={
              <ProtectedRoute roles={["recruiter"]}>
                <RecruiterLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<RecruiterJobs />} />
            <Route path="post" element={<PostJob />} />
            <Route path="company" element={<Company />} />
          </Route>
          
         <Route path="/faculty" element={
            <ProtectedRoute roles={["faculty", "admin"]}><FacultyLayout /></ProtectedRoute>
          }>
            <Route index element={<Analytics />} />
            <Route path="students" element={<FacultyStudents />} />
          </Route>
          <Route path="/admin" element={
            <ProtectedRoute roles={["admin"]}><AdminLayout /></ProtectedRoute>
          }>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="skills" element={<AdminSkills />} />
            <Route path="questions" element={<AdminQuestions />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

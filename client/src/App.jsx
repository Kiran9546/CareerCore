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
import Register from "./pages/auth/Register";
import Resume from "./pages/student/Resume";
import StudentPlacement from "./pages/student/Placement";
import PlacementLayout from "./components/PlacementLayout";
import PlacementOverview from "./pages/placement/Overview";
import PlacementDrives from "./pages/placement/Drives";
import PlacementDriveDetail from "./pages/placement/DriveDetail";
import PlacementJobs from "./pages/placement/Jobs";
import PlacementStudents from "./pages/placement/Students";
import PlacementProfile from "./pages/placement/PlacementProfile";
import PlacementCompare from "./pages/placement/Compare";
import PlacementMissed from "./pages/placement/Missed";
import PlacementResults from "./pages/placement/Results";
import FacultyResults from "./pages/faculty/Results";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? `/${user.role}` : "/login"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

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
            <Route path="resume" element={<Resume />} />
            <Route path="skills" element={<Skills />} />
            <Route path="aptitude" element={<Aptitude />} />
            <Route path="jobs" element={<StudentJobs />} />
            <Route path="applications" element={<Applications />} />
            <Route path="learn" element={<Recommendations />} />
            <Route path="placement" element={<StudentPlacement />} />
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

          <Route
            path="/faculty"
            element={
              <ProtectedRoute roles={["faculty", "admin"]}>
                <FacultyLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Analytics />} />
            <Route path="students" element={<FacultyStudents />} />
            <Route path="results" element={<FacultyResults />} />
          </Route>

          {/* The path must equal the role string — Home and ProtectedRoute
              both redirect to `/${user.role}`. */}
          <Route
            path="/placement_officer"
            element={
              <ProtectedRoute roles={["placement_officer", "admin"]}>
                <PlacementLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PlacementOverview />} />
            <Route path="drives" element={<PlacementDrives />} />
            <Route path="drives/:id" element={<PlacementDriveDetail />} />
            <Route path="jobs" element={<PlacementJobs />} />
            <Route path="students" element={<PlacementStudents />} />
            <Route path="students/:id" element={<PlacementProfile />} />
            <Route path="compare" element={<PlacementCompare />} />
            <Route path="missed" element={<PlacementMissed />} />
            <Route path="results" element={<PlacementResults />} />
          </Route>
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["admin"]}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
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

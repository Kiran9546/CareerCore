import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import SeoManager from "./seo/SeoManager";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";
import { workspacePath } from "./config/roles";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import Landing from "./pages/Landing";
import Toaster from "./components/ui/Toaster";
import ConfirmHost from "./components/ui/ConfirmHost";

// Each page is its own chunk: a student never downloads the placement
// officer or admin screens, and a visitor to the public pages never
// downloads the signed-in workspace shell at all.
const Layout = lazy(() => import("./components/Layout"));
const FacultyLayout = lazy(() => import("./components/FacultyLayout"));
const AdminLayout = lazy(() => import("./components/AdminLayout"));
const PlacementLayout = lazy(() => import("./components/PlacementLayout"));
const Login = lazy(() => import("./pages/auth/Login"));
const StudentDashboard = lazy(() => import("./pages/student/Dashboard"));
const Profile = lazy(() => import("./pages/student/Profile"));
const Skills = lazy(() => import("./pages/student/Skills"));
const Aptitude = lazy(() => import("./pages/student/Aptitude"));
const Analytics = lazy(() => import("./pages/faculty/Analytics"));
const FacultyStudents = lazy(() => import("./pages/faculty/Students"));
const AdminOverview = lazy(() => import("./pages/admin/Overview"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminSkills = lazy(() => import("./pages/admin/Skills"));
const AdminQuestions = lazy(() => import("./pages/admin/Questions"));
const Recommendations = lazy(() => import("./pages/student/Recommendations"));
const Register = lazy(() => import("./pages/auth/Register"));
const Resume = lazy(() => import("./pages/student/Resume"));
const StudentPlacement = lazy(() => import("./pages/student/Placement"));
const PlacementOverview = lazy(() => import("./pages/placement/Overview"));
const PlacementDrives = lazy(() => import("./pages/placement/Drives"));
const PlacementDriveDetail = lazy(() => import("./pages/placement/DriveDetail"));
const PlacementDriveForm = lazy(() => import("./pages/placement/DriveForm"));
const StudentDrives = lazy(() => import("./pages/student/Drives"));
const StudentDriveView = lazy(() => import("./pages/student/DriveView"));
const StudentNotifications = lazy(() => import("./pages/student/Notifications"));
const PlacementStudents = lazy(() => import("./pages/placement/Students"));
const PlacementProfile = lazy(() => import("./pages/placement/PlacementProfile"));
const PlacementCompare = lazy(() => import("./pages/placement/Compare"));
const PlacementResults = lazy(() => import("./pages/placement/Results"));
const FacultyResults = lazy(() => import("./pages/faculty/Results"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const Terms = lazy(() => import("./pages/legal/Terms"));
const Contact = lazy(() => import("./pages/Contact"));
const AdminMessages = lazy(() => import("./pages/admin/Messages"));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
    </div>
  );
}

/** /placement_officer/x → /placement-officer/x, keeping the rest of the URL. */
function LegacyPlacementRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={pathname.replace(/^\/placement_officer/, "/placement-officer") + search + hash} replace />;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  // Signed-in users go straight to their workspace; visitors see the landing page.
  return user ? <Navigate to={workspacePath(user.role)} replace /> : <Landing />;
}

/**
 * The routes, without a router, so the build can render the public pages
 * with a static router (src/entry-server.jsx) and the browser with
 * BrowserRouter.
 */
export function AppRoutes() {
  return (
    <>
          <SeoManager />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/contact" element={<Contact />} />

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
                <Route path="learn" element={<Recommendations />} />
                <Route path="placement" element={<StudentPlacement />} />
                <Route path="drives" element={<StudentDrives />} />
                <Route path="drives/:id" element={<StudentDriveView />} />
                <Route path="notifications" element={<StudentNotifications />} />
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

              {/* Before the URL used hyphens it was /placement_officer; old
                  bookmarks and links still arrive there. */}
              <Route path="/placement_officer/*" element={<LegacyPlacementRedirect />} />
              <Route
                path="/placement-officer"
                element={
                  <ProtectedRoute roles={["placement_officer", "admin"]}>
                    <PlacementLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<PlacementOverview />} />
                <Route path="drives" element={<PlacementDrives />} />
                <Route path="drives/new" element={<PlacementDriveForm />} />
                <Route path="drives/:id" element={<PlacementDriveDetail />} />
                <Route path="drives/:id/edit" element={<PlacementDriveForm />} />
                <Route path="students" element={<PlacementStudents />} />
                <Route path="students/:id" element={<PlacementProfile />} />
                <Route path="compare" element={<PlacementCompare />} />
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
                <Route path="messages" element={<AdminMessages />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Toaster />
          <ConfirmHost />
    </>
  );
}

/**
 * `deferSession`: the page was pre-rendered as signed out, so the saved
 * session is applied just after hydration rather than during it.
 */
export default function App({ deferSession = false }) {
  return (
    <ErrorBoundary>
      <AuthProvider deferSession={deferSession}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

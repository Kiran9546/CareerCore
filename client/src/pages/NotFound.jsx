import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import Logo from "../components/ui/Logo";
import { SiteFooter } from "../components/PublicChrome";
import { workspacePath } from "../config/roles";

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <Logo />
        <p className="mt-12 text-sm font-semibold text-indigo-600">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-3 max-w-sm text-sm text-slate-600">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link
          to={user ? workspacePath(user.role) : "/"}
          className="mt-8 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {user ? "Back to your workspace" : "Back to home"}
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

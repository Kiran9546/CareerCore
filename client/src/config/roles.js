/**
 * The user categories CareerCore serves, and the workspace each one gets.
 *
 * One definition drives the sidebar, the role badges, the landing page and
 * the sign-up form, so adding a category or a page means editing one place.
 * `path` is the workspace URL: lowercase words joined by hyphens. Use
 * workspacePath(role) rather than building it from the role string.
 */
export const ROLE_META = {
  student: {
    label: "Student",
    path: "/student",
    icon: "user",
    accent: "bg-sky-500",
    badge: "bg-sky-50 text-sky-700 ring-sky-200",
    tagline: "Build your profile, close skill gaps and track every drive you apply to.",
    selfRegister: true,
    nav: [
      { to: "/student", label: "Dashboard", icon: "dashboard", end: true },
      { to: "/student/profile", label: "Profile", icon: "user" },
      { to: "/student/resume", label: "Resume", icon: "file" },
      { to: "/student/skills", label: "Skills", icon: "target" },
      { to: "/student/aptitude", label: "Aptitude test", icon: "brain" },
      { to: "/student/learn", label: "Learning", icon: "book" },
      { to: "/student/drives", label: "Drives", icon: "briefcase" },
      { to: "/student/placement", label: "My placement", icon: "award" },
      { to: "/student/notifications", label: "Notifications", icon: "bell" },
    ],
  },
  faculty: {
    label: "Faculty",
    path: "/faculty",
    icon: "book",
    accent: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    tagline: "Follow your department's readiness and submit round results for review.",
    selfRegister: true,
    nav: [
      { to: "/faculty", label: "Analytics", icon: "chart", end: true },
      { to: "/faculty/students", label: "Students", icon: "users" },
      { to: "/faculty/results", label: "Results", icon: "check" },
    ],
  },
  placement_officer: {
    label: "Placement Officer",
    path: "/placement-officer",
    icon: "briefcase",
    accent: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
    tagline: "Run drives end to end: eligibility, rounds, results, offers and reports.",
    selfRegister: true,
    nav: [
      { to: "/placement-officer", label: "Overview", icon: "dashboard", end: true },
      { to: "/placement-officer/drives", label: "Drives", icon: "briefcase" },
      { to: "/placement-officer/students", label: "Students", icon: "users" },
      { to: "/placement-officer/results", label: "Results", icon: "check" },
    ],
  },
  admin: {
    label: "Administrator",
    path: "/admin",
    icon: "shield",
    accent: "bg-violet-500",
    badge: "bg-violet-50 text-violet-700 ring-violet-200",
    tagline: "Manage accounts, the skill taxonomy and the aptitude question bank.",
    selfRegister: false,
    nav: [
      { to: "/admin", label: "Overview", icon: "dashboard", end: true },
      { to: "/admin/users", label: "Users", icon: "users" },
      { to: "/admin/skills", label: "Skill taxonomy", icon: "tag" },
      { to: "/admin/questions", label: "Question bank", icon: "help" },
      { to: "/admin/messages", label: "Messages", icon: "mail" },
    ],
  },
};

/** Workspaces a role may open; admins can step into the others to support them. */
export const WORKSPACES_FOR = {
  student: ["student"],
  faculty: ["faculty"],
  placement_officer: ["placement_officer"],
  admin: ["admin", "placement_officer", "faculty"],
};

export const roleLabel = (role) => ROLE_META[role]?.label ?? role;

/** The URL of a role's own workspace, where sign-in lands. */
export const workspacePath = (role) => ROLE_META[role]?.path ?? "/";

import AppShell from "./AppShell";

/** Shell for the student workspace; sections are defined in config/roles.js. */
export default function Layout() {
  return <AppShell workspace="student" />;
}

import AppShell from "./AppShell";

/** Shell for the administrator workspace; sections are defined in config/roles.js. */
export default function AdminLayout() {
  return <AppShell workspace="admin" />;
}

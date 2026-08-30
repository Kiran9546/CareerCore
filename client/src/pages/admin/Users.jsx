import { useEffect, useState } from "react";
import api from "../../api/axios";

const ROLE_STYLE = {
  student: "bg-slate-100 text-slate-700",
  recruiter: "bg-blue-100 text-blue-700",
  faculty: "bg-green-100 text-green-700",
  placement_officer: "bg-emerald-100 text-emerald-700",
  admin: "bg-amber-100 text-amber-700",
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");

  const [error, setError] = useState("");

  const load = () => {
    api.get(`/admin/users${role ? `?role=${role}` : ""}`)
      .then((r) => { setUsers(r.data.users); setError(""); })
      .catch((e) => {
        setUsers([]);
        setError(e.response?.data?.message || "Could not load users");
      });
  };

  useEffect(load, [role]);

  const toggle = async (id) => {
    try {
      await api.patch(`/admin/users/${id}/toggle`);
    } catch (e) {
      setError(e.response?.data?.message || "Could not update the account");
    }
    load();
  };

  const verify = async (id) => {
    try {
      await api.patch(`/admin/users/${id}/verify`);
    } catch (e) {
      setError(e.response?.data?.message || "Could not update verification");
    }
    load();
  };

  const shown = users.filter((u) =>
    !search ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300" />
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white">
          <option value="">All roles</option>
          {["student", "recruiter", "faculty", "placement_officer", "admin"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-slate-500 mb-4">{shown.length} users</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 100).map((u) => (
              <tr key={u._id} className="border-b border-slate-100">
                <td className="py-2.5 text-slate-800">{u.name}</td>
                <td className="py-2.5 text-slate-500 text-xs">{u.email}</td>
                <td className="py-2.5">
                  <span className={`px-2 py-0.5 rounded text-xs ${ROLE_STYLE[u.role]}`}>{u.role}</span>
                </td>
                <td className="py-2.5">
                  <div className="flex gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      u.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {u.isActive ? "active" : "disabled"}
                    </span>
                    {u.role === "recruiter" && !u.isVerified && (
                      <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">
                        unverified
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5">
                  <div className="flex gap-2">
                    <button onClick={() => toggle(u._id)}
                      className="text-xs text-slate-500 hover:text-slate-900 underline">
                      {u.isActive ? "Disable" : "Enable"}
                    </button>
                    {u.role === "recruiter" && (
                      <button onClick={() => verify(u._id)}
                        className="text-xs text-slate-500 hover:text-slate-900 underline">
                        {u.isVerified ? "Unverify" : "Verify"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length > 100 && (
          <p className="text-xs text-slate-400 mt-3">Showing first 100 of {shown.length}</p>
        )}
      </div>
    </div>
  );
}
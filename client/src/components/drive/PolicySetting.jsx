import { useEffect, useState } from "react";
import api from "../../api/axios";
import { ui } from "../../utils/placement";
import { confirmAction } from "../ui/confirm";

/**
 * The college's participation policy for students who already hold a final
 * selection. Enforced on the server at registration; changes are audited.
 */
export default function PolicySetting() {
  const [policy, setPolicy] = useState("");
  const [options, setOptions] = useState({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    api
      .get("/placement/policy")
      .then((r) => {
        setPolicy(r.data.policy);
        setOptions(r.data.options);
      })
      .catch(() => {});
  }, []);

  const change = async (next) => {
    if (!(await confirmAction(`Change the participation policy to: "${options[next]}"?`))) return;
    try {
      const r = await api.put("/placement/policy", { policy: next });
      setPolicy(r.data.policy);
      setMessage("Policy updated");
    } catch (e) {
      setMessage(e.response?.data?.message || "Could not update the policy");
    }
  };

  if (!policy) return null;
  return (
    <div className={`${ui.card} flex flex-wrap items-center justify-between gap-3`}>
      <div>
        <h3 className="font-semibold text-slate-900">Participation policy</h3>
        <p className="text-xs text-slate-500">What a student who is already finally selected may do</p>
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
        {message && <span className="text-xs text-slate-500">{message}</span>}
        <select className={ui.select} value={policy} onChange={(e) => change(e.target.value)} aria-label="Participation policy">
          {Object.entries(options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
    </div>
  );
}

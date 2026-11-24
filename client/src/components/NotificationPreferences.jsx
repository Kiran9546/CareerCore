import { useEffect, useState } from "react";
import api from "../api/axios";
import { toast } from "./ui/toast";
import { errorMessage, formatDateTime } from "../utils/placement";

const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
const labelCls = "block text-sm font-medium text-slate-700 mb-1";

/**
 * Where placement drive alerts reach the student. Email always goes to the
 * account's registered address; WhatsApp is opt-in with explicit consent,
 * recorded with a timestamp on the server.
 */
export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState(null);
  const [number, setNumber] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/student/notification-preferences")
      .then((r) => {
        setPrefs(r.data);
        setNumber(r.data.whatsapp.number || r.data.phone || "");
        setOptIn(r.data.whatsapp.optIn);
      })
      .catch((e) => setError(errorMessage(e, "Could not load notification settings")));
  }, []);

  const save = async () => {
    setError("");
    if (optIn && !number.trim()) return setError("Enter your WhatsApp number to turn on WhatsApp alerts.");
    setBusy(true);
    try {
      const r = await api.put("/student/notification-preferences", {
        whatsappOptIn: optIn,
        whatsappNumber: number.trim(),
      });
      setPrefs(r.data);
      setNumber(r.data.whatsapp.number || number);
      toast(optIn ? "WhatsApp alerts turned on" : "Notification settings saved");
    } catch (e) {
      setError(errorMessage(e, "Could not save notification settings"));
    } finally {
      setBusy(false);
    }
  };

  if (!prefs) {
    return error ? (
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-red-700" role="alert">{error}</p>
      </section>
    ) : null;
  }

  const wa = prefs.whatsapp;
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6" aria-labelledby="np-heading">
      <h2 id="np-heading" className="font-semibold text-slate-900 mb-1">Placement drive alerts</h2>
      <p className="text-sm text-slate-500 mb-4">
        When you become eligible for a new drive you are notified here in CareerCore
        {prefs.email.enabled ? <> and by email at <span className="font-medium text-slate-700">{prefs.email.address}</span></> : null}.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="np-wa">WhatsApp number</label>
          <input id="np-wa" type="tel" inputMode="tel" autoComplete="tel" value={number}
            onChange={(e) => setNumber(e.target.value)} className={inputCls} placeholder="+91 98765 43210" />
          <p className="text-xs text-slate-400 mt-1">Include the country code if you are outside India.</p>
        </div>
      </div>

      <label className="flex items-start gap-3 mt-4 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)} />
        <span>{wa.consentText}</span>
      </label>
      {!wa.available && (
        <p className="text-xs text-amber-700 mt-2">
          WhatsApp alerts are not switched on by the placement cell yet. Your choice is saved and used once they are.
        </p>
      )}
      {wa.optIn && wa.consentAt && (
        <p className="text-xs text-slate-400 mt-2">WhatsApp alerts on since {formatDateTime(wa.consentAt)}.</p>
      )}
      {!wa.optIn && wa.optOutAt && (
        <p className="text-xs text-slate-400 mt-2">WhatsApp alerts turned off on {formatDateTime(wa.optOutAt)}.</p>
      )}

      <div className="flex items-center gap-3 mt-5">
        <button onClick={save} disabled={busy}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save alert settings"}
        </button>
        {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
      </div>
    </section>
  );
}

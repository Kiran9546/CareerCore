import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/useAuth";
import { toast } from "./ui/toast";
import { errorMessage, formatDateTime } from "../utils/placement";

const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900";
const labelCls = "block text-sm font-medium text-slate-700 mb-1";
const primaryCls = "px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50";
const secondaryCls = "px-4 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-50";

function Badge({ ok, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-emerald-700" : "text-amber-700"}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * The student's contact details and placement alert settings.
 *
 * Email: the address they registered with, its verification, and whether
 * placement drive emails are on (in-app notifications always stay on).
 * Mobile number: when WhatsApp alerts are not in use, simply the number on
 * the account. Otherwise —
 * WhatsApp: a number they prove is theirs with a 6-digit code sent there on
 * WhatsApp. Asking for the code, with the consent wording beside the
 * button, is how they turn WhatsApp alerts on; nothing is sent to a number
 * until its code is entered. In sandbox mode nothing is sent at all and the
 * simulated code is shown here, labelled as such.
 *
 * `pending` (optional) is the verification result from sign-up, so a new
 * student lands straight on the code entry.
 */
export default function NotificationPreferences({ pending }) {
  const { refreshUser } = useAuth() || {};
  const [contact, setContact] = useState(null);
  const [number, setNumber] = useState("");
  const [step, setStep] = useState(pending?.whatsapp?.sentTo ? "code" : "idle"); // idle | edit | code
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState(pending?.whatsapp?.devCode || "");
  const [sentTo, setSentTo] = useState(pending?.whatsapp?.sentTo || "");
  const [devLink, setDevLink] = useState(pending?.email?.devLink || "");
  const [error, setError] = useState(pending?.email?.reason || pending?.whatsapp?.reason || "");
  // "Sent to … at …": the server's confirmation that a real email went out.
  const [emailNote, setEmailNote] = useState(pending?.email?.sent ? "Verification email sent. Check your inbox and the Spam folder." : "");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api
      .get("/auth/contact")
      .then((r) => {
        setContact(r.data);
        setNumber(r.data.phone.number || "");
      })
      .catch((e) => setError(errorMessage(e, "Could not load your contact details")));
  }, []);

  const run = async (key, fn) => {
    setError("");
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e, "Something went wrong. Please try again"));
    } finally {
      setBusy("");
    }
  };

  const sendCode = () =>
    run("send", async () => {
      if (!number.trim()) throw Object.assign(new Error(), { response: { data: { message: "Enter your WhatsApp number" } } });
      const r = await api.post("/auth/phone/send-code", { phone: number.trim(), consent: true });
      setSentTo(r.data.sentTo);
      setDevCode(r.data.devCode || "");
      setCode("");
      setStep("code");
      toast(r.data.simulated ? "Sandbox mode: code simulated, not sent" : `Code sent on WhatsApp to ${r.data.sentTo}`);
    });

  const verify = () =>
    run("verify", async () => {
      const r = await api.post("/auth/phone/verify", { code: code.trim() });
      setContact(r.data);
      setNumber(r.data.phone.number);
      setStep("idle");
      setDevCode("");
      const n = r.data.catchUp?.queued || 0;
      toast(n ? `WhatsApp verified. ${n} open drive alert${n === 1 ? " is" : "s are"} on the way.` : "WhatsApp verified. Alerts are on.");
      refreshUser?.().catch(() => {});
    });

  const setOptIn = (optIn) =>
    run(optIn ? "on" : "off", async () => {
      const r = await api.put("/auth/contact/whatsapp", { optIn });
      setContact(r.data);
      toast(optIn ? "WhatsApp alerts turned on" : "WhatsApp alerts turned off");
      refreshUser?.().catch(() => {});
    });

  const setEmailAlerts = (optIn) =>
    run(optIn ? "email-on" : "email-off", async () => {
      const r = await api.put("/auth/contact/email", { optIn });
      setContact(r.data);
      const n = r.data.catchUp?.queued || 0;
      toast(
        optIn
          ? n
            ? `Placement emails turned on. ${n} open drive email${n === 1 ? " is" : "s are"} on the way.`
            : "Placement emails turned on"
          : "Placement emails turned off. You will still see every alert in CareerCore.",
      );
    });

  const saveNumber = () =>
    run("phone", async () => {
      if (!number.trim()) throw Object.assign(new Error(), { response: { data: { message: "Enter your mobile number" } } });
      const r = await api.put("/auth/contact/phone", { phone: number.trim() });
      setContact(r.data);
      setNumber(r.data.phone.number);
      setStep("idle");
      toast("Mobile number saved");
    });

  const resendEmail = () =>
    run("email", async () => {
      setEmailNote("");
      const r = await api.post("/auth/email/resend");
      if (r.data.alreadyVerified) {
        toast("Your email is already verified");
        api.get("/auth/contact").then((c) => setContact(c.data)).catch(() => {});
      } else if (r.data.simulated) {
        setDevLink(r.data.devLink || "");
        toast("Sandbox mode: verification email simulated, not sent");
      } else if (r.data.sent) {
        setDevLink("");
        setEmailNote(`Verification email sent to ${contact.email.address} at ${formatDateTime(new Date())}. Check your inbox and the Spam folder; the link works once, for 48 hours.`);
        toast(`Verification email sent to ${contact.email.address}`);
      } else throw Object.assign(new Error(), { response: { data: { message: r.data.reason || "The verification email could not be sent" } } });
    });

  if (!contact) {
    return error ? (
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-red-700" role="alert">{error}</p>
      </section>
    ) : null;
  }

  const wa = contact.whatsapp;
  const sandbox = contact.sandbox ?? wa.sandbox;
  const showNumberForm = step === "edit" || (step === "idle" && !contact.phone.verified);
  const emailOn = contact.email.optIn !== false;

  return (
    <section id="contact" className="bg-white rounded-xl border border-slate-200 p-6 scroll-mt-20" aria-labelledby="np-heading">
      <h2 id="np-heading" className="font-semibold text-slate-900 mb-1">Contact & placement alerts</h2>
      <p className="text-sm text-slate-500 mb-5">
        {wa.available
          ? "New drives you are eligible for are announced here in CareerCore, by email, and on WhatsApp once your number is verified."
          : "New drives you are eligible for are announced here in CareerCore and by email."}
      </p>

      {sandbox && (
        <p className="mb-4 rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-800">
          {wa.available
            ? "Sandbox mode: this server simulates email and WhatsApp. Nothing is actually sent; codes and links are shown here for testing."
            : "Sandbox mode: this server simulates email. Nothing is actually sent; links are shown here for testing."}
        </p>
      )}

      {/* Email */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-700">Email</p>
          <p className="text-sm text-slate-900">{contact.email.address}</p>
          <Badge ok={contact.email.verified}>{contact.email.verified ? "Verified" : "Not verified"}</Badge>
        </div>
        {!contact.email.verified && (
          <button className={secondaryCls} onClick={resendEmail} disabled={Boolean(busy)}>
            {busy === "email" ? "Sending…" : "Send verification email"}
          </button>
        )}
      </div>
      {devLink && !contact.email.verified && (
        <p className="mt-2 text-xs text-sky-800">
          Simulated email. <a className="underline" href={devLink}>Open the verification link</a>
        </p>
      )}
      {emailNote && !contact.email.verified && (
        <p className="mt-2 text-xs text-emerald-700" role="status">{emailNote}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-sm text-slate-700">Placement drive emails</p>
          <Badge ok={emailOn}>{emailOn ? "On" : "Off: alerts appear in CareerCore only"}</Badge>
          {emailOn && contact.email.requireVerified && !contact.email.verified && (
            <p className="text-xs text-amber-700 mt-1">Verify your email to start receiving them.</p>
          )}
        </div>
        {emailOn ? (
          <button className={secondaryCls} onClick={() => setEmailAlerts(false)} disabled={Boolean(busy)}>
            {busy === "email-off" ? "Saving…" : "Turn off placement emails"}
          </button>
        ) : (
          <button className={primaryCls} onClick={() => setEmailAlerts(true)} disabled={Boolean(busy)}>
            {busy === "email-on" ? "Saving…" : "Turn on placement emails"}
          </button>
        )}
      </div>

      {/* Mobile number only, when WhatsApp alerts are not in use */}
      {!wa.available && (
        <div className="pt-4">
          <p className="text-sm font-medium text-slate-700">Mobile number</p>
          {step === "edit" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 items-end">
              <div>
                <label className={labelCls} htmlFor="np-phone">Mobile number</label>
                <input id="np-phone" type="tel" inputMode="tel" autoComplete="tel" value={number}
                  onChange={(e) => setNumber(e.target.value)} className={inputCls} placeholder="+91 98765 43210" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={primaryCls} onClick={saveNumber} disabled={Boolean(busy)}>
                  {busy === "phone" ? "Saving…" : "Save number"}
                </button>
                <button className={secondaryCls} onClick={() => { setNumber(contact.phone.number); setStep("idle"); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-900">{contact.phone.number || "Not given"}</p>
              <button className={secondaryCls} onClick={() => setStep("edit")} disabled={Boolean(busy)}>
                {contact.phone.number ? "Change number" : "Add number"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* WhatsApp: only when the placement cell uses it */}
      {wa.available && <div className="pt-4">
        <p className="text-sm font-medium text-slate-700">WhatsApp</p>

        {contact.phone.verified && step === "idle" && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-900">{contact.phone.number}</p>
              {wa.active ? (
                <Badge ok>Verified · alerts on{wa.consentAt ? ` since ${formatDateTime(wa.consentAt)}` : ""}</Badge>
              ) : (
                <Badge ok={false}>Verified · alerts off</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {wa.active ? (
                <button className={secondaryCls} onClick={() => setOptIn(false)} disabled={Boolean(busy)}>Stop WhatsApp alerts</button>
              ) : (
                <button className={primaryCls} onClick={() => setOptIn(true)} disabled={Boolean(busy) || !wa.available}>Turn on WhatsApp alerts</button>
              )}
              <button className={secondaryCls} onClick={() => setStep("edit")} disabled={Boolean(busy)}>Change number</button>
            </div>
          </div>
        )}

        {showNumberForm && (
          <div className="mt-2">
            {contact.phone.number && !contact.phone.verified && <Badge ok={false}>Not verified: no WhatsApp messages until you enter the code</Badge>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 items-end">
              <div>
                <label className={labelCls} htmlFor="np-wa">WhatsApp number</label>
                <input id="np-wa" type="tel" inputMode="tel" autoComplete="tel" value={number}
                  onChange={(e) => setNumber(e.target.value)} className={inputCls} placeholder="+91 98765 43210" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={primaryCls} onClick={sendCode} disabled={Boolean(busy) || !wa.available}>
                  {busy === "send" ? "Sending…" : "Send verification code"}
                </button>
                {step === "edit" && <button className={secondaryCls} onClick={() => setStep("idle")}>Cancel</button>}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">{wa.consentText}</p>
          </div>
        )}

        {step === "code" && (
          <div className="mt-2">
            <p className="text-sm text-slate-600">Enter the 6-digit code sent on WhatsApp to {sentTo}.</p>
            {devCode && (
              <p className="mt-1 text-xs text-sky-800">Sandbox mode: no WhatsApp was sent. Your code is <strong>{devCode}</strong>.</p>
            )}
            <div className="flex flex-wrap items-end gap-2 mt-2">
              <div>
                <label className={labelCls} htmlFor="np-code">Verification code</label>
                <input id="np-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${inputCls} w-40 tracking-widest`} />
              </div>
              <button className={primaryCls} onClick={verify} disabled={Boolean(busy) || code.length !== 6}>
                {busy === "verify" ? "Verifying…" : "Verify"}
              </button>
              <button className={secondaryCls} onClick={sendCode} disabled={Boolean(busy)}>Send a new code</button>
              <button className="text-sm text-slate-500 underline" onClick={() => setStep(contact.phone.verified ? "idle" : "edit")}>Use a different number</button>
            </div>
          </div>
        )}
      </div>}

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/useAuth";
import { PublicHeader, SiteFooter } from "../components/PublicChrome";
import FieldError from "../components/ui/FieldError";
import Icon from "../components/ui/Icon";
import Breadcrumbs from "../components/Breadcrumbs";
import { fieldClass, labelClass, primaryButton } from "./auth/authStyles";

const TOPICS = [
  ["account", "Account or sign-in"],
  ["placement", "Placement drives and results"],
  ["privacy", "Privacy and my data"],
  ["technical", "Something is not working"],
  ["other", "Something else"],
];

const MAX = 2000;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Same rules the server applies (contact.controller.js). */
const validate = (f) => {
  const e = {};
  if (f.name.trim().length < 2) e.name = "Enter your name.";
  if (!EMAIL_RX.test(f.email.trim())) e.email = "Enter a valid email address, like name@college.edu.";
  if (!f.topic) e.topic = "Choose what your message is about.";
  const len = f.message.trim().length;
  if (len < 10) e.message = "Write at least 10 characters so we can help.";
  else if (len > MAX) e.message = `Keep your message under ${MAX} characters.`;
  return e;
};

export default function Contact() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: user?.name || "", email: user?.email || "", topic: "", message: "", website: "" });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const sending = useRef(false);
  const formRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const set = (k) => (e) => {
    const next = { ...form, [k]: e.target.value };
    setForm(next);
    // Once a field has been left, re-check it as the user corrects it.
    if (touched[k]) setErrors((prev) => ({ ...prev, [k]: validate(next)[k] }));
  };
  const blur = (k) => () => {
    setTouched((t) => ({ ...t, [k]: true }));
    setErrors((prev) => ({ ...prev, [k]: validate(form)[k] }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending.current) return; // a double click sends one message
    setServerError("");
    const found = validate(form);
    setErrors(found);
    setTouched({ name: true, email: true, topic: true, message: true });
    if (Object.keys(found).length) {
      formRef.current?.querySelector(`[name="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }

    sending.current = true;
    setBusy(true);
    try {
      const r = await api.post("/contact", {
        name: form.name.trim(),
        email: form.email.trim(),
        topic: form.topic,
        message: form.message.trim(),
        website: form.website,
      });
      setSent({ at: r.data.receivedAt ? new Date(r.data.receivedAt) : new Date(), email: form.email.trim() });
      setForm((f) => ({ ...f, topic: "", message: "" }));
      setTouched({});
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setErrors(data.errors);
      setServerError(
        data?.message ||
          (err.request ? "Your message could not be sent because the server did not respond. Check your connection and try again." : "Your message could not be sent."),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const describedBy = (k) => (errors[k] ? `${k}-error` : undefined);
  const count = form.message.trim().length;

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <PublicHeader />
      <main className="flex-1">
        <div className="mx-auto grid grid-cols-1 max-w-5xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:px-8 lg:py-20">
          <div>
            <Breadcrumbs path="/contact" className="mb-6" />
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Contact</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Questions about your account, a placement drive, a result or your data go to the administrators of this
              CareerCore installation. They read every message and reply by email.
            </p>
            <ul className="mt-8 space-y-5 text-sm leading-6 text-slate-600">
              <li className="flex gap-3">
                <Icon name="briefcase" className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <span>
                  For a wrong drive result, include the company name and round so it can be checked against the
                  placement cell's records.
                </span>
              </li>
              <li className="flex gap-3">
                <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <span>Never send your password. Nobody at the institution will ask for it.</span>
              </li>
              <li className="flex gap-3">
                <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <span>
                  What you send is stored so it can be answered, as described in the{" "}
                  <Link to="/privacy#collect" className="font-medium text-indigo-700 underline underline-offset-4">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
            {sent ? (
              <div role="status" className="text-center sm:py-6">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  <Icon name="tick" className="h-6 w-6" strokeWidth={2.25} />
                </span>
                <h2 className="mt-5 text-lg font-semibold text-slate-900">Message sent</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Received at{" "}
                  {sent.at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. A reply will come
                  to <span className="font-medium text-slate-800">{sent.email}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => setSent(null)}
                  className="mt-6 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={submit} noValidate className="space-y-5" aria-describedby={serverError ? "contact-error" : undefined}>
                {serverError && (
                  <div id="contact-error" role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                    {serverError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="c-name" className={labelClass}>Name</label>
                    <input
                      id="c-name"
                      name="name"
                      autoComplete="name"
                      value={form.name}
                      onChange={set("name")}
                      onBlur={blur("name")}
                      maxLength={100}
                      aria-invalid={!!errors.name}
                      aria-describedby={describedBy("name")}
                      className={fieldClass(errors.name)}
                      required
                    />
                    <FieldError id="name-error">{errors.name}</FieldError>
                  </div>
                  <div>
                    <label htmlFor="c-email" className={labelClass}>Email address</label>
                    <input
                      id="c-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={set("email")}
                      onBlur={blur("email")}
                      maxLength={200}
                      aria-invalid={!!errors.email}
                      aria-describedby={describedBy("email")}
                      className={fieldClass(errors.email)}
                      placeholder="you@college.edu"
                      required
                    />
                    <FieldError id="email-error">{errors.email}</FieldError>
                  </div>
                </div>

                <div>
                  <label htmlFor="c-topic" className={labelClass}>What is it about?</label>
                  <select
                    id="c-topic"
                    name="topic"
                    value={form.topic}
                    onChange={set("topic")}
                    onBlur={blur("topic")}
                    aria-invalid={!!errors.topic}
                    aria-describedby={describedBy("topic")}
                    className={fieldClass(errors.topic)}
                    required
                  >
                    <option value="">Choose a topic…</option>
                    {TOPICS.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <FieldError id="topic-error">{errors.topic}</FieldError>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="c-message" className={labelClass}>Message</label>
                    <span className={`text-xs ${count > MAX ? "text-red-700" : "text-slate-500"}`} aria-live="polite">
                      {count}/{MAX}
                    </span>
                  </div>
                  <textarea
                    id="c-message"
                    name="message"
                    rows={6}
                    value={form.message}
                    onChange={set("message")}
                    onBlur={blur("message")}
                    aria-invalid={!!errors.message}
                    aria-describedby={describedBy("message")}
                    className={`${fieldClass(errors.message)} resize-y`}
                    required
                  />
                  <FieldError id="message-error">{errors.message}</FieldError>
                </div>

                {/* Hidden from people and screen readers; only bots fill it in. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                  <label htmlFor="c-website">Website</label>
                  <input id="c-website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
                </div>

                <button type="submit" disabled={busy} className={primaryButton}>
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                      Sending…
                    </>
                  ) : (
                    "Send message"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

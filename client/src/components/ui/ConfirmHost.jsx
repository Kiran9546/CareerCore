import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeConfirm } from "./confirm";
import usePresence from "../../motion/usePresence";
import Icon from "./Icon";

/**
 * Renders the question asked through confirmAction() as an accessible alert
 * dialog: focus moves to the confirm button and is kept inside the dialog,
 * Escape and the backdrop cancel, focus returns to where it was afterwards,
 * and the dialog scales in and out.
 */
export default function ConfirmHost() {
  const [ask, setAsk] = useState(null);
  const [last, setLast] = useState(null);
  const { render, closing } = usePresence(!!ask);
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const returnTo = useRef(null);

  useEffect(
    () =>
      subscribeConfirm((q) => {
        if (q) {
          returnTo.current = document.activeElement;
          setLast(q);
        }
        setAsk(q);
      }),
    [],
  );

  // Focus the confirm button when a question opens; give focus back after.
  useEffect(() => {
    if (ask) {
      const id = requestAnimationFrame(() => confirmRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    returnTo.current?.focus?.();
    return undefined;
  }, [ask]);

  if (!render || !last) return null;
  const q = ask || last;
  const answer = (v) => ask?.resolve(v);
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      answer(false);
    }
    if (e.key === "Tab") {
      // Two buttons: keep focus between them.
      e.preventDefault();
      (document.activeElement === confirmRef.current ? cancelRef : confirmRef).current?.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      <div className="modal-backdrop fixed inset-0 bg-slate-900/50" data-closing={closing ? "" : undefined} onClick={() => answer(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        data-closing={closing ? "" : undefined}
        inert={closing}
        className="modal-panel relative w-full max-w-md max-h-full overflow-y-auto rounded-xl bg-white p-5 shadow-(--cc-shadow-float) ring-1 ring-slate-200"
      >
        <div className="flex gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              q.danger ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"
            }`}
          >
            <Icon name={q.danger ? "shield" : "help"} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-semibold text-slate-900">
              {q.danger ? "Please confirm" : "Confirm this change"}
            </h2>
            <p id="confirm-message" className="mt-1 text-sm leading-6 text-slate-600">
              {q.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => answer(false)}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => answer(true)}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold text-white ${
              q.danger ? "bg-red-600 hover:bg-red-500" : "bg-slate-900 hover:bg-slate-800"
            }`}
          >
            {q.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

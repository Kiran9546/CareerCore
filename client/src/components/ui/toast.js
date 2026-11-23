/**
 * A tiny toast store: toast("Copied") from anywhere, rendered by <Toaster />.
 * Kept outside React state so non-component code (helpers) can raise one.
 */

let items = [];
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l(items));

export const dismissToast = (id) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

/** tone: "success" | "error" | "info" */
export const toast = (text, { tone = "success", duration = 3000 } = {}) => {
  const id = ++seq;
  items = [...items.slice(-2), { id, text, tone }]; // at most three on screen
  emit();
  setTimeout(() => dismissToast(id), duration);
  return id;
};

export const subscribeToasts = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Copy text to the clipboard and say whether it worked. Uses the async
 * Clipboard API, falling back to a hidden textarea where that API is missing
 * (plain-http sites, older browsers) or refused.
 */
export const copyText = async (text, label = "Copied to clipboard") => {
  const value = String(text ?? "");
  try {
    if (!navigator.clipboard?.writeText) throw new Error("no clipboard api");
    await navigator.clipboard.writeText(value);
    toast(label);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) throw new Error("copy refused");
      toast(label);
      return true;
    } catch {
      toast("Your browser blocked copying. Select the text and copy it manually.", { tone: "error", duration: 5000 });
      return false;
    }
  }
};

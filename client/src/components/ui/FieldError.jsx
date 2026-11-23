/** The message under an invalid field. `id` is what aria-describedby points at. */
export default function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} className="feedback-in mt-1.5 flex items-start gap-1.5 text-sm text-red-700">
      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

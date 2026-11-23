import { useRef } from "react";
import { useEntrance } from "./useInView";

/**
 * A heading whose words settle into place one after another.
 *
 * - mode="load": plays on first paint (the hero headline), from CSS alone,
 *   so it also works in the pre-rendered HTML.
 * - mode="view": plays when the heading scrolls into view; headings already
 *   on screen at load are left alone.
 *
 * The words stay ordinary text in one element: selectable, searchable and
 * read as a sentence by screen readers. With reduced motion nothing moves.
 */
export default function RevealWords({ as: Tag = "h2", text, mode = "view", className = "", ...rest }) {
  const ref = useRef(null);
  const state = useEntrance(ref);
  const words = text.split(" ");
  return (
    <Tag
      ref={ref}
      className={`${mode === "load" ? "words-load" : "words-view"} ${className}`}
      data-in={mode === "view" ? state : undefined}
      {...rest}
    >
      {words.map((w, i) => (
        <span key={i}>
          <span className="word" style={{ "--w": i }}>
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}

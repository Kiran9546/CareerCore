import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

const root = document.getElementById("root");

// Public pages arrive pre-rendered (scripts/prerender.mjs) and are hydrated in
// place, so their content shows before any JavaScript runs. Workspace pages
// arrive as an empty shell and are rendered here.
if (root.dataset.prerendered) {
  hydrateRoot(
    root,
    <StrictMode>
      <App deferSession />
    </StrictMode>,
  );
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

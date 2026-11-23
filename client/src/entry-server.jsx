import { StrictMode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { StaticRouter } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { AppRoutes } from "./App";

/**
 * Build-time rendering of one public page to HTML (used by
 * scripts/prerender.mjs). The tree matches App exactly, with a static router
 * in place of BrowserRouter, so the browser can hydrate it. prerender waits
 * for lazy-loaded pages, so the HTML holds the page's real content.
 */
export async function render(url) {
  const { prelude } = await prerenderToNodeStream(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider deferSession>
          <StaticRouter location={url}>
            <AppRoutes />
          </StaticRouter>
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
  let html = "";
  for await (const chunk of prelude) html += chunk;
  return html;
}

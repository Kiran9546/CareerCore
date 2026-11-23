import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Every VITE_* variable is compiled into the JavaScript that browsers
 * download, so it must never hold a credential. Stop the build if one looks
 * like it does: database or mail settings, secrets, tokens, private keys.
 */
const SECRET_NAME = /SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|CREDENTIAL|MONGO|JWT|SMTP|API_KEY|ACCESS_KEY/i;
const SECRET_VALUE = /^mongodb(\+srv)?:\/\/|-----BEGIN [A-Z ]*PRIVATE KEY-----|:\/\/[^/\s:@]+:[^/\s@]+@/i;
const assertNoSecretsInBundle = (env) => {
  const bad = Object.entries(env).filter(([k, v]) => SECRET_NAME.test(k) || SECRET_VALUE.test(String(v)));
  if (bad.length) {
    throw new Error(
      `These VITE_ variables would be published in the website's JavaScript and look like credentials: ${bad
        .map(([k]) => k)
        .join(", ")}. Keep secrets on the API server only.`,
    );
  }
};

export default defineConfig(({ isSsrBuild, mode }) => {
  assertNoSecretsInBundle(loadEnv(mode, process.cwd(), "VITE_"));
  return {
    plugins: [react(), tailwindcss()],
    build: {
      // No source maps in the public build: they would publish the source.
      // For an error-monitoring service, switch to "hidden" and upload the
      // maps to that service instead of deploying them.
      sourcemap: false,
      // The build-time render bundle (scripts/prerender.mjs) needs no static files.
      copyPublicDir: !isSsrBuild,
      rolldownOptions: isSsrBuild
        ? {}
        : {
            output: {
              codeSplitting: {
                groups: [
                  // React and the router change far less often than the app,
                  // so they get their own chunk that browsers keep cached
                  // across deploys.
                  {
                    name: "react-vendor",
                    test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)[\\/]/,
                    priority: 10,
                  },
                ],
              },
            },
          },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:4000",
          changeOrigin: true,
        },
        "/uploads": {
          target: "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },
  };
});

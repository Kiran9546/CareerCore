import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Component tests (npm test). jsdom stands in for the browser; every API
 * call is mocked in the test files, so no server or network is needed.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
    restoreMocks: true,
  },
});

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Exclude compiled output alongside the default node_modules exclusion —
    // `npm run build:electron` emits electron/**/*.test.ts to dist-electron/**/*.test.js,
    // which would otherwise also match vitest's default test glob and fail
    // (it's plain CommonJS, and importing "vitest" from a require()'d module errors).
    exclude: ["**/node_modules/**", "dist-electron/**", "out/**", ".next/**"],
  },
});

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compiled electron output — not checked in, but can exist locally from
    // a prior `npm run build:electron` and would otherwise get linted as
    // plain (require()-based) JS.
    "dist-electron/**",
    // electron-builder's afterPack hook: a plain Node CJS script loaded
    // directly by electron-builder, which expects require()/module.exports,
    // not an ESM file — not something to "fix" to satisfy no-require-imports.
    "scripts/afterPack.cjs",
  ]),
]);

export default eslintConfig;

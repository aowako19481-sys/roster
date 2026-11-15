import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "design/**"]),
  {
    // The public website uses ordinary links on purpose: each one is a full
    // page load, so the site's own stylesheet never follows a visitor into the app.
    files: ["src/app/home/**", "src/app/legal/**"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
]);

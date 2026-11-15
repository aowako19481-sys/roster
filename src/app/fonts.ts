import localFont from "next/font/local";

// Self-hosted font files (see assets/fonts/LICENSES.txt). Nothing is fetched
// from Google or any other third party, at build time or in the browser.

/** Text: a light geometric sans. */
export const outfit = localFont({
  src: "../../assets/fonts/Outfit-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-outfit",
  fallback: ["system-ui", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

/** Display: a wide, heavy grotesque for the wordmark and big numbers. */
export const archivo = localFont({
  src: "../../assets/fonts/Archivo-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-archivo",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  fallback: ["Arial Black", "system-ui", "sans-serif"],
});

/** Figures that must line up: licence fragments, counts, times. */
export const geistMono = localFont({
  src: "../../assets/fonts/GeistMono-latin.woff2",
  weight: "400 500",
  style: "normal",
  display: "swap",
  variable: "--font-geist-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

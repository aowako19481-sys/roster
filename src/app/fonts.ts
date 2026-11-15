import localFont from "next/font/local";

// Self-hosted font files (see assets/fonts/LICENSES.txt). Nothing is fetched
// from Google or any other third party, at build time or in the browser.
export const geist = localFont({
  src: "../../assets/fonts/Geist-latin.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  variable: "--font-geist",
  fallback: ["system-ui", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

export const geistMono = localFont({
  src: "../../assets/fonts/GeistMono-latin.woff2",
  weight: "400 500",
  style: "normal",
  display: "swap",
  variable: "--font-geist-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

export const instrumentSerif = localFont({
  src: [
    { path: "../../assets/fonts/InstrumentSerif-Regular-latin.woff2", weight: "400", style: "normal" },
    { path: "../../assets/fonts/InstrumentSerif-Italic-latin.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  variable: "--font-instrument-serif",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

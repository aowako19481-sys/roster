"use client";

import ui from "./ui.module.css";

/** Opens the browser's print dialog, where the page can also be saved as a PDF. */
export function PrintButton({ children = "Print or save as PDF" }: { children?: React.ReactNode }) {
  return (
    <button type="button" className={ui.btnPrimary} onClick={() => window.print()}>
      {children}
    </button>
  );
}

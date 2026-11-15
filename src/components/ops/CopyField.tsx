"use client";

import { useState } from "react";
import ui from "@/components/ui.module.css";

/** A private link in a read-only box with a copy button. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <span className={ui.inline}>
      <input
        className={`${ui.input} ${ui.mono}`}
        readOnly
        value={value}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        style={{ flex: "1 1 260px", minWidth: 0 }}
      />
      <button type="button" className={`${ui.btn} ${ui.small}`} onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <span role="status" className={ui.soft}>
        {copied ? "Link copied." : ""}
      </span>
    </span>
  );
}

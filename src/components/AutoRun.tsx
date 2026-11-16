"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Result } from "@/lib/result";
import ui from "./ui.module.css";

/**
 * Runs a brokerage's own automatic step once when the page opens, and says in
 * plain words what was done. Nothing is shown when there was nothing to do.
 */
export function AutoRun({ action }: { action: () => Promise<Result> }) {
  const router = useRouter();
  const started = useRef(false);
  const [said, setSaid] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    action()
      .then((result) => {
        if (result.ok && result.message) {
          setSaid(result.message);
          router.refresh();
        }
      })
      .catch(() => {});
  }, [action, router]);

  return <p role="status" className={said ? ui.success : "sr-only"}>{said}</p>;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Result } from "@/lib/result";

/**
 * Keeps signature statuses fresh without anyone pressing a button: while this
 * page is open and something is out for signature, Kinu asks the signing
 * service straight away and then about once a minute.
 */
export function AutoCheck({ action, waiting }: { action: () => Promise<Result>; waiting: number }) {
  const router = useRouter();
  const busy = useRef(false);
  const [said, setSaid] = useState("");

  useEffect(() => {
    if (!waiting) return;
    let gone = false;
    const run = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const result = await action();
        if (!gone && result.ok && result.message && /newly signed|declined/.test(result.message) && !/^Checked \d+: 0 newly signed, \d+ still waiting\.$/.test(result.message)) {
          setSaid(result.message);
          router.refresh();
        }
      } catch { /* try again on the next round */ }
      busy.current = false;
    };
    void run();
    const timer = setInterval(run, 60_000);
    const back = () => { if (!document.hidden) void run(); };
    document.addEventListener("visibilitychange", back);
    return () => { gone = true; clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [action, waiting, router]);

  return <p role="status" className="sr-only">{said}</p>;
}

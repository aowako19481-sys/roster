"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Batch } from "@/lib/dashboard";
import styles from "@/app/(app)/dashboard.module.css";

const PERIOD_SECONDS = 300; // The blueprint: "reads every 5 minutes".

export function LiveCounter({
  batches,
  sent,
  ready,
  lastRead,
}: {
  batches: Batch[];
  sent: number;
  ready: number;
  lastRead: string;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(PERIOD_SECONDS);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((value) => {
        if (value > 1) return value - 1;
        // Ask the server for fresh numbers. Skip while the tab is in the
        // background; it catches up on the next tick once visible again.
        if (document.visibilityState !== "visible") return 1;
        router.refresh();
        return PERIOD_SECONDS;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <section aria-label="Live onboarding counter" className={styles.live}>
      <div className={`${styles.card} ${styles.livePanel}`} data-tour="live">
        <div className={styles.liveTitle}>
          <span className={styles.liveDot} aria-hidden="true" />
          Onboarding right now
          <span className={styles.h2Soft}>· reads every 5 min</span>
        </div>
        <div className={styles.liveNumbers} aria-live="polite">
          <div>
            <div className={styles.label}>Ready to go live</div>
            <div className={`display ${styles.big}`}>
              <span key={`r${ready}`} className={styles.tick}>
                {ready}
              </span>
              <span className={styles.faint}>
                <span className="sr-only"> of </span>
                <span aria-hidden="true">/</span>
                {sent}
              </span>
            </div>
          </div>
          <div>
            <div className={styles.label}>Links out (recent batches)</div>
            <div className={`display ${styles.big}`}>
              <span key={`s${sent}`} className={styles.tick}>
                {sent}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.batchHead} aria-hidden="true">
          <span>Batch</span>
          <span>Ready / sent</span>
        </div>
        <ul className={styles.batchList} aria-label="Recent batches">
          {batches.map((batch) => {
            const pct = batch.sent ? Math.round((batch.ready / batch.sent) * 100) : 0;
            return (
              <li key={batch.id} className={styles.batch}>
                <div className={styles.batchLine}>
                  <span className={styles.batchLabel}>{batch.label}</span>
                  <span className={styles.batchCount}>
                    {batch.ready} <span aria-hidden="true">/</span>
                    <span className="sr-only">of</span> {batch.sent}
                    <span className="sr-only"> ready</span>
                  </span>
                </div>
                <div className={styles.track} aria-hidden="true">
                  <div className={styles.trackFill} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        {batches.length === 0 && <p className={styles.emptyNote}>No batches sent yet.</p>}
        <div className={styles.liveMeta}>
          <span>LAST READ {lastRead}</span>
          <span suppressHydrationWarning>NEXT IN {countdown}</span>
        </div>
      </div>
    </section>
  );
}

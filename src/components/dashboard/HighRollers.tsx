"use client";

import Link from "next/link";
import { useState } from "react";
import type { Roller } from "@/lib/dashboard";
import styles from "@/app/(app)/dashboard.module.css";

// Where each of the five visible cards sits: centre, then left and right.
const SLOTS: Record<number, { transform: string; opacity: number; z: number }> = {
  0: { transform: "translateX(-50%) translateY(-16px) translateZ(70px)", opacity: 1, z: 5 },
  1: { transform: "translateX(calc(-50% - 215px)) rotateY(22deg) translateZ(-10px) scale(0.9)", opacity: 1, z: 4 },
  2: { transform: "translateX(calc(-50% + 215px)) rotateY(-22deg) translateZ(-10px) scale(0.9)", opacity: 1, z: 4 },
  3: { transform: "translateX(calc(-50% - 392px)) rotateY(32deg) translateZ(-90px) scale(0.8)", opacity: 0.92, z: 3 },
  4: { transform: "translateX(calc(-50% + 392px)) rotateY(-32deg) translateZ(-90px) scale(0.8)", opacity: 0.92, z: 3 },
};
const OFF_LEFT = { transform: "translateX(calc(-50% - 560px)) rotateY(40deg) translateZ(-160px) scale(0.7)", opacity: 0, z: 1 };
const OFF_RIGHT = { transform: "translateX(calc(-50% + 560px)) rotateY(-40deg) translateZ(-160px) scale(0.7)", opacity: 0, z: 1 };
const PEARLS = [styles.pearl0, styles.pearl1, styles.pearl2];

export function HighRollers({ rollers }: { rollers: Roller[] }) {
  const [offset, setOffset] = useState(0);
  const maxOffset = Math.max(0, rollers.length - 5);
  const atTop = offset === 0;
  const atEnd = offset >= maxOffset;
  const range = atTop ? `top ${Math.min(5, rollers.length)}` : `#${offset + 1}–#${offset + 5}`;

  return (
    <section aria-labelledby="rollers-title" className={`${styles.card} ${styles.rollers}`}>
      <div className={styles.rollersHead}>
        <h2 id="rollers-title" className={styles.h2}>
          High rollers{" "}
          <span className={styles.h2Soft} aria-live="polite">
            · {range} by GCI this year
          </span>
        </h2>
        <div className={styles.rollersNav}>
          <button
            type="button"
            className={`${styles.round} press`}
            onClick={() => setOffset((value) => Math.max(0, value - 1))}
            disabled={atTop}
            aria-label="Show higher-ranked agents"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button type="button" className={`${styles.chip} press`} onClick={() => setOffset(0)}>
            Top 5
          </button>
          <button
            type="button"
            className={`${styles.round} press`}
            onClick={() => setOffset((value) => Math.min(maxOffset, value + 1))}
            disabled={atEnd}
            aria-label="Show lower-ranked agents"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <Link href="/agents" className={styles.more}>
            All agents <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {rollers.length === 0 ? (
        <p className={styles.emptyNote}>No closed deals yet this year.</p>
      ) : (
        <ol className={styles.fan}>
          <li aria-hidden="true" className={styles.fanShadow} />
          {rollers.map((agent, index) => {
            const slot = index - offset;
            const visible = slot >= 0 && slot <= 4;
            const place = SLOTS[slot] ?? (slot < 0 ? OFF_LEFT : OFF_RIGHT);
            return (
              <li
                key={agent.id}
                className={styles.slot}
                aria-hidden={visible ? undefined : true}
                style={{
                  transform: place.transform,
                  opacity: place.opacity,
                  zIndex: place.z,
                  pointerEvents: visible ? "auto" : "none",
                  visibility: visible ? "visible" : "hidden",
                }}
              >
                <Link href="/agents" className={`${styles.hr} ${PEARLS[index % 3]}`} tabIndex={visible ? 0 : -1}>
                  <span className={styles.sheen} aria-hidden="true" />
                  <span className={styles.hrTop}>
                    <span className={`display ${styles.hrRank}`}>
                      <span className="sr-only">Rank </span>
                      <span aria-hidden="true">#</span>
                      {agent.rank}
                    </span>
                    {agent.change && (
                      <span className={`${styles.hrPerf} ${agent.changeUp ? styles.green : styles.red}`}>
                        <span aria-hidden="true">{agent.changeUp ? "▲ " : "▼ "}</span>
                        <span className="sr-only">{agent.changeUp ? "Up " : "Down "}</span>
                        {agent.change}
                      </span>
                    )}
                  </span>
                  <span className={styles.hrAvatar} aria-hidden="true">
                    {agent.initials}
                  </span>
                  <span className={styles.hrText}>
                    <span className={styles.hrName}>{agent.name}</span>
                    <span className={styles.hrOffice}>{agent.office}</span>
                    <span className={styles.hrGci}>{agent.gci}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

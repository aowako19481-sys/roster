"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./founder.module.css";

const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A figure that counts up to its value once, when it first appears. */
export function CountUp({ value, money = false }: { value: number; money?: boolean }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || still() || value === 0) return;
    started.current = true;
    const from = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - from) / 900);
      setShown(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const rounded = Math.round(shown);
  return <>{money ? `$${rounded.toLocaleString("en-US")}` : rounded.toLocaleString("en-US")}</>;
}

type Point = { label: string; long: string; paid: number; billed: number };

/** Payments received, month by month. One series; hover or focus a month for its figures. */
export function PaidChart({ points }: { points: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 720, H = 240, left = 46, bottom = 26, top = 10;
  const max = Math.max(1, ...points.map((point) => point.paid));
  // A round number at or above the largest month, so the gridlines read cleanly.
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const ceiling = Math.ceil(max / magnitude) * magnitude;
  const band = (W - left) / points.length;
  const y = (amount: number) => top + (H - top - bottom) * (1 - amount / ceiling);
  const short = (amount: number) => (amount >= 1000 ? `$${(amount / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : `$${amount}`);
  const point = active === null ? null : points[active];

  return (
    <div className={styles.chart} onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Payments received in each of the last ${points.length} months. The figures are in the table below.`}>
        {[0, 0.5, 1].map((share) => (
          <g key={share}>
            <line className={styles.grid} x1={left} x2={W} y1={y(ceiling * share)} y2={y(ceiling * share)} />
            <text className={styles.axis} x={left - 8} y={y(ceiling * share) + 4} textAnchor="end">{short(ceiling * share)}</text>
          </g>
        ))}
        {points.map((entry, index) => {
          const height = Math.max(entry.paid > 0 ? 3 : 0, H - bottom - y(entry.paid));
          return (
            <g key={entry.long}>
              <rect className={`${styles.bar} ${active === index ? styles.barOn : ""}`} style={{ ["--i" as string]: index }} x={left + index * band + band * 0.2} y={H - bottom - height} width={band * 0.6} height={height} rx={4} />
              <text className={styles.axis} x={left + index * band + band / 2} y={H - 8} textAnchor="middle">{entry.label}</text>
              <rect className={styles.hit} x={left + index * band} y={top} width={band} height={H - top - bottom} tabIndex={0} aria-label={`${entry.long}: ${short(entry.paid)} received of ${short(entry.billed)} invoiced`} onPointerEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
            </g>
          );
        })}
      </svg>
      {point && active !== null && (
        <div className={styles.tip} style={{ left: `${((left + active * band + band / 2) / W) * 100}%` }} role="status">
          {point.long}
          <b>${point.paid.toLocaleString("en-US")} received</b>
          ${point.billed.toLocaleString("en-US")} invoiced
        </div>
      )}
    </div>
  );
}

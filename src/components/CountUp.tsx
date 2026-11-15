"use client";

import { useEffect, useRef, useState } from "react";

/** A figure that counts up to its value once, when it first appears. Stands still for reduced motion. */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    started.current = true;
    const from = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - from) / 1000);
      setShown(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{Math.round(shown).toLocaleString("en-US")}</>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { signOutIdle } from "@/app/(app)/actions";
import { ALIVE_COOKIE, IDLE_MS, WARN_SECONDS } from "@/lib/session-clock";
import styles from "./SessionGuard.module.css";

const ACTIVE_KEY = "kinu_active";   // shared between tabs, so activity in one counts for all

/**
 * Watches for 30 minutes without activity, asks "Still there?" with a short
 * countdown, then signs the person out. It also tells the server that a Kinu
 * page is open, which is how closing Kinu ends the session.
 */
export function SessionGuard() {
  const [left, setLeft] = useState<number | null>(null);
  const last = useRef(0);
  const pinged = useRef(0);
  const leaving = useRef(false);
  const stay = useRef<() => void>(() => {});
  const leave = useRef<() => void>(() => {});

  useEffect(() => {
    last.current = pinged.current = Date.now();
    const beat = () => { document.cookie = `${ALIVE_COOKIE}=${Date.now()}; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`; };
    const shared = () => { try { return Number(localStorage.getItem(ACTIVE_KEY)) || 0; } catch { return 0; } };
    const active = () => {
      const now = Date.now();
      if (now - last.current < 1000) return;
      last.current = now;
      try { localStorage.setItem(ACTIVE_KEY, String(now)); } catch { /* private window: this tab still works */ }
      if (now - pinged.current > 5 * 60 * 1000) { pinged.current = now; fetch("/session/ping", { method: "POST" }).catch(() => {}); }
    };
    const go = () => { if (leaving.current) return; leaving.current = true; void signOutIdle(); };
    stay.current = () => { last.current = 0; active(); setLeft(null); };
    leave.current = go;
    let beats = 0;
    const tick = () => {
      if (beats++ % 20 === 0) beat();
      const idle = Date.now() - Math.max(last.current, shared());
      if (idle >= IDLE_MS + WARN_SECONDS * 1000) go();
      else if (idle >= IDLE_MS) setLeft(Math.max(1, Math.ceil((IDLE_MS + WARN_SECONDS * 1000 - idle) / 1000)));
      else setLeft(null);
    };
    const wake = () => { beat(); tick(); };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const name of events) addEventListener(name, active, { passive: true, capture: true });
    addEventListener("focus", wake); addEventListener("pageshow", wake); document.addEventListener("visibilitychange", wake);
    beat();
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      for (const name of events) removeEventListener(name, active, { capture: true });
      removeEventListener("focus", wake); removeEventListener("pageshow", wake); document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  if (left === null) return null;
  return (
    <div className={styles.veil}>
      <div className={styles.box} role="alertdialog" aria-modal="true" aria-labelledby="still-title" aria-describedby="still-text">
        <h2 id="still-title" className={styles.title}>Still there?</h2>
        <p id="still-text" className={styles.text}>
          You have not used Kinu for 30 minutes. To keep your records safe, you will be signed out in{" "}
          <strong role="timer">{left} second{left === 1 ? "" : "s"}</strong>.
        </p>
        <div className={styles.track} aria-hidden="true"><span className={styles.bar} style={{ transform: `scaleX(${Math.max(0, (left - 1) / WARN_SECONDS)})` }} /></div>
        <div className={styles.row}>
          <button type="button" className={styles.primary} autoFocus onClick={() => stay.current()}>I’m still here</button>
          <button type="button" className={styles.quiet} onClick={() => leave.current()}>Sign out now</button>
        </div>
      </div>
    </div>
  );
}

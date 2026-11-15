"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/(app)/dashboard.module.css";

type Note = { id: string; title: string; meta: string; href: string };

export function NotificationsBell({ notes }: { notes: Note[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const label = notes.length ? `Notifications, ${notes.length} new` : "Notifications, none new";

  return (
    <div ref={wrap} className={styles.bellWrap}>
      <button
        ref={button}
        type="button"
        className={`${styles.bell} press`}
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        aria-controls="notifications-panel"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {notes.length > 0 && <span className={styles.bellDot} aria-hidden="true" />}
      </button>
      {open && (
        <div id="notifications-panel" className={styles.pop}>
          {notes.length === 0 ? (
            <p className={styles.popEmpty}>Nothing new.</p>
          ) : (
            <ul className={styles.popList}>
              {notes.map((note) => (
                <li key={note.id}>
                  <Link href={note.href} className={styles.popLink} onClick={() => setOpen(false)}>
                    <span className={styles.popTitle}>{note.title}</span>
                    <span className={styles.popMeta}>{note.meta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

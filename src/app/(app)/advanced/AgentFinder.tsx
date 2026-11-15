"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./advanced.module.css";

type Agent = {
  id: string; full_name: string; email: string | null; phone: string | null; office: string; status: string;
  licence_status: string; licence_masked: string | null; w9_status: string; rider_status: string; onboarding_status: string; joined_on: string | null;
};

const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const words = (value: string) => value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
const GOOD = new Set(["verified", "received", "signed", "ready", "active"]);

/**
 * Find an agent from the home screen. As a name is typed, a reel of names
 * spins and lands on the best match, shown large. Opening it brings up the
 * agent's ID card. The plain Agents page does the same job without the show.
 */
export function AgentFinder({ sample }: { sample: string[] }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Agent[]>([]);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(0);
  const [card, setCard] = useState<Agent | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch(`/agents/search?q=${encodeURIComponent(term)}`, { headers: { accept: "application/json" } });
        const body = (await response.json()) as { rows?: Agent[] };
        setRows(body.rows ?? []);
        setPick(0);
      } catch {
        setRows([]);
      } finally {
        setBusy(false);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [term]);

  const shown = useMemo(() => (term.length >= 2 ? rows : []), [term, rows]);
  const match = shown[Math.min(pick, Math.max(0, shown.length - 1))] ?? null;

  // The names that roll past before the reel settles on the match.
  const reel = useMemo(() => {
    if (!match) return [];
    const others = [...shown.map((row) => row.full_name), ...sample].filter((name) => name !== match.full_name);
    const filler = others.length ? others : ["…"];
    return [...Array.from({ length: 9 }, (_, index) => filler[index % filler.length] ?? ""), match.full_name];
  }, [match, shown, sample]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (card && !element.open) element.showModal();
    if (!card && element.open) element.close();
  }, [card]);

  return (
    <div className={styles.finder}>
      <form
        role="search"
        className={styles.searchBar}
        onSubmit={(event) => {
          event.preventDefault();
          if (match) setCard(match);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm10 2-4.3-4.3" /></svg>
        <label className="sr-only" htmlFor="agent-finder">Find an agent by name</label>
        <input id="agent-finder" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an agent" autoComplete="off" maxLength={60} />
      </form>

      {term.length >= 2 && (
        <div className={styles.found} aria-live="polite">
          {match ? (
            <>
              <div className={styles.reel} key={match.id}>
                <div className={`${styles.reelStrip} ${still() ? styles.reelStill : ""}`} style={{ ["--n" as string]: reel.length - 1 }}>
                  {reel.map((name, index) => (
                    <span key={index} className={index === reel.length - 1 ? styles.reelHit : undefined} aria-hidden={index !== reel.length - 1}>{name}</span>
                  ))}
                </div>
              </div>
              <p className={styles.foundMeta}>{match.office} · {words(match.status)}</p>
              <button type="button" className={styles.openBtn} onClick={() => setCard(match)}>Open ID card</button>
              {shown.length > 1 && (
                <ul className={styles.others}>
                  {shown.map((row, index) => (
                    <li key={row.id}>
                      <button type="button" aria-pressed={index === pick} onClick={() => setPick(index)}>{row.full_name}</button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className={styles.foundMeta}>{busy ? "Looking…" : "No agent matches that name."}</p>
          )}
        </div>
      )}

      <dialog ref={dialog} className={styles.idDialog} aria-labelledby="id-card-name" onClose={() => setCard(null)}>
        {card && (
          <div className={styles.idCard}>
            <button type="button" className={styles.close} onClick={() => setCard(null)}>Close<span aria-hidden="true"> ✕</span></button>
            <div className={styles.idTop}>
              <span className={styles.avatar} aria-hidden="true">{initials(card.full_name)}</span>
              <div>
                <p className={styles.label}>Agent ID card</p>
                <h2 id="id-card-name">{card.full_name}</h2>
                <p className={styles.foundMeta}>{card.office} · {words(card.status)}</p>
              </div>
            </div>
            <dl className={styles.idFacts}>
              {([["Onboarding", card.onboarding_status], ["Licence", card.licence_status], ["W‑9", card.w9_status], ["Rider", card.rider_status]] as const).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd><span className={GOOD.has(value) ? styles.good : styles.pending}>{words(value)}</span></dd>
                </div>
              ))}
            </dl>
            <dl className={styles.idContact}>
              <div><dt>Email</dt><dd>{card.email ?? "Not on file"}</dd></div>
              <div><dt>Phone</dt><dd>{card.phone ?? "Not on file"}</dd></div>
              <div><dt>Licence</dt><dd>{card.licence_masked ?? "Not on file"}</dd></div>
              <div><dt>Joined</dt><dd>{card.joined_on ? new Date(`${card.joined_on}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not yet"}</dd></div>
            </dl>
            <div className={styles.idActions}>
              <Link href={`/agents/${card.id}`} className={styles.primary}>Agent card</Link>
              <Link href={`/agents/${card.id}/file`}>Agent file</Link>
              <Link href={`/packet/${card.id}`}>Paperwork</Link>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

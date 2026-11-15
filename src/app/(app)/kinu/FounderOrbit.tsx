"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./orbit.module.css";

export type OrbitItem = { id: string; name: string; account_no: number; agents?: number };
export type OrbitGroup = { key: string; label: string; count: number; items: OrbitItem[] };

const W = 1000, H = 560, CORE = { x: 150, y: 280 }, GX = 372, LX = 640;
const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The founder console's centrepiece: a core, the headings that matter today,
 * and the brokerages under whichever heading is in focus. Searching or
 * choosing a brokerage plays a short "locating" sequence and opens its file.
 * Everything here is also reachable from the plain list further down the page.
 */
export function FounderOrbit({ groups }: { groups: OrbitGroup[] }) {
  const router = useRouter();
  const [focus, setFocus] = useState(0);
  const [touched, setTouched] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrbitItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [flying, setFlying] = useState<OrbitItem | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const group = groups[Math.min(focus, groups.length - 1)];

  // Moves through the headings by itself until the founder takes over.
  useEffect(() => {
    if (touched || flying || groups.length < 2 || still()) return;
    const timer = setInterval(() => setFocus((index) => (index + 1) % groups.length), 4200);
    return () => clearInterval(timer);
  }, [touched, flying, groups.length]);

  // "/" jumps to the search box.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // Search as the founder types, a moment after they pause.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/kinu/search?q=${encodeURIComponent(term)}`, { headers: { accept: "application/json" } });
        const body = (await response.json()) as { rows?: OrbitItem[] };
        setResults(body.rows ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const shown = query.trim().length >= 2 ? results : [];

  function open(item: OrbitItem) {
    setTouched(true);
    if (still()) return router.push(`/kinu/${item.id}`);
    setFlying(item);
    router.prefetch(`/kinu/${item.id}`);
    setTimeout(() => router.push(`/kinu/${item.id}`), 1500);
  }

  // The names that spin past before the reel lands on the chosen one.
  const reel = useMemo(() => {
    if (!flying) return [];
    const others = groups.flatMap((entry) => entry.items).filter((item) => item.id !== flying.id).map((item) => item.name);
    const filler = others.length ? others : ["Locating"];
    return [...Array.from({ length: 11 }, (_, index) => filler[index % filler.length] ?? ""), flying.name];
  }, [flying, groups]);

  const groupY = (index: number) => (groups.length === 1 ? H / 2 : 90 + (index * (H - 180)) / (groups.length - 1));
  const leaves = group?.items ?? [];
  const leafY = (index: number) => (leaves.length === 1 ? H / 2 : 44 + (index * (H - 88)) / (leaves.length - 1));
  const leafX = (index: number) => LX + Math.sin((leaves.length === 1 ? 0.5 : index / (leaves.length - 1)) * Math.PI) * 46;

  return (
    <div className={`${styles.orbit} ${flying ? styles.flying : ""}`}>
      <form
        className={styles.search}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (shown[0]) open(shown[0]);
        }}
      >
        <label className="sr-only" htmlFor="orbit-search">Find a brokerage by name or account number</label>
        <input
          id="orbit-search"
          ref={input}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setTouched(true);
          }}
          placeholder="Search a brokerage or account number"
          autoComplete="off"
          maxLength={80}
          aria-controls="orbit-results"
        />
        <kbd aria-hidden="true">/</kbd>
        {query.trim().length >= 2 && (
          <ul id="orbit-results" className={styles.results}>
            {shown.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => open(item)}>
                  <span>{item.name}</span>
                  <small>KN-{item.account_no}</small>
                </button>
              </li>
            ))}
            {!shown.length && <li className={styles.none}>{searching ? "Searching…" : "No brokerage matches that."}</li>}
          </ul>
        )}
      </form>

      <svg className={styles.graph} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Brokerages grouped by what needs attention">
        <defs>
          <radialGradient id="orb" cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="var(--orb-a)" />
            <stop offset="55%" stopColor="var(--orb-b)" />
            <stop offset="100%" stopColor="var(--orb-c)" />
          </radialGradient>
        </defs>

        {groups.map((entry, index) => (
          <path key={entry.key} className={`${styles.trunk} ${index === focus ? styles.trunkOn : ""}`} d={`M${CORE.x + 60} ${CORE.y} C${CORE.x + 150} ${CORE.y}, ${GX - 110} ${groupY(index)}, ${GX - 8} ${groupY(index)}`} />
        ))}
        <g key={group?.key} className={styles.fan}>
          {leaves.map((item, index) => (
            <path key={item.id} className={styles.branch} style={{ ["--i" as string]: index }} pathLength={1} d={`M${GX + 150} ${groupY(focus)} C${GX + 240} ${groupY(focus)}, ${leafX(index) - 110} ${leafY(index)}, ${leafX(index) - 10} ${leafY(index)}`} />
          ))}
        </g>

        <g className={styles.core}>
          <circle className={styles.halo} cx={CORE.x} cy={CORE.y} r={104} />
          <circle className={styles.ring} cx={CORE.x} cy={CORE.y} r={84} />
          <circle className={styles.ringB} cx={CORE.x} cy={CORE.y} r={72} />
          <circle cx={CORE.x} cy={CORE.y} r={52} fill="url(#orb)" />
          <text className={styles.coreText} x={CORE.x} y={CORE.y + 136} textAnchor="middle">KINU</text>
        </g>

        {groups.map((entry, index) => (
          <g key={entry.key} className={`${styles.node} ${index === focus ? styles.nodeOn : ""}`} transform={`translate(${GX} ${groupY(index) - 22})`}>
            <rect width={158} height={44} rx={12} />
            <text x={14} y={19} className={styles.nodeCount}>{entry.count}</text>
            <text x={14} y={34} className={styles.nodeLabel}>{entry.label}</text>
            <rect
              className={styles.hit}
              width={158}
              height={44}
              rx={12}
              tabIndex={0}
              role="button"
              aria-pressed={index === focus}
              aria-label={`${entry.label}: ${entry.count}`}
              onClick={() => { setFocus(index); setTouched(true); }}
              onPointerEnter={() => { setFocus(index); setTouched(true); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setFocus(index); setTouched(true); } }}
            />
          </g>
        ))}

        <g key={`leaves-${group?.key}`}>
          {leaves.map((item, index) => (
            <g key={item.id} className={styles.leaf} style={{ ["--i" as string]: index }} transform={`translate(${leafX(index)} ${leafY(index)})`}>
              <circle r={4.5} />
              <text x={14} y={-1} className={styles.leafName}>{item.name.length > 30 ? `${item.name.slice(0, 29)}…` : item.name}</text>
              <text x={14} y={13} className={styles.leafNo}>KN-{item.account_no}{item.agents !== undefined ? ` · ${item.agents} agents` : ""}</text>
              <rect className={styles.hit} x={-10} y={-16} width={330} height={34} rx={8} tabIndex={0} role="link" aria-label={`Open the file for ${item.name}`} onClick={() => open(item)} onKeyDown={(event) => { if (event.key === "Enter") open(item); }} />
            </g>
          ))}
        </g>
        {!groups.length && <text x={W / 2 + 100} y={H / 2} textAnchor="middle" className={styles.leafName}>No brokerages yet. Create the first one.</text>}
      </svg>

      {flying && (
        <div className={styles.locate} role="status" aria-live="assertive">
          <span className={styles.locLabel}>Locating account</span>
          <div className={styles.reel}>
            <div className={styles.reelStrip} style={{ ["--n" as string]: reel.length - 1 }}>
              {reel.map((name, index) => (
                <span key={index} className={index === reel.length - 1 ? styles.reelHit : undefined}>{name}</span>
              ))}
            </div>
          </div>
          <span className={styles.locNo}>KN-{flying.account_no} · opening file</span>
          <i className={styles.scan} />
        </div>
      )}
    </div>
  );
}

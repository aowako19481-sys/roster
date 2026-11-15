"use client";

import Link from "next/link";
import { useState } from "react";
import type { CohortRow, Tone } from "@/lib/dashboard";
import styles from "@/app/(app)/dashboard.module.css";

type Filter = "All" | CohortRow["status"];
const FILTERS: Filter[] = ["All", "Ready", "In progress", "Flagged"];
const PAGE = 8;

const STATUS_TONE: Record<CohortRow["status"], Tone> = { Ready: "green", Flagged: "red", "In progress": "mute" };

export function CohortTable({ title, rows }: { title: string; rows: CohortRow[] }) {
  const [filter, setFilter] = useState<Filter>("All");
  const matching = filter === "All" ? rows : rows.filter((row) => row.status === filter);
  const shown = matching.slice(0, PAGE);
  const countOf = (name: Filter) => (name === "All" ? rows.length : rows.filter((row) => row.status === name).length);

  return (
    <section className={`${styles.card} ${styles.pad} ${styles.cohort}`} aria-labelledby="cohort-title">
      <div className={styles.cohortHead}>
        <h2 id="cohort-title" className={styles.h2}>
          {title}
        </h2>
        <div className={styles.tabs} role="group" aria-label="Filter agents by status">
          {FILTERS.map((name) => (
            <button
              key={name}
              type="button"
              className={`${styles.tab} ${filter === name ? styles.tabOn : ""} press`}
              aria-pressed={filter === name}
              onClick={() => setFilter(name)}
            >
              {name} {countOf(name)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tableScroll} tabIndex={0} role="region" aria-labelledby="cohort-title">
        <table className={styles.table}>
          <thead className="sr-only">
            <tr>
              <th scope="col">Agent</th>
              <th scope="col">Office</th>
              <th scope="col">Licence</th>
              <th scope="col">W-9</th>
              <th scope="col">Rider</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={row.id} className={styles.row} style={{ animationDelay: `${index * 30}ms` }}>
                <th scope="row">
                  <span className={styles.who}>
                    <span className={styles.rowAvatar} aria-hidden="true">
                      {row.initials}
                    </span>
                    <span className={styles.whoText}>
                      <Link href="/agents" className={styles.rowLink}>
                        {row.name}
                      </Link>
                      <span className={styles.team}>{row.team}</span>
                    </span>
                  </span>
                </th>
                <td className={styles.office}>{row.office}</td>
                <td className={`${styles.lic} ${styles[row.licenceTone]}`}>{row.licence}</td>
                <td className={styles[row.w9Tone]}>W-9 {row.w9}</td>
                <td className={styles[row.riderTone]}>Rider {row.rider}</td>
                <td className={`${styles.status} ${styles[STATUS_TONE[row.status]]}`}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className={styles.emptyNote}>No agents match this filter.</p>}
      </div>

      <p className={styles.cohortFoot} aria-live="polite">
        Showing {shown.length} of {matching.length}
        {matching.length > shown.length && (
          <>
            {" · "}
            <Link href="/agents" className={styles.more}>
              All agents <span aria-hidden="true">→</span>
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

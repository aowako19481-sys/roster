import { CountUp } from "@/components/CountUp";
import type { DashboardData } from "@/lib/dashboard";
import { AgentFinder } from "./AgentFinder";
import styles from "./advanced.module.css";

/**
 * What the Advanced view adds on top of the dashboard: a finder for any
 * agent, and a ring for each onboarding step of the current intake. The
 * dashboard itself follows underneath, unchanged and fully working.
 */
export function AdvancedDeck({ data }: { data: DashboardData }) {
  const sample = data.rows.slice(0, 14).map((row) => row.name);
  const waiting = data.flags.length + data.approvals.length;
  return (
    <section className={styles.deck} aria-label="Advanced view">
      <div className={styles.strip}>
        <span className={styles.live}><i aria-hidden="true" /> Advanced view · live</span>
        <span className={styles.stripNote}>{data.cohortLabel} · {data.cohortSize} agents · {waiting ? `${waiting} waiting on a person` : "nothing waiting"}</span>
      </div>

      <div className={styles.finderPanel} data-tour="finder">
        <AgentFinder sample={sample} />
      </div>

      <ul className={styles.rings} data-tour="trackers" aria-label="Onboarding trackers">
        {data.stats.map((stat, index) => {
          const share = stat.of ? Math.min(100, Math.round((stat.value / stat.of) * 100)) : 100;
          return (
            <li key={stat.label} className={styles.ringCard} style={{ ["--i" as string]: index }}>
              <div className={styles.ring} role="img" aria-label={`${stat.label}: ${stat.value}${stat.of !== null ? ` of ${stat.of}` : ""}`}>
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <circle className={styles.ringTicks} cx="18" cy="18" r="15.9155" />
                  <circle className={styles.ringTrack} cx="18" cy="18" r="13.2" />
                  <circle className={styles.ringValue} cx="18" cy="18" r="13.2" pathLength={100} style={{ ["--off" as string]: 100 - share }} />
                </svg>
                <div className={styles.ringNumber}><CountUp value={stat.value} /></div>
              </div>
              <div className={styles.ringText}>
                <b>{stat.label}</b>
                <span>{stat.of !== null ? `${share}% · ${stat.value} of ${stat.of}` : "all sent"}</span>
                <small>{stat.note}</small>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

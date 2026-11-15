import styles from "./shell.module.css";

/** Shown the instant a link is clicked, until the next page is ready. */
export default function Loading() {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className={styles.loadingBar} aria-hidden="true" />
      <span className="sr-only">Loading…</span>
      <div className={styles.skeleton} aria-hidden="true">
        <span style={{ width: "32%", height: 46 }} />
        <span style={{ width: "58%", height: 16 }} />
        <span style={{ width: "100%", height: 150, marginTop: 18 }} />
        <span style={{ width: "100%", height: 260 }} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { SignInForm } from "./SignInForm";
import styles from "./sign-in.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={`display ${styles.mark}`}>{BRAND}</span>
        <span className={styles.barRight}>Ops + Finance for brokerages · test site, sample data only</span>
      </header>

      <div className={styles.stage}>
        {/* Backdrop: the wordmark in brushed metal and three matte spheres. */}
        <div className={styles.backdrop} aria-hidden="true">
          <span className={`orb ${styles.orb1}`} />
          <span className={`display metal ${styles.word}`} style={{ "--chars": BRAND.length } as React.CSSProperties}>
            {BRAND.toUpperCase()}
          </span>
          <span className={`orb ${styles.orb2}`} />
          <span className={`orb orbDark ${styles.orb3}`} />
        </div>

        <div className={styles.cardWrap}>
          <main id="content" className={styles.card}>
            <SignInForm styles={styles} />
          </main>
          {/* A sample licence, tucked behind the corner of the glass. */}
          <div className={styles.id} aria-hidden="true">
            <span className={styles.idTop}>
              <span className={styles.idChip} />
              <span className={styles.idOk}>✓ Verified</span>
            </span>
            <span className={styles.idNum}>10401 ••• 338</span>
            <span className={styles.idFoot}>
              <span>Maya Chen</span>
              <span>03/28</span>
            </span>
          </div>
        </div>
      </div>

      <footer className={styles.foot}>
        <h1 className={styles.headline}>
          Fifty new agents.
          <br />
          One quiet hour.
        </h1>
        <ul className={styles.facts}>
          <li>
            <span className="display">01</span>Licence read and matched to the state record
          </li>
          <li>
            <span className="display">02</span>W-9 collected, never a full SSN stored
          </li>
          <li>
            <span className="display">03</span>Rider signed, split locked until approved
          </li>
        </ul>
      </footer>
    </div>
  );
}

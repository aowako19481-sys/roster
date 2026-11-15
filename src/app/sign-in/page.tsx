import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";
import styles from "./sign-in.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.intro}>
          <span className={`${styles.wordmark} ${styles.rise}`}>ROSTER</span>
          <h1 className={`${styles.headline} ${styles.rise} ${styles.d1}`}>
            Fifty new agents.
            <br />
            <span className={styles.headlineSoft}>One quiet hour.</span>
          </h1>
          <p className={`${styles.lede} ${styles.rise} ${styles.d2}`}>
            Welcome links, licences, W-9s and riders, collected, checked and filed while your team
            gets on with the day.
          </p>

          {/* Decorative stack of sample documents. Hidden from screen readers. */}
          <div className={`${styles.stage} ${styles.rise} ${styles.d3}`} aria-hidden="true">
            <div className={styles.float}>
              <div className={styles.iso}>
                <div className={`${styles.sheet} ${styles.s1}`}>
                  <span className={styles.sheetLabel}>Rider · individual</span>
                  <span className={styles.sheetSerif}>80%</span>
                </div>
                <div className={`${styles.sheet} ${styles.s2}`}>
                  <span className={styles.sheetLabel}>W-9 · received</span>
                  <span className={styles.sheetMonoSmall}>TIN on file · masked</span>
                </div>
                <div className={`${styles.sheet} ${styles.s3}`}>
                  <span className={styles.sheetTop}>
                    <span>Salesperson licence</span>
                    <span className={styles.verified}>✓ Verified</span>
                  </span>
                  <span className={styles.sheetMono}>10401 ••• 338</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <main id="content" className={`${styles.panel} ${styles.rise} ${styles.d2}`}>
          <SignInForm />
          <div className={styles.footnote}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span>Roles decide who can see splits, W-9s and payouts. This is a test site with sample data only.</span>
          </div>
        </main>
      </div>
    </div>
  );
}

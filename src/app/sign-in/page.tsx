import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";
import styles from "./sign-in.module.css";
import { VariantB } from "./variants/B";
import { VariantC } from "./variants/C";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  // TEMPORARY: design options to choose between. Removed once one is picked.
  const { v } = await searchParams;
  if (v === "b") return <VariantB />;
  if (v === "c") return <VariantC />;

  return (
    <div className={styles.page}>
      <div className={styles.scene}>
        {/* Sample documents drifting behind the glass. Decorative only. */}
        <div className={styles.deco} aria-hidden="true">
          <div className={`${styles.doc} ${styles.docLicence}`}>
            <span className={styles.docTop}>
              <span>Real estate salesperson licence</span>
              <span className={styles.docOk}>✓ Verified</span>
            </span>
            <span className={styles.docMono}>10401 ••• 338</span>
            <span className={styles.docFoot}>
              <span className={styles.docSerif}>Maya Chen</span>
              <span className={styles.docTiny}>EXP 03/28</span>
            </span>
          </div>
          <div className={`${styles.doc} ${styles.docW9}`}>
            <span className={styles.docTop}>
              <span>Form W-9</span>
              <span>Received</span>
            </span>
            <span className={styles.docLines}>
              <i />
              <i />
              <i />
            </span>
            <span className={styles.docTiny}>TIN ON FILE · MASKED</span>
          </div>
          <div className={`${styles.doc} ${styles.docRider}`}>
            <span className={styles.docTop}>
              <span>Individual rider · v2</span>
              <span>Signed</span>
            </span>
            <span className={styles.docBig}>80%</span>
            <span className={styles.docTiny}>NEXT TIER 85% AT $40,000</span>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.intro}>
            <div className={`${styles.wordRow} ${styles.rise}`}>
              <span className={styles.wordmark}>ROSTER</span>
              <span className={styles.product}>Ops · Finance</span>
            </div>
            <h1 className={`${styles.headline} ${styles.rise} ${styles.d1}`}>
              Fifty new agents.
              <br />
              <span className={styles.headlineSoft}>One quiet hour.</span>
            </h1>
            <p className={`${styles.lede} ${styles.rise} ${styles.d2}`}>
              Welcome links, licences, W-9s and riders, collected, checked and filed while your team
              gets on with the day.
            </p>
            <ul className={`${styles.facts} ${styles.rise} ${styles.d3}`}>
              <li>
                <span className={styles.factNum}>01</span>Licence read and matched to the state record
              </li>
              <li>
                <span className={styles.factNum}>02</span>W-9 collected, never a full SSN stored
              </li>
              <li>
                <span className={styles.factNum}>03</span>Rider signed, split locked until approved
              </li>
            </ul>
          </div>

          <main id="content" className={`${styles.formCard} ${styles.rise} ${styles.d2}`}>
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
    </div>
  );
}

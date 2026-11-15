import { SignInForm } from "../SignInForm";
import { archivo, hanken } from "./fonts";
import styles from "./c.module.css";

/** Option C: giant wordmark as the backdrop, small clear glass card over it. */
export function VariantC() {
  return (
    <div className={`${styles.page} ${archivo.variable} ${hanken.variable}`}>
      <header className={styles.bar}>
        <span className={styles.mark}>Roster</span>
        <span className={styles.barRight}>Ops + Finance for brokerages</span>
      </header>

      <div className={styles.stage}>
        <div className={styles.word} aria-hidden="true">
          ROSTER
        </div>
        <main id="content" className={styles.card}>
          <SignInForm styles={styles} />
        </main>
      </div>

      <footer className={styles.foot}>
        <h1 className={styles.headline}>Fifty new agents. One quiet hour.</h1>
        <ul className={styles.facts}>
          <li>
            <span>01</span>Licence read and matched to the state record
          </li>
          <li>
            <span>02</span>W-9 collected, never a full SSN stored
          </li>
          <li>
            <span>03</span>Rider signed, split locked until approved
          </li>
        </ul>
      </footer>
    </div>
  );
}

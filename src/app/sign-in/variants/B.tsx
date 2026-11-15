import { SignInForm } from "../SignInForm";
import { outfit } from "./fonts";
import styles from "./b.module.css";

/** Option B: soft clear glass, one light geometric typeface, spheres behind. */
export function VariantB() {
  return (
    <div className={`${styles.page} ${outfit.variable}`}>
      <div className={styles.scene}>
        <div className={styles.deco} aria-hidden="true">
          <span className={`${styles.orb} ${styles.orb1}`} />
          <span className={`${styles.orb} ${styles.orb2}`} />
          <span className={`${styles.orb} ${styles.orb3}`} />
          <span className={`${styles.orb} ${styles.orb4}`} />
        </div>

        <div className={styles.sheet}>
          <header className={styles.top}>
            <span className={styles.brand}>
              <span className={styles.dot} aria-hidden="true" />
              Roster
            </span>
            <ol className={styles.steps} aria-label="Sign-in steps">
              <li aria-current="step">Your email</li>
              <li>Your code</li>
              <li>Dashboard</li>
            </ol>
          </header>

          <div className={styles.body}>
            <div className={styles.left}>
              <h1 className={styles.headline}>
                Fifty new agents.
                <br />
                One quiet hour.
              </h1>
              <p className={styles.lede}>Licences, W-9s and riders, collected, checked and filed for you.</p>
            </div>
            <main id="content" className={styles.form}>
              <SignInForm styles={styles} />
            </main>
          </div>
        </div>

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
  );
}

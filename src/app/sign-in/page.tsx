import type { Metadata } from "next";
import { BRAND, TAGLINE } from "@/lib/brand";
import { SignInForm } from "./SignInForm";
import styles from "./sign-in.module.css";

export const metadata: Metadata = { title: "Sign in" };

// Fine threads that sweep across the page like a length of silk.
const THREADS = Array.from({ length: 22 }, (_, i) => {
  const y = 130 + i * 12;
  const lift = 250 - i * 9;
  const dip = 230 + i * 6;
  return `M -80 ${y + 150} C 320 ${y - lift}, 760 ${y + dip}, 1520 ${y - 170 + i * 5}`;
});

export default function SignInPage() {
  return (
    <div className={styles.page}>
      <div className={styles.silk} aria-hidden="true">
        <span className={`${styles.sheen} ${styles.sheen1}`} />
        <span className={`${styles.sheen} ${styles.sheen2}`} />
        <span className={`${styles.sheen} ${styles.sheen3}`} />
        <svg className={styles.threads} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
          <defs>
            <linearGradient id="thread" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.3" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="0.72" stopColor="#fff" stopOpacity="0.7" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {THREADS.map((d, i) => (
            <path key={i} d={d} pathLength={1} stroke="url(#thread)" strokeWidth={i % 5 === 0 ? 1.4 : 0.7} style={{ animationDelay: `${i * 45}ms` }} />
          ))}
        </svg>
      </div>

      <header className={styles.bar}>
        <span className={`brandType ${styles.mark}`}>{BRAND}</span>
      </header>

      <div className={styles.stage}>
        <div className={styles.intro}>
          <h1 className={styles.headline}>
            {TAGLINE[0]}
            <br />
            <span className={styles.headlineSoft}>{TAGLINE[1]}</span>
          </h1>
        </div>

        <main id="content" className={styles.card}>
          <span className={styles.monogram} aria-hidden="true">
            {BRAND.charAt(0)}
          </span>
          <SignInForm styles={styles} />
        </main>
      </div>
    </div>
  );
}

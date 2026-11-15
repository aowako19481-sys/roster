import Link from "next/link";
import { redirect } from "next/navigation";
import { Dock } from "@/components/Dock";
import { BRAND } from "@/lib/brand";
import { getUser } from "@/lib/supabase/server";
import { getMembership } from "@/lib/workspace";
import { signOut } from "./actions";
import styles from "./shell.module.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The proxy already redirects signed-out visitors. This second, server-side
  // check means a page can never render without a verified user.
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const membership = await getMembership();

  if (!membership) {
    return (
      <div className={styles.page}>
        <main id="content" className={styles.empty}>
          <span className={`display ${styles.wordmark}`}>{BRAND}</span>
          <h1 className={`display ${styles.emptyTitle}`}>No brokerage yet</h1>
          <p className={styles.emptyText}>
            You are signed in, but your account is not linked to a brokerage workspace. Ask your
            brokerage admin to add you, then sign in again.
          </p>
          <form action={signOut}>
            <button type="submit" className={`${styles.emptyButton} press`}>
              Sign out
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.bar}>
          <Link href="/" className={`display ${styles.wordmark}`}>
            {BRAND}
          </Link>
          <span className={styles.workspace}>{membership.workspaceName}</span>

          <form action="/agents" method="get" role="search" className={styles.search}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <label htmlFor="app-search" className="sr-only">
              Search agents, licence numbers and teams
            </label>
            <input id="app-search" type="search" name="q" placeholder="Agent, licence #, team" maxLength={80} autoComplete="off" />
          </form>

          <form action={signOut} className={styles.account}>
            <span className={styles.avatar} aria-hidden="true">
              {membership.initials}
            </span>
            <span className={styles.accountText}>
              <span className={styles.accountName}>{membership.displayName}</span>
              <button type="submit" className={styles.signOut}>
                Sign out
              </button>
            </span>
          </form>
        </header>

        <main id="content" className={styles.main}>
          {children}
        </main>
      </div>
      <Dock />
    </div>
  );
}

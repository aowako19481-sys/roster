import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
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
          <span className={styles.wordmark}>ROSTER</span>
          <h1 className={styles.emptyTitle}>No brokerage yet</h1>
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
      <div className={styles.frame}>
        <div className={styles.side}>
          <Sidebar
            displayName={membership.displayName}
            initials={membership.initials}
            waitingApprovals={membership.waitingApprovals}
            signOut={signOut}
          />
        </div>
        <main id="content" className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}

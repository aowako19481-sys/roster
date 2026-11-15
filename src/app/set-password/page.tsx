import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { getUser } from "@/lib/supabase/server";
import styles from "../sign-in/sign-in.module.css";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Create your password" };

/**
 * Shown straight after someone signs in with an emailed code alone: a new
 * person on their first visit, or someone who forgot their password. Nothing
 * else in Kinu opens until a password is set (src/proxy.ts).
 */
export default async function SetPasswordPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={`brandType ${styles.mark}`}>{BRAND}</span>
      </header>
      <div className={styles.stage}>
        <main id="content" className={styles.card}>
          <span className={styles.monogram} aria-hidden="true">
            {BRAND.charAt(0)}
          </span>
          <PasswordForm email={user.email ?? ""} />
        </main>
      </div>
    </div>
  );
}

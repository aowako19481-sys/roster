"use client";

import { useActionState } from "react";
import { leave, setPassword, type PasswordState } from "../sign-in/actions";
import styles from "../sign-in/sign-in.module.css";

export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, { status: "idle" });
  const error = state.status === "error" ? state.message : undefined;
  return (
    <div className={styles.step}>
      <form action={action} className={styles.step} noValidate>
        <div>
          <h2 className={styles.title}>Create your password</h2>
          <p className={styles.sub}>
            For <strong className={styles.email}>{email}</strong>. Only you will know it. At least 10 characters.
          </p>
        </div>
        {/* Lets password managers save it against the right account. */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <label className={styles.field}>
          New password
          <input className={styles.input} type="password" name="password" autoComplete="new-password" autoFocus required minLength={10} maxLength={200} aria-invalid={error ? true : undefined} aria-describedby={error ? "password-error" : undefined} />
        </label>
        <label className={styles.field}>
          Type it again
          <input className={styles.input} type="password" name="again" autoComplete="new-password" required minLength={10} maxLength={200} />
        </label>
        <p id="password-error" role="alert" className={styles.error}>
          {error}
        </p>
        <button type="submit" className={`${styles.primary} press`} disabled={pending}>
          {pending ? "Saving…" : "Save password and continue"}
        </button>
      </form>
      <form action={leave}>
        <button type="submit" className={styles.linkButton}>
          Sign out
        </button>
      </form>
    </div>
  );
}

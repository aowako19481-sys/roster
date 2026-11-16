"use client";

import { useActionState, useTransition } from "react";
import { leave, setPassword, type PasswordState } from "../sign-in/actions";
import styles from "../sign-in/sign-in.module.css";

export function PasswordForm({ email, first, last }: { email: string; first: string; last: string }) {
  const [state, action, sending] = useActionState<PasswordState, FormData>(setPassword, { status: "idle" });
  const [waiting, startTransition] = useTransition();
  const pending = sending || waiting;
  // Sent by hand rather than by the browser, so nothing the person typed is cleared if there is a problem.
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };
  const error = state.status === "error" ? state.message : undefined;
  return (
    <div className={styles.step}>
      <form action={action} onSubmit={submit} className={styles.step} noValidate>
        <div>
          <h2 className={styles.title}>Set up your account</h2>
          <p className={styles.sub}>
            For <strong className={styles.email}>{email}</strong>. Tell us what to call you, then choose a password only you will know.
          </p>
        </div>
        <label className={styles.field}>
          First name
          <input className={styles.input} type="text" name="first" autoComplete="given-name" defaultValue={first} autoFocus required maxLength={60} />
        </label>
        <label className={styles.field}>
          Last name
          <input className={styles.input} type="text" name="last" autoComplete="family-name" defaultValue={last} required maxLength={60} />
        </label>
        {/* Lets password managers save it against the right account. */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <label className={styles.field}>
          New password (at least 10 characters)
          <input className={styles.input} type="password" name="password" autoComplete="new-password" required minLength={10} maxLength={200} aria-invalid={error ? true : undefined} aria-describedby={error ? "password-error" : undefined} />
        </label>
        <label className={styles.field}>
          Type it again
          <input className={styles.input} type="password" name="again" autoComplete="new-password" required minLength={10} maxLength={200} />
        </label>
        <p id="password-error" role="alert" className={styles.error}>
          {error}
        </p>
        <button type="submit" className={`${styles.primary} press`} disabled={pending}>
          {pending ? "Saving…" : "Save and continue"}
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

"use client";

import { BRAND } from "@/lib/brand";
import { useActionState, useEffect, useRef, useState } from "react";
import { forgetDevice, requestCode, verifyCode, type RequestState, type VerifyState } from "./actions";
import defaultStyles from "./sign-in.module.css";

type Styles = Record<string, string>;

const CODE_LENGTH = 6;
const EMPTY_CODE = Array.from({ length: CODE_LENGTH }, () => "");

export function SignInForm({ styles = defaultStyles, notice, remembered }: { styles?: Styles; notice?: string; remembered?: string | null }) {
  const [request, requestAction, requestPending] = useActionState<RequestState, FormData>(
    requestCode,
    { status: "idle", email: "" },
  );
  // The send the person chose to leave by pressing "Use a different email".
  const [dismissedSend, setDismissedSend] = useState<number | undefined>(undefined);
  // "Use a different account" on a remembered device shows the plain form.
  const [other, setOther] = useState(false);
  // First time here, or forgot the password: a code by email, then create a password.
  const [firstTime, setFirstTime] = useState(false);

  if (request.status === "sent" && request.sentAt !== dismissedSend) {
    return <CodeStep key={request.sentAt} email={request.email} styles={styles} onBack={() => setDismissedSend(request.sentAt)} />;
  }

  const error = request.status === "error" ? request.message : request.status === "idle" ? notice : undefined;
  const known = remembered && !other ? remembered : null;

  return (
    <div className={styles.step}>
      <form action={requestAction} className={styles.step} noValidate>
        <div>
          <h2 className={styles.title}>{firstTime ? "Create or reset your password" : known ? "Welcome back" : "Sign in"}</h2>
          {known ? (
            <p className={styles.sub}>
              Sign in as <strong className={styles.email}>{known}</strong>
            </p>
          ) : null}
          {firstTime ? <p className={styles.sub}>We will email you a 6-digit code. After you enter it, you choose your own password.</p> : null}
        </div>

        {known ? (
          <>
            <input type="hidden" name="email" value={known} />
            {/* Lets password managers match the account. */}
            <input type="text" name="username" autoComplete="username" value={known} readOnly hidden />
            <input type="hidden" name="remember" value="on" />
          </>
        ) : (
          <label className={styles.field}>
            Work email
            <input
              className={styles.input}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@brokerage.com"
              defaultValue={request.email}
              required
              maxLength={254}
              aria-invalid={request.status === "error" ? true : undefined}
              aria-describedby={error ? "email-error" : undefined}
            />
          </label>
        )}

        {firstTime ? (
          <input type="hidden" name="mode" value="code" />
        ) : (
          <label className={styles.field}>
            Password
            <input
              className={styles.input}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={200}
              aria-invalid={request.status === "error" ? true : undefined}
              aria-describedby={error ? "email-error" : undefined}
            />
          </label>
        )}

        {known ? null : (
          <label className={styles.remember}>
            <input type="checkbox" name="remember" defaultChecked={Boolean(remembered)} />
            <span>Remember me on this device</span>
          </label>
        )}

        <p id="email-error" role="alert" className={styles.error}>
          {error}
        </p>

        <button type="submit" className={`${styles.primary} press`} disabled={requestPending}>
          {requestPending ? "One moment…" : firstTime ? "Email me a code" : "Continue"}
        </button>
        {firstTime ? null : <p className={styles.sub}>Next, we email you a 6-digit code to confirm it is you.</p>}
      </form>

      <button type="button" className={styles.linkButton} onClick={() => setFirstTime(!firstTime)}>
        {firstTime ? "Back to sign in" : "First time here, or forgot your password?"}
      </button>
      {known ? (
        <>
          <button type="button" className={styles.linkButton} onClick={() => setOther(true)}>
            Use a different account
          </button>
          <form action={forgetDevice}>
            <button type="submit" className={styles.linkButton}>
              Forget this account on this device
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}

function CodeStep({ email, styles, onBack }: { email: string; styles: Styles; onBack: () => void }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyCode, {
    status: "idle",
  });
  const [digits, setDigits] = useState<string[]>(EMPTY_CODE);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const error = state.status === "error" ? state.message : undefined;

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  function focusBox(index: number) {
    const box = inputs.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))];
    box?.focus();
    box?.select();
  }

  /** Put one or more typed or pasted digits in, starting at a box. */
  function fill(start: number, text: string) {
    const clean = text.replace(/\D/g, "");
    if (!clean) return;
    const next = [...digits];
    let at = start;
    for (const ch of clean) {
      if (at >= CODE_LENGTH) break;
      next[at] = ch;
      at += 1;
    }
    setDigits(next);
    focusBox(at);
  }

  function onKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        next[index - 1] = "";
        setDigits(next);
        focusBox(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  return (
    <form action={action} className={styles.step} noValidate>
      <div>
        <h2 className={styles.title}>Check your email</h2>
        <p className={styles.sub}>
          If <strong className={styles.email}>{email}</strong> is set up for {BRAND}, we have emailed you a
          6-digit code. Type it below. It works once and expires after a short while.
        </p>
      </div>

      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="code" value={digits.join("")} />

      <div
        role="group"
        aria-label="6-digit code"
        aria-describedby={error ? "code-error" : undefined}
        className={styles.digits}
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element;
            }}
            className={styles.digit}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
            aria-invalid={error ? true : undefined}
            value={digit}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "");
              if (!value) {
                const next = [...digits];
                next[index] = "";
                setDigits(next);
                return;
              }
              // A single typed digit replaces the box; autofill or paste spreads out.
              fill(index, value.length > 1 && digit ? value.replace(digit, "") || value : value);
            }}
            onKeyDown={(event) => onKeyDown(index, event)}
            onPaste={(event) => {
              event.preventDefault();
              fill(0, event.clipboardData.getData("text"));
            }}
            onFocus={(event) => event.target.select()}
          />
        ))}
      </div>

      <p id="code-error" role="alert" className={styles.error}>
        {error}
      </p>

      <button type="submit" className={`${styles.primary} press`} disabled={pending}>
        {pending ? "Checking…" : "Verify and sign in"}
      </button>

      <button type="button" className={styles.linkButton} onClick={onBack}>
        Use a different email
      </button>
    </form>
  );
}

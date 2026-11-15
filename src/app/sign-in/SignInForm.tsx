"use client";

import { BRAND } from "@/lib/brand";
import { useActionState, useEffect, useRef, useState } from "react";
import { requestCode, verifyCode, type RequestState, type VerifyState } from "./actions";
import defaultStyles from "./sign-in.module.css";

type Styles = Record<string, string>;

const CODE_LENGTH = 6;
const EMPTY_CODE = Array.from({ length: CODE_LENGTH }, () => "");

export function SignInForm({ styles = defaultStyles, notice }: { styles?: Styles; notice?: string }) {
  const [request, requestAction, requestPending] = useActionState<RequestState, FormData>(
    requestCode,
    { status: "idle", email: "" },
  );
  // The send the person chose to leave by pressing "Use a different email".
  const [dismissedSend, setDismissedSend] = useState<number | undefined>(undefined);
  const onCodeStep = request.status === "sent" && request.sentAt !== dismissedSend;

  if (onCodeStep) {
    return (
      <CodeStep
        key={request.sentAt}
        email={request.email}
        styles={styles}
        onBack={() => setDismissedSend(request.sentAt)}
      />
    );
  }

  const error = request.status === "error" ? request.message : request.status === "idle" ? notice : undefined;

  return (
    <form action={requestAction} className={styles.step} noValidate>
      <h2 className={styles.title}>Sign in</h2>

      <label className={styles.field}>
        Work email
        <input
          className={styles.input}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@brokerage.com"
          defaultValue={request.email}
          required
          maxLength={254}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "email-error" : undefined}
        />
      </label>

      <p id="email-error" role="alert" className={styles.error}>
        {error}
      </p>

      <button type="submit" className={`${styles.primary} press`} disabled={requestPending}>
        {requestPending ? "Sending code…" : "Continue"}
      </button>
    </form>
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
          If <strong className={styles.email}>{email}</strong> is set up for {BRAND}, a sign-in email is on
          its way. Open the link in it using this browser, or type the 6-digit code if it shows one.
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

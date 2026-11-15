"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { Result } from "@/lib/result";
import ui from "./ui.module.css";

type Action = (previous: Result, form: FormData) => Promise<Result>;

/**
 * A form wired to a server action. It shows the action's message (errors are
 * announced to screen readers), disables its buttons while busy, and can
 * clear itself after a success.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  ...rest
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "children" | "className">) {
  const [state, formAction] = useActionState<Result, FormData>(action, { ok: null });
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.ok === true) form.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={form} action={formAction} className={className ?? ui.form} noValidate {...rest}>
      {children}
      <p role="alert" className={ui.error}>
        {state.ok === false ? state.message : ""}
      </p>
      <p role="status" className={ui.success}>
        {state.ok === true ? state.message : ""}
      </p>
    </form>
  );
}

/** A submit button that knows when its form is busy. */
export function Submit({
  children,
  variant = "primary",
  small,
  busy = "Working…",
  ...rest
}: {
  children: React.ReactNode;
  variant?: "primary" | "plain" | "danger" | "link";
  small?: boolean;
  busy?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  const base = variant === "primary" ? ui.btnPrimary : variant === "danger" ? ui.btnDanger : variant === "link" ? ui.linkBtn : ui.btn;
  return (
    <button type="submit" className={`${base} ${small && variant !== "link" ? ui.small : ""}`} disabled={pending} {...rest}>
      {pending ? busy : children}
    </button>
  );
}

/** A select that submits its form as soon as the choice changes. */
export function AutoSelect({
  name,
  value,
  options,
  label,
  className,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={value}
      aria-label={label}
      className={className ?? ui.select}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

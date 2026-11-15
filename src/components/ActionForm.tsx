"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { Result } from "@/lib/result";
import ui from "./ui.module.css";

type Action = (previous: Result, form: FormData) => Promise<Result>;
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const Busy = createContext(false);

/** What a field is called on screen: the words in its label, without the control's own text. */
function nameOf(field: Field): string {
  const label = field.labels?.[0] ?? field.closest("label");
  const own = label ? [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())?.textContent?.trim() : "";
  const nested = label?.querySelector("span, b, strong")?.textContent?.trim();
  return (own || field.getAttribute("aria-label") || nested || field.name || "a required field").replace(/\s*\(required\)\s*$/i, "");
}

function isEmpty(field: Field): boolean {
  if (field instanceof HTMLInputElement && field.type === "checkbox") return !field.checked;
  if (field instanceof HTMLInputElement && field.type === "file") return !field.files?.length;
  return field.value.trim() === "";
}

/**
 * A form wired to a server action. What the person typed is never thrown
 * away: if something required is empty, the form says which fields and marks
 * them without sending anything; if the server refuses, its message is shown
 * and every field stays as it was. Errors are announced to screen readers.
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
  const [state, formAction, sending] = useActionState<Result, FormData>(action, { ok: null });
  const [waiting, startTransition] = useTransition();
  const [missing, setMissing] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.ok === true) form.current?.reset();
  }, [state, resetOnSuccess]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    // Handled here rather than by the browser, so the fields are not cleared afterwards.
    event.preventDefault();
    const element = event.currentTarget;
    element.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
    const empty = [...element.querySelectorAll<Field>("input[required], select[required], textarea[required]")].filter(isEmpty);
    if (empty.length) {
      empty.forEach((field) => field.setAttribute("aria-invalid", "true"));
      setMissing([...new Set(empty.map(nameOf))]);
      empty[0]?.focus();
      return;
    }
    setMissing([]);
    const data = new FormData(element, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(data));
  }

  return (
    <Busy.Provider value={sending || waiting}>
      <form ref={form} action={formAction} onSubmit={submit} className={className ?? ui.form} noValidate {...rest}>
        {children}
        <p role="alert" className={ui.error}>
          {missing.length ? `Still needed: ${missing.join(", ")}.` : state.ok === false ? state.message : ""}
        </p>
        <p role="status" className={ui.success}>
          {!missing.length && state.ok === true ? state.message : ""}
        </p>
      </form>
    </Busy.Provider>
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
  const status = useFormStatus();
  const pending = useContext(Busy) || status.pending;
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
      key={value}
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

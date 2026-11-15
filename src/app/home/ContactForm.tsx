"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { Result } from "@/lib/result";
import { sendLead } from "./actions";

function Send({ busy }: { busy: boolean }) {
  const status = useFormStatus();
  const pending = busy || status.pending;
  return (
    <button className="btn dark" type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send to the team"}
    </button>
  );
}

/** The Get started form. It posts to our own server; nothing goes to another company. */
export function ContactForm() {
  const [state, action, sending] = useActionState<Result, FormData>(sendLead, { ok: null });
  const [waiting, startTransition] = useTransition();
  if (state.ok === true) {
    return (
      <p className="sent" role="status">
        {state.message}
      </p>
    );
  }
  return (
    <form
      action={action}
      onSubmit={(event) => {
        // Sent from here so a refused message does not clear what was typed.
        if (!event.currentTarget.reportValidity()) return event.preventDefault();
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <div className="row">
        <label htmlFor="s-name">
          Your name
          <input id="s-name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label htmlFor="s-co">
          Brokerage
          <input id="s-co" name="company" required minLength={2} maxLength={160} autoComplete="organization" />
        </label>
      </div>
      <div className="row">
        <label htmlFor="s-mail">
          Work email
          <input id="s-mail" name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
        <label htmlFor="s-n">
          Agents
          <select id="s-n" name="agents" defaultValue="200 to 600">
            <option>Under 50</option>
            <option>50 to 200</option>
            <option>200 to 600</option>
            <option>Over 600</option>
          </select>
        </label>
      </div>
      <label htmlFor="s-plan">
        Interested in
        <input id="s-plan" name="plan" readOnly defaultValue="Ops" />
      </label>
      <label htmlFor="s-msg">
        Anything we should know?
        <textarea id="s-msg" name="message" rows={3} maxLength={2000} />
      </label>
      <div className="hp" aria-hidden="true">
        <label htmlFor="s-web">
          Leave this empty
          <input id="s-web" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Send busy={sending || waiting} />
      <p className="err" role="alert">
        {state.ok === false ? state.message : ""}
      </p>
      <p className="fine">
        We use these details only to reply to you. See the <a href="/legal/privacy">Privacy Policy</a>.
      </p>
    </form>
  );
}

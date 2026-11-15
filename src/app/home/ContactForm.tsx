"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Result } from "@/lib/result";
import { sendLead } from "./actions";

function Send() {
  const { pending } = useFormStatus();
  return (
    <button className="btn dark" type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send to the team"}
    </button>
  );
}

/** The Get started form. It posts to our own server; nothing goes to another company. */
export function ContactForm() {
  const [state, action] = useActionState<Result, FormData>(sendLead, { ok: null });
  if (state.ok === true) {
    return (
      <p className="sent" role="status">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action}>
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
      <Send />
      <p className="err" role="alert">
        {state.ok === false ? state.message : ""}
      </p>
      <p className="fine">
        We use these details only to reply to you. See the <a href="/legal/privacy">Privacy Policy</a>.
      </p>
    </form>
  );
}

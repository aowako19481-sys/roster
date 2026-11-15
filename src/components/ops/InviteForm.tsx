"use client";

import { useActionState, useState } from "react";
import { Submit } from "@/components/ActionForm";
import ui from "@/components/ui.module.css";
import { CopyField } from "./CopyField";
import type { InviteResult } from "./types";

type Action = (previous: InviteResult, form: FormData) => Promise<InviteResult>;

/** The paste-a-list invite form, and the one-time table of private links it gets back. */
export function InviteForm({ action, example, offices }: { action: Action; example: string; offices: string[] }) {
  const [list, setList] = useState("");
  const [state, formAction] = useActionState<InviteResult, FormData>(async (previous, form) => {
    const result = await action(previous, form);
    // Keep the list when something needs fixing; clear it once everyone is invited.
    if (result.ok === true && !result.failed?.length) setList("");
    return result;
  }, { ok: null });

  return (
    <div className={ui.stack}>
      <form action={formAction} className={ui.form} noValidate>
        <label className={ui.field}>
          Agents, one per line
          <textarea
            className={`${ui.textarea} ${ui.mono}`}
            name="agents"
            rows={8}
            required
            value={list}
            onChange={(event) => setList(event.target.value)}
            placeholder={example}
            aria-describedby="invite-help"
            spellCheck={false}
          />
        </label>
        <p id="invite-help" className={ui.help}>
          Write each agent as <strong>Name, email, split %, office</strong>. You can also paste four columns straight from a
          spreadsheet. Offices: {offices.length ? offices.join(", ") : "none set up yet (add one in Settings)"}.
        </p>
        <div>
          <Submit busy="Inviting…">Create welcome links</Submit>
        </div>
        <div role="alert" className={ui.error}>
          {state.ok === false && (
            <>
              <p>{state.message}</p>
              {state.problems && state.problems.length > 0 && (
                <ul>
                  {state.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </form>

      {state.ok === true && (
        <div role="status" className={ui.stack}>
          <p className={ui.success}>{state.message}</p>
          {state.sent && state.sent.length > 0 && (
            <>
              <p className={ui.help}>
                <strong>These links are shown only once.</strong> Copy each one and send it to the agent now. If you lose one,
                make a new link from the agent’s card; the old link then stops working.
              </p>
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <caption className={ui.soft}>Private onboarding links for this batch</caption>
                  <thead>
                    <tr>
                      <th scope="col">Agent</th>
                      <th scope="col">Office</th>
                      <th scope="col" className={ui.num}>Split</th>
                      <th scope="col">Private onboarding link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.sent.map((row) => (
                      <tr key={row.email}>
                        <th scope="row">
                          <span className={ui.strong}>{row.name}</span>
                          <br />
                          <span className={ui.soft}>{row.email}</span>
                        </th>
                        <td>{row.office}</td>
                        <td className={ui.num}>{row.split}%</td>
                        <td>
                          <CopyField label={`Onboarding link for ${row.name}`} value={row.link} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {state.failed && state.failed.length > 0 && (
            <div className={ui.error}>
              <p>These agents were not invited:</p>
              <ul>
                {state.failed.map((row) => (
                  <li key={row.email}>
                    {row.name} ({row.email}): {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

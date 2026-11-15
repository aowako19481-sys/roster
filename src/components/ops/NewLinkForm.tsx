"use client";

import { useActionState } from "react";
import { Submit } from "@/components/ActionForm";
import ui from "@/components/ui.module.css";
import { CopyField } from "./CopyField";
import type { LinkResult } from "./types";

type Action = (previous: LinkResult, form: FormData) => Promise<LinkResult>;

/** "Send a new onboarding link": makes a fresh link and shows it once. */
export function NewLinkForm({ action, agentId, agentName, label = "New link" }: { action: Action; agentId: string; agentName: string; label?: string }) {
  const [state, formAction] = useActionState<LinkResult, FormData>(action, { ok: null });
  return (
    <form action={formAction} className={ui.form}>
      <input type="hidden" name="agent" value={agentId} />
      <div>
        <Submit small variant="plain" aria-label={`${label} for ${agentName}`}>
          {label}
        </Submit>
      </div>
      <p role="alert" className={ui.error}>
        {state.ok === false ? state.message : ""}
      </p>
      {state.ok === true && state.link && (
        <div role="status">
          <p className={ui.success}>{state.message}</p>
          <CopyField label={`Onboarding link for ${agentName}`} value={state.link} />
        </div>
      )}
    </form>
  );
}

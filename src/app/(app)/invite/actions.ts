"use server";

import { revalidatePath } from "next/cache";
import type { InviteResult, LinkResult } from "@/components/ops/types";
import { actionAccess } from "@/lib/access";
import { newInviteToken, portalLink } from "@/lib/invite-token";
import { parseInviteLines, requestOrigin } from "@/lib/ops";
import { failure, text, uuid } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/**
 * Invite a pasted list of agents. Nothing is sent unless every line reads
 * correctly, so a fixed list can be submitted again without duplicates. Each
 * agent gets their own private link; only a hash of it is stored.
 */
export async function inviteAgents(_prev: InviteResult, form: FormData): Promise<InviteResult> {
  const gate = await actionAccess("agents.invite");
  if ("denied" in gate) return { ok: false, message: gate.denied };
  const ws = gate.access.workspace.id;
  const supabase = await createClient();

  const { data: offices, error: officeError } = await supabase.from("offices").select("id, name").eq("workspace_id", ws).order("name");
  if (officeError) return failure(officeError);
  const { rows, problems } = parseInviteLines(text(form, "agents", 40_000), (offices ?? []) as { id: string; name: string }[]);

  // Anyone already on file is reported with their line, before anything is sent.
  if (rows.length) {
    const { data: existing } = await supabase.from("agents").select("email").eq("workspace_id", ws)
      .in("email", rows.map((row) => row.email));
    const known = new Set((existing ?? []).map((agent) => String(agent.email ?? "").toLowerCase()));
    for (const row of rows) if (known.has(row.email)) problems.push(`Line ${row.line}: ${row.email} is already on file.`);
  }
  if (problems.length) {
    return { ok: false, message: "Nothing was sent. Fix these lines and try again:", problems };
  }

  const origin = await requestOrigin();
  if (!origin) return { ok: false, message: "Could not work out this site’s address to build the links. Please try again." };

  const sent: NonNullable<InviteResult["sent"]> = [];
  const failed: NonNullable<InviteResult["failed"]> = [];
  for (const row of rows) {
    const { token, hash } = newInviteToken();
    const { error } = await supabase.rpc("invite_agent", {
      ws, agent_name: row.name, agent_email: row.email, agent_office: row.officeId, split: row.split, token_hash: hash,
    });
    if (error) failed.push({ name: row.name, email: row.email, reason: failure(error).message ?? "Could not be invited." });
    else sent.push({ name: row.name, email: row.email, office: row.office, split: row.split, link: portalLink(origin, token) });
  }

  revalidatePath("/invite");
  revalidatePath("/agents");
  revalidatePath("/agent-onboarding");
  revalidatePath("/");
  if (!sent.length) return { ok: false, message: "Nobody was invited.", problems: failed.map((row) => `${row.name} (${row.email}): ${row.reason}`) };
  return {
    ok: true,
    message: `${sent.length} ${sent.length === 1 ? "agent" : "agents"} invited. Each has a private link that works for 14 days.`,
    sent,
    failed,
  };
}

/** A fresh onboarding link for someone already invited. The old link stops working. */
export async function reissueInvite(_prev: LinkResult, form: FormData): Promise<LinkResult> {
  const gate = await actionAccess("agents.invite");
  if ("denied" in gate) return { ok: false, message: gate.denied };
  const agent = uuid(form, "agent");
  if (!agent) return { ok: false, message: "That agent could not be found." };
  const origin = await requestOrigin();
  if (!origin) return { ok: false, message: "Could not work out this site’s address to build the link. Please try again." };

  const { token, hash } = newInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reissue_invite", { ws: gate.access.workspace.id, agent, token_hash: hash });
  if (error) return failure(error);
  revalidatePath(`/agents/${agent}`);
  revalidatePath("/agent-onboarding");
  return {
    ok: true,
    message: "New link made. It is shown only once and works for 14 days; the old link no longer works.",
    link: portalLink(origin, token),
  };
}

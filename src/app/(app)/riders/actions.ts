"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { parseTiers, readTiers, type Tier } from "@/lib/ops";
import { done, fail, failure, num, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

function refresh(agentId?: string | null) {
  revalidatePath("/riders");
  revalidatePath("/agents");
  revalidatePath("/teams");
  if (agentId) revalidatePath(`/agents/${agentId}`);
}

const DECISIONS: Record<string, string> = {
  approve: "Approved. The new rider is now the current one.",
  hold: "Held for review.",
  reopen: "Back in the waiting list.",
  undo: "Approval undone. The earlier rider is current again.",
};

/** Approve, hold, reopen or undo a tier move. The database checks who may and does the work. */
export async function decideTier(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("tiers.approve");
  if ("denied" in gate) return fail(gate.denied);
  const approval = uuid(form, "approval");
  const decision = text(form, "decision", 12);
  if (!approval || !(decision in DECISIONS)) return fail("That action is not available.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_tier", { ws: gate.access.workspace.id, approval, decision });
  if (error) return failure(error);
  refresh();
  return done(DECISIONS[decision]);
}

/** Record a signature the brokerage collected itself (for example on paper). */
export async function recordSignature(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  const rider = uuid(form, "rider");
  const signer = text(form, "signer", 120);
  if (!rider) return fail("That rider could not be found.");
  if (signer.length < 2) return fail("Enter the name of the person who signed.");
  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const { data: row } = await supabase.from("riders").select("agent_id").eq("id", rider).eq("workspace_id", ws).maybeSingle();
  const { error } = await supabase.rpc("mark_rider_signed", { ws, rider, signer });
  if (error) return failure(error);
  refresh(row?.agent_id as string | null | undefined);
  return done("Signature recorded. This rider is now the current one.");
}

/**
 * Draft a rider amendment for an agent or a team. It changes nothing about
 * pay until it is signed. Tiers are kept from the current rider unless new
 * ones are typed in.
 */
export async function draftRider(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  const agent = uuid(form, "agent");
  const team = uuid(form, "team");
  const pct = num(form, "pct");
  if (Boolean(agent) === Boolean(team)) return fail("Choose one agent or one team.");
  if (pct === null || pct < 0 || pct > 100) return fail("Enter a split from 0 to 100.");

  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  // The subject must be in this brokerage (row-level security hides anything else).
  const subject = agent
    ? await supabase.from("agents").select("id").eq("id", agent).eq("workspace_id", ws).maybeSingle()
    : await supabase.from("teams").select("id").eq("id", team!).eq("workspace_id", ws).maybeSingle();
  if (!subject.data) return fail(agent ? "That agent could not be found." : "That team could not be found.");

  let tiers: Tier[] = [];
  if (form.has("tiers")) {
    const parsed = parseTiers(text(form, "tiers", 2000));
    if ("problem" in parsed) return fail(parsed.problem);
    tiers = parsed.tiers;
  } else {
    const current = await supabase.from("riders").select("tiers").eq("workspace_id", ws)
      .eq(agent ? "agent_id" : "team_id", (agent ?? team)!).eq("is_current", true).maybeSingle();
    tiers = readTiers(current.data?.tiers);
  }

  const { error } = await supabase.rpc("draft_rider", {
    ws, agent, team, pct: Math.round(pct * 100) / 100,
    // With no tiers the database's own default (an empty list) applies.
    ...(tiers.length ? { rider_tiers: tiers } : {}),
  });
  if (error) return failure(error);
  refresh(agent);
  return done("Amendment drafted. It takes effect only once it is signed.");
}

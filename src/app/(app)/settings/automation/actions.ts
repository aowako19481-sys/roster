"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { parseTiers } from "@/lib/ops";
import { done, fail, failure, text, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/** Save what this brokerage wants Kinu to do by itself. */
export async function saveAutomation(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("settings.manage");
  if ("denied" in gate) return fail(gate.denied);
  const parsed = parseTiers(text(form, "tiers", 2000));
  if ("problem" in parsed) return fail(parsed.problem);
  if (!parsed.tiers.length) return fail("Add at least one tier, for example: 0, , 70");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_automation", {
    ws: gate.access.workspace.id, tiers: parsed.tiers,
    pack_on_invite: form.get("pack_on_invite") === "on", rider_on_invite: form.get("rider_on_invite") === "on",
    rider_on_tier: form.get("rider_on_tier") === "on", team_mode: text(form, "team_mode", 10) === "members" ? "members" : "lead",
    prefill: form.get("prefill_splits") === "on",
    open_by_itself: form.get("auto_open_payroll") === "on",
    cutoff_by_itself: form.get("auto_cutoff") === "on",
  });
  if (error) return failure(error);
  revalidatePath("/settings/automation");
  return done("Saved. These apply from the next agent you invite and the next tier you approve.");
}

/** Save (or clear) the address of a state's official licence look-up page. */
export async function saveLicenceLookup(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("settings.manage");
  if ("denied" in gate) return fail(gate.denied);
  const state = text(form, "state", 2).toUpperCase();
  const url = text(form, "url", 400);
  if (!/^[A-Z]{2}$/.test(state)) return fail("Use the two-letter state code, like NY.");
  if (url && !/^https:\/\/\S{4,}$/.test(url)) return fail("Paste the full address of the state’s look-up page, starting with https://");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_licence_lookup", { ws: gate.access.workspace.id, lookup_state: state, lookup_url: url });
  if (error) return failure(error);
  revalidatePath("/settings/automation");
  revalidatePath("/agents");
  return done(url ? `Saved. Staff now reach the ${state} record in one click from any ${state} agent.` : `Removed the ${state} look-up.`);
}

/** What Kinu does on its own schedule, when nobody is signed in. */
export async function saveBackground(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("settings.manage");
  if ("denied" in gate) return fail(gate.denied);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_background", {
    ws: gate.access.workspace.id, chase: form.get("chase") === "on", nudge: form.get("nudge") === "on",
    licence: form.get("licence") === "on", weekly: form.get("weekly") === "on",
  });
  if (error) return failure(error);
  revalidatePath("/settings/automation");
  return done("Saved.");
}

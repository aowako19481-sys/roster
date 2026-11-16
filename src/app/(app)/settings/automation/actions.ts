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
  });
  if (error) return failure(error);
  revalidatePath("/settings/automation");
  return done("Saved. These apply from the next agent you invite and the next tier you approve.");
}

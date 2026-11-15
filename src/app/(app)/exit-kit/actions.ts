"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { todayIso } from "@/lib/format";
import { done, fail, failure, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

export async function markExited(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("agents.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace;
  if (!ws.addons.includes("retention")) return fail("The Exit Kit is not part of this brokerage's plan.");
  const id = uuid(form, "agent");
  if (!id) return fail("Choose an agent first.");

  const supabase = await createClient();
  const { data: agent } = await supabase.from("agents").select("id, status").eq("id", id).eq("workspace_id", ws.id).maybeSingle();
  if (!agent) return fail("That agent could not be found.");
  if (agent.status === "exited") return fail("This agent is already marked as exited.");

  const { data, error } = await supabase.from("agents")
    .update({ status: "exited", exited_on: todayIso(ws.timezone) })
    .eq("id", id).eq("workspace_id", ws.id).select("id");
  if (error) return failure(error);
  if (!data?.length) return fail("That agent could not be found.");
  revalidatePath("/exit-kit");
  revalidatePath("/agents");
  revalidatePath("/retention");
  return done("Marked as exited today. Their onboarding link no longer works.");
}

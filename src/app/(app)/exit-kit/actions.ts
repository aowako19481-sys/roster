"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { packOut } from "@/lib/automation";
import { cancelEnvelope, documensoReady } from "@/lib/documenso";
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
  // A rider still waiting for this person's signature is withdrawn: they are leaving.
  const { data: waiting } = await supabase.from("sign_requests").select("id, envelope_id").eq("workspace_id", ws.id).eq("agent_id", id).in("status", ["sent", "opened"]);
  for (const request of waiting ?? []) {
    if (documensoReady()) await cancelEnvelope(request.envelope_id as string).catch(() => {});
    await supabase.rpc("update_sign_request", { ws: ws.id, request: request.id, new_status: "cancelled", signed_file: null, certificate_file: null });
  }
  // The brokerage's exit documents, if it has chosen any, go out for signature by themselves.
  const pack = await packOut(supabase, ws.id, ws.name, "exit", [id]).catch(() => ({ sent: 0, problems: [] as string[] }));
  revalidatePath("/exit-kit");
  revalidatePath("/agents");
  revalidatePath("/retention");
  revalidatePath("/sign");
  const also = [pack.sent ? ` ${pack.sent} exit document${pack.sent === 1 ? "" : "s"} sent for signature automatically.` : "", pack.problems.length ? ` Not sent automatically: ${[...new Set(pack.problems)].slice(0, 3).join("; ")}.` : ""].join("");
  return done(`Marked as exited today. Their onboarding link no longer works.${also}`);
}

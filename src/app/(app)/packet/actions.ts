"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const KINDS = ["sign", "acknowledge", "upload", "outside", "bank"] as const;
const BANK_WORDING =
  "I authorise my brokerage to pay my commissions by direct deposit into the account named below, and to correct any payment made in error. This stays in effect until I cancel it in writing.";
const MAX_BYTES = 10 * 1024 * 1024;

/** Add a document or step to the brokerage's onboarding packet. */
export async function addPacketItem(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;

  const title = text(form, "title", 120);
  const kind = text(form, "kind", 20);
  const body = text(form, "body", 4000);
  if (title.length < 2) return fail("Give the item a title.");
  if (!(KINDS as readonly string[]).includes(kind)) return fail("Choose what the agent has to do.");

  const supabase = await createClient();
  let filePath: string | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.type !== "application/pdf") return fail("The document must be a PDF.");
    if (file.size > MAX_BYTES) return fail("That file is larger than 10 MB.");
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (!(head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)) return fail("That file is not a valid PDF.");
    filePath = `${ws}/packet/${randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) return fail("We could not store that document. Please try again.");
  }

  const { count } = await supabase.from("packet_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
  const { error } = await supabase.from("packet_items").insert({
    workspace_id: ws,
    title,
    kind,
    body: body || (kind === "bank" ? BANK_WORDING : null),
    file_path: filePath,
    required: form.get("required") === "on",
    applies_to: form.get("team_only") === "on" ? "team" : "everyone",
    position: (count ?? 0) + 1,
  });
  if (error) return failure(error);
  revalidatePath("/packet");
  return done("Added to the packet.");
}

/** Switch an item off (kept for the record) or back on. */
export async function togglePacketItem(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  const id = uuid(form, "id");
  if (!id) return fail("Something went wrong. Reload the page and try again.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("packet_items")
    .update({ active: form.get("active") === "true" })
    .eq("id", id)
    .eq("workspace_id", gate.access.workspace.id);
  if (error) return failure(error);
  revalidatePath("/packet");
  return done();
}

/** Tick or untick a step that happens outside the app, for one agent. */
export async function markOutsideStep(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("agents.edit");
  if ("denied" in gate) return fail(gate.denied);
  const agent = uuid(form, "agent");
  const item = uuid(form, "item");
  if (!agent || !item) return fail("Something went wrong. Reload the page and try again.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_packet_item", {
    ws: gate.access.workspace.id,
    agent,
    item,
    is_done: form.get("done") === "true",
  });
  if (error) return failure(error);
  revalidatePath(`/packet/${agent}`);
  revalidatePath("/packet");
  return done();
}

"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { fillLabels } from "@/lib/autofill";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { storePaymentFile } from "@/lib/stored-file";
import { createClient } from "@/lib/supabase/server";

/** Drop a proof of payment or a bank receipt onto a deal. */
export async function attachFile(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payments.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const deal = uuid(form, "deal");
  const kind = text(form, "kind", 20);
  if (!deal) return fail("That deal could not be found.");
  if (kind !== "payment_proof" && kind !== "bank_receipt") return fail("Something went wrong. Reload the page and try again.");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Drop a file in the box first.");

  const supabase = await createClient();
  const stored = await storePaymentFile(supabase, ws, file);
  if ("message" in stored) return fail(stored.message);
  const { error } = await supabase.rpc("attach_deal_document", { ws, deal, doc_kind: kind, file_path: stored.path, file_name: stored.name });
  if (error) {
    // Do not leave a stored file behind with nothing pointing at it.
    await supabase.storage.from("documents").remove([stored.path]);
    return failure(error);
  }
  revalidatePath(`/deals/${deal}/documents`);
  return done(kind === "bank_receipt" ? "Bank receipt attached." : "Proof of payment attached.");
}

export async function removeFile(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payments.manage");
  if ("denied" in gate) return fail(gate.denied);
  const doc = uuid(form, "doc");
  const deal = uuid(form, "deal");
  if (!doc || !deal) return fail("That file could not be found.");
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("remove_deal_document", { ws: gate.access.workspace.id, doc });
  if (error) return failure(error);
  if (typeof path === "string" && path) await supabase.storage.from("documents").remove([path]);
  revalidatePath(`/deals/${deal}/documents`);
  return done("Removed.");
}

/** Save what was typed into a document's fill-in boxes for this deal. */
export async function saveFilled(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const deal = uuid(form, "deal");
  const template = uuid(form, "template");
  if (!deal || !template) return fail("Something went wrong. Reload the page and try again.");

  const supabase = await createClient();
  const { data: row } = await supabase.from("doc_templates").select("body").eq("id", template).eq("workspace_id", ws).maybeSingle();
  if (!row) return fail("That document could not be found.");
  // Only the boxes the layout actually asks for are kept.
  const filled: Record<string, string> = {};
  fillLabels(row.body).forEach((label, index) => {
    const value = text(form, `fill_${index}`, 300);
    if (value) filled[label] = value;
  });
  const { error } = await supabase
    .from("deal_doc_values")
    .upsert({ deal_id: deal, template_id: template, workspace_id: ws, filled, updated_at: new Date().toISOString() }, { onConflict: "deal_id,template_id" });
  if (error) return failure(error);
  revalidatePath(`/deals/${deal}/documents`);
  return done("Saved to the document.");
}

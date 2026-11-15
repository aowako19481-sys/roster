"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionAccess } from "@/lib/access";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/** Create or change one of the brokerage's autofill documents. Managers only. */
export async function saveTemplate(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;

  const id = text(form, "id", 40) ? uuid(form, "id") : null;
  const name = text(form, "name", 80);
  const rawBody = form.get("body");
  const body = typeof rawBody === "string" ? rawBody.replace(/\r\n?/g, "\n").slice(0, 20000) : "";
  if (name.length < 2) return fail("Give the document a name.");
  if (body.trim().length < 1) return fail("Write the layout: it cannot be empty.");

  const row = {
    name,
    body,
    purpose: form.get("purpose") === "deal" ? "deal" : "deposit_record",
    attach_proof: form.get("attach_proof") === "on",
    attach_receipt: form.get("attach_receipt") === "on",
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("doc_templates").update(row).eq("id", id).eq("workspace_id", ws);
    if (error) return failure(error);
    revalidatePath(`/templates/${id}`);
    revalidatePath("/templates");
    return done("Saved. Every deal now uses this layout.");
  }
  const { data, error } = await supabase.from("doc_templates").insert({ ...row, workspace_id: ws, created_by: gate.access.userId }).select("id");
  if (error) return failure(error);
  revalidatePath("/templates");
  const created = (data as { id: string }[] | null)?.[0]?.id;
  if (created) redirect(`/templates/${created}`);
  return done("Created.");
}

/** Switch a document off (it stays on file) or back on. Managers only. */
export async function toggleTemplate(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const id = uuid(form, "id");
  if (!id) return fail("That document could not be found.");
  const supabase = await createClient();
  const { error } = await supabase.from("doc_templates").update({ active: form.get("active") === "true" }).eq("id", id).eq("workspace_id", gate.access.workspace.id);
  if (error) return failure(error);
  revalidatePath("/templates");
  return done();
}

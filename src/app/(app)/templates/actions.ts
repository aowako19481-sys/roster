"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionAccess } from "@/lib/access";
import { randomUUID } from "node:crypto";
import { FIELD_SOURCES, guessSource } from "@/lib/autofill";
import { readPdfFields, type PdfField } from "@/lib/pdf";
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

const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Upload the brokerage's own PDF form as an autofill document. Managers only. */
export async function uploadPdfTemplate(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const name = text(form, "name", 80);
  if (name.length < 2) return fail("Give the document a name.");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Drop your PDF in the box first.");
  if (file.type !== "application/pdf") return fail("The file must be a PDF.");
  if (file.size > MAX_PDF_BYTES) return fail("That file is larger than 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return fail("That file is not a valid PDF.");
  const read = await readPdfFields(bytes);
  if ("message" in read) return fail(read.message);

  const supabase = await createClient();
  const path = `${ws}/templates/${randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) return fail("We could not store that PDF. Please try again.");
  const fieldMap = Object.fromEntries(read.fields.filter((field) => field.type === "text").map((field) => [field.name, guessSource(field.name)]).filter(([, source]) => source));
  const { data, error } = await supabase
    .from("doc_templates")
    .insert({
      workspace_id: ws, created_by: gate.access.userId, name, body: "PDF form",
      purpose: form.get("purpose") === "deal" ? "deal" : "deposit_record",
      attach_proof: false, attach_receipt: form.get("attach_receipt") === "on",
      file_path: path, fields: read.fields, field_map: fieldMap,
    })
    .select("id");
  if (error) {
    await supabase.storage.from("documents").remove([path]);
    return failure(error);
  }
  revalidatePath("/templates");
  const created = (data as { id: string }[] | null)?.[0]?.id;
  if (created) redirect(`/templates/${created}`);
  return done("Uploaded.");
}

/** Say what goes into each field of a PDF form. Managers only. */
export async function savePdfMap(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const id = uuid(form, "id");
  if (!id) return fail("That document could not be found.");
  const supabase = await createClient();
  const { data: template } = await supabase.from("doc_templates").select("fields, file_path").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!template?.file_path) return fail("That document could not be found.");

  // Only fields the PDF really has, and only sources this app knows, are kept.
  const fieldMap: Record<string, string> = {};
  ((template.fields ?? []) as PdfField[]).forEach((field, index) => {
    const choice = text(form, `map_${index}`, 40);
    if (choice === "fill") {
      const label = text(form, `label_${index}`, 60) || field.name.slice(0, 60);
      fieldMap[field.name] = `fill:${label}`;
    } else if (FIELD_SOURCES.some((source) => source.key === choice)) fieldMap[field.name] = choice;
  });
  const name = text(form, "name", 80);
  const { error } = await supabase
    .from("doc_templates")
    .update({
      field_map: fieldMap, ...(name.length >= 2 ? { name } : {}),
      purpose: form.get("purpose") === "deal" ? "deal" : "deposit_record",
      attach_receipt: form.get("attach_receipt") === "on", updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", ws);
  if (error) return failure(error);
  revalidatePath(`/templates/${id}`);
  revalidatePath("/templates");
  return done("Saved. Every deal now fills this PDF in.");
}

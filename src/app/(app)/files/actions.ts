"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { docKind, safeFilename, sniffType, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from "@/lib/ops";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/**
 * Add a file to a cabinet. The type and size are checked here on the server
 * (the first bytes must match the claimed type), and the name it arrived
 * with is never used as a path.
 */
export async function uploadFile(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("files.manage");
  if ("denied" in gate) return fail(gate.denied);
  const kind = docKind(text(form, "kind", 20));
  const agentRaw = text(form, "agent", 40);
  const agent = uuid(form, "agent");
  const note = text(form, "note", 200);
  const file = form.get("file");
  if (!kind) return fail("Choose a cabinet for this file.");
  if (agentRaw && !agent) return fail("Choose an agent from the list.");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file to upload.");
  if (file.size > UPLOAD_MAX_BYTES) return fail("That file is larger than 10 MB.");
  const extension = UPLOAD_TYPES[file.type];
  if (!extension) return fail("Only PDF, JPEG, PNG or WebP files can be uploaded.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > UPLOAD_MAX_BYTES) return fail("That file is larger than 10 MB.");
  if (sniffType(bytes) !== file.type) return fail("That file is not a real PDF, JPEG, PNG or WebP.");

  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  if (agent) {
    const { data: found } = await supabase.from("agents").select("id").eq("id", agent).eq("workspace_id", ws).maybeSingle();
    if (!found) return fail("Choose an agent from the list.");
  }

  const filename = safeFilename(file.name, extension);
  const path = `${ws}/files/${randomUUID()}-${filename}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("upload failed", uploadError.message.slice(0, 200));
    return fail("The file could not be stored. Please try again.");
  }
  const { error } = await supabase.from("documents")
    .insert({ workspace_id: ws, agent_id: agent, kind: kind.kind, filename, path, status: "on_file", note: note || null });
  if (error) return failure(error);
  revalidatePath("/files");
  if (agent) revalidatePath(`/agents/${agent}`);
  return done(`${filename} added to ${kind.label}.`);
}

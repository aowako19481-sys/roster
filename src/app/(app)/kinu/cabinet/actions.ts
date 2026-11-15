"use server";

import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/access";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { BILLING_BUCKET, storeBillingFile } from "@/lib/stored-file";
import { createClient } from "@/lib/supabase/server";

/** The founder only. The database and the file store both check again. */
async function founderOnly(): Promise<string | null> {
  const access = await getAccess();
  if (!access) return "Please sign in again.";
  if (!access.isFounder) return "Only the founder can use the filing cabinet.";
  return null;
}

export async function fileInCabinet(_prev: Result, form: FormData): Promise<Result> {
  const denied = await founderOnly();
  if (denied) return fail(denied);
  const title = text(form, "title", 160);
  if (!title) return fail("Give the document a title.");
  const folder = text(form, "new_folder", 60) || text(form, "folder", 60) || "General";
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Drop a file in the box first.");
  const supabase = await createClient();
  const stored = await storeBillingFile(supabase, "founder", file);
  if ("message" in stored) return fail(stored.message);
  const { error } = await supabase.from("founder_files").insert({ folder, title, file_path: stored.path, file_name: stored.name, note: text(form, "note", 500) || null });
  if (error) {
    await supabase.storage.from(BILLING_BUCKET).remove([stored.path]);
    return failure(error);
  }
  revalidatePath("/kinu/cabinet");
  return done(`Filed under ${folder}.`);
}

export async function removeFromCabinet(_prev: Result, form: FormData): Promise<Result> {
  const denied = await founderOnly();
  if (denied) return fail(denied);
  const id = uuid(form, "id");
  if (!id) return fail("That document could not be found.");
  const supabase = await createClient();
  const { data } = await supabase.from("founder_files").delete().eq("id", id).select("file_path");
  const path = (data as { file_path: string }[] | null)?.[0]?.file_path;
  if (path) await supabase.storage.from(BILLING_BUCKET).remove([path]);
  revalidatePath("/kinu/cabinet");
  return done("Removed.");
}

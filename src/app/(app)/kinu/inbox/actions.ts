"use server";

import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/access";
import { done, fail, failure, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/** Mark a website message as dealt with, or put it back. Staff only; the database checks again. */
export async function handleLead(_prev: Result, form: FormData): Promise<Result> {
  const access = await getAccess();
  if (!access?.isPlatformAdmin) return fail("You are not allowed to do that.");
  const id = uuid(form, "id");
  if (!id) return fail("That message could not be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("handle_lead", { lead: id, is_handled: form.get("handled") === "true" });
  if (error) return failure(error);
  revalidatePath("/kinu/inbox");
  return done();
}

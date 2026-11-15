"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { EMAIL_RE } from "@/lib/ops";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/** Office, phone and email only. Splits change through a rider amendment, never here. */
export async function saveAgentDetails(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("agents.edit");
  if ("denied" in gate) return fail(gate.denied);
  const id = uuid(form, "id");
  const officeId = uuid(form, "office");
  const phone = text(form, "phone", 40);
  const email = text(form, "email", 254).toLowerCase();
  if (!id) return fail("That agent could not be found.");
  if (!officeId) return fail("Choose an office.");
  if (!EMAIL_RE.test(email)) return fail("Enter a valid email address.");
  const digits = phone.replace(/\D/g, "");
  if (phone && (digits.length < 10 || digits.length > 15 || !/^[0-9+().\-\s]+$/.test(phone))) {
    return fail("Enter a phone number with area code, or leave it empty.");
  }

  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const { data: office } = await supabase.from("offices").select("id, name").eq("id", officeId).eq("workspace_id", ws).maybeSingle();
  if (!office) return fail("Choose an office from the list.");
  const { data: clash } = await supabase.from("agents").select("id").eq("workspace_id", ws).eq("email", email).neq("id", id).limit(1);
  if (clash?.length) return fail("Another agent already uses that email address.");

  const { data, error } = await supabase.from("agents")
    .update({ office_id: office.id, office: office.name, phone: phone || null, email })
    .eq("id", id).eq("workspace_id", ws).select("id");
  if (error) return failure(error);
  if (!data?.length) return fail("That agent could not be found.");
  revalidatePath(`/agents/${id}`);
  revalidatePath("/agents");
  return done("Saved. The change is in the audit trail.");
}

/** Staff confirm a licence against the state record, or flag a mismatch with a note. */
export async function reviewLicence(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("riders.manage");
  if ("denied" in gate) return fail(gate.denied);
  const agent = uuid(form, "agent");
  const verdict = text(form, "verdict", 12);
  const note = text(form, "note", 200);
  if (!agent) return fail("That agent could not be found.");
  if (verdict !== "verified" && verdict !== "mismatch") return fail("That action is not available.");
  if (verdict === "mismatch" && note.length < 3) return fail("Say briefly what does not match.");

  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const { data: found } = await supabase.from("agents").select("id").eq("id", agent).eq("workspace_id", ws).maybeSingle();
  if (!found) return fail("That agent could not be found.");
  const { error } = await supabase.rpc("review_licence", { ws, agent, verdict, note: verdict === "mismatch" ? note : null });
  if (error) return failure(error);
  revalidatePath(`/agents/${agent}`);
  revalidatePath("/agents");
  revalidatePath("/files");
  return done(verdict === "verified" ? "Licence confirmed." : "Licence flagged as a mismatch.");
}

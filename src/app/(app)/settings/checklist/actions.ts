"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { DEFAULT_CHECKLIST } from "@/lib/finance";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const refresh = () => revalidatePath("/settings/checklist");

/** Add a box to the checklist every new deal starts with. Managers only. */
export async function addChecklistItem(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const label = text(form, "label", 120);
  if (!label) return fail("Type what the box should say.");
  const supabase = await createClient();
  const { data: existing } = await supabase.from("checklist_items").select("id, label").eq("workspace_id", ws).limit(60);
  if ((existing?.length ?? 0) >= 40) return fail("A checklist can have up to 40 boxes.");
  if (existing?.some((item) => (item.label as string).toLowerCase() === label.toLowerCase())) return fail("That box is already on the list.");
  // The first box a brokerage adds turns the standard list into its own, so nothing is lost.
  const rows = existing?.length ? [] : DEFAULT_CHECKLIST.map((standard, position) => ({ workspace_id: ws, label: standard as string, position }));
  if (!rows.some((row) => row.label.toLowerCase() === label.toLowerCase())) rows.push({ workspace_id: ws, label, position: (existing?.length ?? 0) + rows.length });
  const { error } = await supabase.from("checklist_items").insert(rows);
  if (error) return failure(error);
  refresh();
  return done("Added. New deals will start with it.");
}

/** Switch a box off (new deals stop getting it) or back on, or remove it. */
export async function changeChecklistItem(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const supabase = await createClient();
  const what = text(form, "what", 12);
  if (what === "start") {
    // Make the standard list the brokerage's own so it can be edited.
    const { count } = await supabase.from("checklist_items").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    if (!count) {
      const { error } = await supabase.from("checklist_items").insert(DEFAULT_CHECKLIST.map((label, position) => ({ workspace_id: ws, label: label as string, position })));
      if (error) return failure(error);
    }
    refresh();
    return done();
  }
  const id = uuid(form, "id");
  if (!id) return fail("That box could not be found.");
  const query = what === "remove"
    ? supabase.from("checklist_items").delete().eq("id", id).eq("workspace_id", ws)
    : supabase.from("checklist_items").update({ active: what === "on" }).eq("id", id).eq("workspace_id", ws);
  const { error } = await query;
  if (error) return failure(error);
  refresh();
  return done();
}

/** Name the system the brokerage keeps its deal files in. */
export async function saveDealSystem(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_deal_system", { ws: gate.access.workspace.id, system_name: text(form, "system", 40) });
  if (error) return failure(error);
  refresh();
  revalidatePath("/deals", "layout");
  return done("Saved.");
}

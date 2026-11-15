"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { WEEKDAYS, ticked, timeField, timezoneField } from "@/lib/admin-pages";
import { done, fail, failure, num, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const ALIAS = /^([a-z0-9][a-z0-9._+-]{1,63}|[^\s@]+@[^\s@]+\.[^\s@]{2,})$/;

export async function saveSettings(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("settings.manage");
  if ("denied" in gate) return fail(gate.denied);

  const timezone = timezoneField(form, "timezone");
  if (!timezone) return fail("Choose a time zone from the list.");
  const weekdays = WEEKDAYS.filter((weekday) => ticked(form, `day_${weekday.value}`)).map((weekday) => weekday.value);
  if (!weekdays.length) return fail("Pick at least one payroll day.");
  const cutoff = timeField(form, "cutoff");
  const close = timeField(form, "close");
  if (!cutoff || !close) return fail("Enter the cutoff and close times as hours and minutes.");
  if (close <= cutoff) return fail("The close time must be later in the day than the cutoff.");
  const alias = text(form, "alias", 254).toLowerCase();
  if (alias && !ALIAS.test(alias)) return fail("The reply-to alias should be a short name or an email address, with no spaces.");
  const maxTeams = num(form, "max_teams");
  if (maxTeams === null || !Number.isInteger(maxTeams) || maxTeams < 1 || maxTeams > 10) {
    return fail("Maximum teams per agent must be a whole number from 1 to 10.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_settings", {
    ws: gate.access.workspace.id,
    ws_timezone: timezone,
    ws_weekdays: weekdays,
    ws_cutoff: cutoff,
    ws_close: close,
    ws_alias: alias || null,
    ws_max_teams: maxTeams,
  });
  if (error) return failure(error);
  revalidatePath("/", "layout");
  return done("Settings saved.");
}

export async function addOffice(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("settings.manage");
  if ("denied" in gate) return fail(gate.denied);
  const name = text(form, "name", 80);
  if (name.length < 2) return fail("Give the office a name.");
  const supabase = await createClient();
  const { error } = await supabase.from("offices").insert({ workspace_id: gate.access.workspace.id, name });
  if (error) return error.code === "23505" ? fail("There is already an office with that name.") : failure(error);
  revalidatePath("/settings");
  return done("Office added.");
}

export async function renameOffice(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("settings.manage");
  if ("denied" in gate) return fail(gate.denied);
  const id = uuid(form, "id");
  const name = text(form, "name", 80);
  if (!id) return fail("That office could not be found.");
  if (name.length < 2) return fail("Give the office a name.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("offices").update({ name })
    .eq("id", id).eq("workspace_id", gate.access.workspace.id).select("id");
  if (error) return error.code === "23505" ? fail("There is already an office with that name.") : failure(error);
  if (!data?.length) return fail("That office could not be found.");
  revalidatePath("/settings");
  return done("Renamed.");
}

export async function removeOffice(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("settings.manage");
  if ("denied" in gate) return fail(gate.denied);
  const id = uuid(form, "id");
  if (!id) return fail("That office could not be found.");
  const supabase = await createClient();
  const ws = gate.access.workspace.id;
  const { count } = await supabase.from("offices").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
  if (typeof count === "number" && count <= 1) return fail("A brokerage needs at least one office.");
  const { data, error } = await supabase.from("offices").delete().eq("id", id).eq("workspace_id", ws).select("id");
  if (error) return failure(error);
  if (!data?.length) return fail("That office could not be found.");
  revalidatePath("/settings");
  return done("Office removed.");
}

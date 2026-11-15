"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { addDays } from "@/lib/finance";
import { todayIso } from "@/lib/format";
import { done, fail, failure, isoDate, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/payroll");
  revalidatePath("/finance");
  revalidatePath("/deals");
  revalidatePath("/payouts");
}

export async function openPayroll(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace;
  const payDate = isoDate(form, "pay_date");
  if (!payDate) return fail("Choose the payroll date.");
  const today = todayIso(ws.timezone);
  if (payDate < addDays(today, -366) || payDate > addDays(today, 366)) return fail("Choose a payroll date within a year of today.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_payroll", { ws: ws.id, pay: payDate });
  if (error) return failure(error);
  refresh();
  return done("Payroll opened.");
}

export async function runCutoff(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const payroll = uuid(form, "payroll");
  if (!payroll) return fail("That payroll could not be found.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_cutoff", { ws: gate.access.workspace.id, payroll });
  if (error) return failure(error);
  refresh();
  const counts = (data ?? {}) as { processed?: number; held?: number };
  return done(`Cutoff run: ${counts.processed ?? 0} cleared ${counts.processed === 1 ? "deal" : "deals"} in, ${counts.held ?? 0} moved to the Held folder.`);
}

export async function addToPayroll(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const payroll = uuid(form, "payroll");
  const deal = uuid(form, "deal");
  if (!payroll) return fail("Choose a payroll.");
  if (!deal) return fail("Choose a deal to add.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_to_payroll", { ws: gate.access.workspace.id, payroll, deal });
  if (error) return failure(error);
  refresh();
  revalidatePath(`/deals/${deal}`);
  return done("Added to the payroll.");
}

/** Records the decision to pay. No money moves: finance pays through its own systems. */
export async function releasePayroll(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.release");
  if ("denied" in gate) return fail(gate.denied);
  const payroll = uuid(form, "payroll");
  if (!payroll) return fail("That payroll could not be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_payroll", { ws: gate.access.workspace.id, payroll });
  if (error) return failure(error);
  refresh();
  return done("Release recorded. Pay the agents through your own systems.");
}

export async function closePayroll(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return fail(gate.denied);
  const payroll = uuid(form, "payroll");
  if (!payroll) return fail("That payroll could not be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_payroll", { ws: gate.access.workspace.id, payroll });
  if (error) return failure(error);
  refresh();
  revalidatePath("/statements");
  return done("Payroll closed. Its deals are now Closed.");
}

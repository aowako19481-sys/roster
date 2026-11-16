"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { rulesOf } from "@/lib/automation";
import { addDays, upcomingPayDates } from "@/lib/finance";
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

/**
 * What this brokerage has set payroll to do by itself: open the next run on
 * its pay days, and run the cutoff once its time has passed. It runs when
 * someone who manages payroll has the page open. It never releases anything.
 */
export async function autoPayroll(): Promise<Result> {
  const gate = await actionAccess("payroll.manage");
  if ("denied" in gate) return done();
  const ws = gate.access.workspace;
  const supabase = await createClient();
  const rules = await rulesOf(supabase, ws.id);
  const said: string[] = [];
  const today = todayIso(ws.timezone);
  const label = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  if (rules.auto_open_payroll) {
    // Only when no run is open: the next pay day after the latest run already on the calendar.
    const [{ data: settings }, { data: open }, { data: latest }] = await Promise.all([
      supabase.from("workspaces").select("payroll_weekdays").eq("id", ws.id).maybeSingle(),
      supabase.from("payrolls").select("id").eq("workspace_id", ws.id).eq("status", "open").limit(1),
      supabase.from("payrolls").select("pay_date").eq("workspace_id", ws.id).gte("pay_date", today).order("pay_date", { ascending: false }).limit(1),
    ]);
    const from = latest?.[0]?.pay_date ? addDays(latest[0].pay_date as string, 1) : today;
    const next = upcomingPayDates(settings?.payroll_weekdays as number[] | null | undefined, from, 1)[0];
    if (next && !open?.length) {
      const { error } = await supabase.rpc("open_payroll", { ws: ws.id, pay: next });
      if (!error) said.push(`Kinu opened the payroll for ${label(next)}.`);
    }
  }
  if (rules.auto_cutoff) {
    const { data: due } = await supabase.from("payrolls").select("id, pay_date, cutoff_at").eq("workspace_id", ws.id).eq("status", "open").lte("cutoff_at", new Date().toISOString()).order("pay_date").limit(6);
    for (const payroll of due ?? []) {
      const { data, error } = await supabase.rpc("run_cutoff", { ws: ws.id, payroll: payroll.id });
      if (error) break;   // an earlier run needs attention first; a person will see why on the page
      const counts = (data ?? {}) as { processed?: number; held?: number };
      said.push(`The cutoff for ${label(payroll.pay_date as string)} ran by itself: ${counts.processed ?? 0} cleared ${counts.processed === 1 ? "deal" : "deals"} in, ${counts.held ?? 0} held.`);
    }
  }
  if (!said.length) return done();
  refresh();
  return done(`${said.join(" ")} Nothing has been released: that is still your decision.`);
}

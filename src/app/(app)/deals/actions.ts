"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionAccess } from "@/lib/access";
import {
  DEAL_TYPE_VALUES, DEFAULT_CHECKLIST, OVERRIDE_REASON_VALUES, PARTY_KIND_VALUES, checkLabel, isFrozen, toCents,
} from "@/lib/finance";
import { done, fail, failure, isoDate, num, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Duplicate = { id: string; address: string; deal_type: string; status: string; gci: number };
export type DealFormState = Result & { duplicates?: Duplicate[] };

const MAX_ROWS = 40;

function refresh(dealId?: string) {
  if (dealId) revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/finance");
  revalidatePath("/payouts");
}

/** The deal, if it is in this brokerage and this person may see it. */
async function findDeal(supabase: Supabase, ws: string, id: string) {
  const { data } = await supabase.from("deals").select("id, status, address").eq("id", id).eq("workspace_id", ws).maybeSingle();
  return data as { id: string; status: string; address: string } | null;
}
const FROZEN = "This deal is in a payroll and can no longer be changed.";

// ------------------------------------------------------------- new deal --

export async function createDeal(_prev: DealFormState, form: FormData): Promise<DealFormState> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;

  const address = text(form, "address", 200);
  const dealType = text(form, "deal_type", 20);
  const gciRaw = num(form, "gci");
  const depositRaw = text(form, "deposit_date", 12);
  const deposit = isoDate(form, "deposit_date");
  const officeRaw = text(form, "office_id", 40);
  const office = uuid(form, "office_id");
  const ppNumber = text(form, "pp_number", 40);

  if (address.length < 3) return fail("Enter the address.");
  if (!DEAL_TYPE_VALUES.includes(dealType)) return fail("Choose the deal type.");
  if (gciRaw === null || gciRaw < 0 || gciRaw > 9_999_999_999) return fail("Enter the GCI as an amount of zero or more.");
  if (depositRaw && !deposit) return fail("The deposit date is not a valid date.");
  if (officeRaw && !office) return fail("Choose an office from the list.");
  const gci = toCents(gciRaw);

  const parties: { kind: string; name: string }[] = [];
  for (let i = 0; i < MAX_ROWS; i += 1) {
    const name = text(form, `party${i}_name`, 160);
    const kind = text(form, `party${i}_kind`, 20);
    if (!name) continue;
    if (!PARTY_KIND_VALUES.includes(kind)) return fail("Choose landlord, tenant, seller or buyer for each party.");
    parties.push({ kind, name });
  }

  const lines: { agent_id: string; basis: string; share_pct: number; split_pct: number }[] = [];
  for (let i = 0; i < MAX_ROWS; i += 1) {
    if (!form.has(`line${i}_agent`)) continue;
    const agent = uuid(form, `line${i}_agent`);
    const basis = text(form, `line${i}_basis`, 12);
    const share = num(form, `line${i}_share`);
    const split = num(form, `line${i}_split`);
    if (!agent) return fail("Choose an agent on every agent line (or remove the empty line).");
    if (basis !== "individual" && basis !== "team") return fail("Choose individual or team for each agent.");
    if (share === null || share < 0 || share > 100) return fail("Each agent's share must be between 0 and 100.");
    if (split === null || split < 0 || split > 100) return fail("Type each agent's split, between 0 and 100, from the notice of contract.");
    if (lines.some((line) => line.agent_id === agent)) return fail("The same agent is on this deal twice. Put them on one line.");
    lines.push({ agent_id: agent, basis, share_pct: toCents(share), split_pct: toCents(split) });
  }
  if (lines.length === 0) return fail("Add at least one agent.");
  const shareTotal = toCents(lines.reduce((sum, line) => sum + line.share_pct, 0));
  if (shareTotal !== 100) return fail(`The agents' shares add up to ${shareTotal}%. They must total 100%.`);

  const fees: { kind: string; payee: string; amount: number }[] = [];
  for (let i = 0; i < MAX_ROWS; i += 1) {
    if (!form.has(`fee${i}_kind`)) continue;
    const kind = text(form, `fee${i}_kind`, 12);
    const payee = text(form, `fee${i}_payee`, 160);
    const amount = num(form, `fee${i}_amount`);
    if (!payee && amount === null) continue;
    if (kind !== "referral" && kind !== "outside") return fail("Each fee must be a referral fee or an outside-brokerage fee.");
    if (!payee) return fail("Say who each fee is paid to.");
    if (amount === null || amount < 0 || amount > 9_999_999_999) return fail("Enter each fee as an amount of zero or more.");
    fees.push({ kind, payee, amount: toCents(amount) });
  }

  const supabase = await createClient();

  if (office) {
    const { data: found } = await supabase.from("offices").select("id").eq("id", office).eq("workspace_id", ws).maybeSingle();
    if (!found) return fail("Choose an office from the list.");
  }
  const { data: known } = await supabase.from("agents").select("id").eq("workspace_id", ws).in("id", lines.map((line) => line.agent_id));
  if ((known?.length ?? 0) !== lines.length) return fail("One of the agents is not in this brokerage.");

  // "Is this a dual?" The same address already on file is a question, not an error.
  if (form.get("confirm_dual") !== "yes") {
    const { data: same, error } = await supabase.rpc("find_duplicates", { ws, deal_address: address });
    if (error) return failure(error);
    const duplicates = (same ?? []) as Duplicate[];
    if (duplicates.length > 0) {
      return { ok: false, message: "This address is already on file. Is this a dual?", duplicates };
    }
  }

  const { data: deal, error: dealError } = await supabase.from("deals")
    .insert({
      workspace_id: ws, address, deal_type: dealType, gci, deposit_date: deposit, office_id: office,
      pp_number: ppNumber || null, parties, created_by: gate.access.userId,
    })
    .select("id").single();
  if (dealError || !deal) return failure(dealError);
  const dealId = (deal as { id: string }).id;

  // The rider check and the payouts are worked out by the database as these rows are saved.
  const steps = [
    supabase.from("deal_agents").insert(lines.map((line) => ({ ...line, deal_id: dealId, workspace_id: ws }))),
    fees.length ? supabase.from("deal_fees").insert(fees.map((fee) => ({ ...fee, deal_id: dealId, workspace_id: ws }))) : null,
    supabase.from("deal_checklist").insert(DEFAULT_CHECKLIST.map((label, position) => ({ deal_id: dealId, workspace_id: ws, label, position }))),
  ];
  for (const step of steps) {
    if (!step) continue;
    const { error } = await step;
    if (error) {
      // Do not leave half a deal behind.
      await supabase.from("deals").delete().eq("id", dealId).eq("workspace_id", ws);
      return failure(error, "The deal could not be saved. Nothing was kept. Please try again.");
    }
  }

  refresh();
  redirect(`/deals/${dealId}`);
}

// ------------------------------------------------------------ agent lines --

/**
 * Change a deal's details after it was created. The database freezes deals
 * that are already in a payroll, works the payouts out again, and sends a
 * cleared deal back to open if its GCI or type changed.
 */
export async function editDeal(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const id = uuid(form, "id");
  if (!id) return fail("That deal could not be found.");

  const address = text(form, "address", 200);
  const gci = num(form, "gci");
  const dealType = text(form, "deal_type", 20);
  const depositTyped = text(form, "deposit_date", 12);
  const deposit = depositTyped ? isoDate(form, "deposit_date") : null;
  const pp = text(form, "pp_number", 40);
  if (address.length < 3) return fail("Type the address.");
  if (gci === null || gci < 0 || gci > 100_000_000) return fail("Type the GCI as an amount, for example 14250.00.");
  if (!DEAL_TYPE_VALUES.includes(dealType)) return fail("Choose the deal type.");
  if (depositTyped && !deposit) return fail("The deposit date is not a valid date.");

  const supabase = await createClient();
  const deal = await findDeal(supabase, ws, id);
  if (!deal) return fail("That deal could not be found.");
  if (isFrozen(deal.status)) return fail(FROZEN);

  // Same address already on file? Ask, rather than refuse: it may be a dual.
  if (address.toLowerCase() !== deal.address.toLowerCase() && form.get("confirm_dual") !== "on") {
    const { data: twins } = await supabase.rpc("find_duplicates", { ws, deal_address: address, skip: id });
    if (Array.isArray(twins) && twins.length > 0) {
      return fail("Another deal already uses that address. Is this a dual? If it is a separate deal, tick the box below and save again.");
    }
  }

  const { data, error } = await supabase.from("deals")
    .update({ address, gci: toCents(gci), deal_type: dealType, deposit_date: deposit, pp_number: pp || null })
    .eq("id", id).eq("workspace_id", ws)
    .select("status");
  if (error) return failure(error);
  const saved = (data as { status: string }[] | null)?.[0];
  if (!saved) return fail("That deal could not be found.");
  refresh(id);
  return done(
    deal.status === "cleared" && saved.status === "open"
      ? "Saved. Because the money or type changed, this deal is open again and needs clearing for payroll."
      : "Saved. Payouts and the rider check have been worked out again.",
  );
}

export async function saveLine(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const id = uuid(form, "line");
  const split = num(form, "split");
  const basis = text(form, "basis", 12);
  if (!id) return fail("That line could not be found.");
  if (split === null || split < 0 || split > 100) return fail("Type the split, between 0 and 100.");
  if (basis !== "individual" && basis !== "team") return fail("Choose individual or team.");

  const supabase = await createClient();
  const { data, error } = await supabase.from("deal_agents")
    .update({ split_pct: toCents(split), basis })
    .eq("id", id).eq("workspace_id", ws)
    .select("deal_id, check_status, check_reason");
  if (error) return failure(error);
  const row = (data as { deal_id: string; check_status: string; check_reason: string | null }[] | null)?.[0];
  if (!row) return fail("That line could not be found.");
  refresh(row.deal_id);
  return done(`Saved. Rider check: ${checkLabel(row.check_status)}.${row.check_reason ? ` ${row.check_reason}` : ""}`);
}

export async function pushThrough(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const id = uuid(form, "line");
  if (!id) return fail("That line could not be found.");
  const supabase = await createClient();
  const { data: line } = await supabase.from("deal_agents").select("deal_id").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!line) return fail("That line could not be found.");
  const { error } = await supabase.rpc("push_through", { ws, line: id });
  if (error) return failure(error);
  refresh((line as { deal_id: string }).deal_id);
  return done("Pushed through at the current rider.");
}

export async function overrideLine(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("override");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const id = uuid(form, "line");
  const reason = text(form, "reason", 40);
  const note = text(form, "note", 500);
  if (!id) return fail("That line could not be found.");
  if (!OVERRIDE_REASON_VALUES.includes(reason)) return fail("Pick a reason from the list.");
  if (note.length < 10) return fail("Add a note of at least 10 characters.");
  const supabase = await createClient();
  const { data: line } = await supabase.from("deal_agents").select("deal_id").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!line) return fail("That line could not be found.");
  const { error } = await supabase.rpc("override_line", { ws, line: id, reason, note });
  if (error) return failure(error);
  refresh((line as { deal_id: string }).deal_id);
  return done("Override recorded and logged.");
}

// ------------------------------------------------------------------- fees --

export async function addFee(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const dealId = uuid(form, "deal");
  const kind = text(form, "kind", 12);
  const payee = text(form, "payee", 160);
  const amount = num(form, "amount");
  if (!dealId) return fail("That deal could not be found.");
  if (kind !== "referral" && kind !== "outside") return fail("Choose referral fee or outside-brokerage fee.");
  if (!payee) return fail("Say who the fee is paid to.");
  if (amount === null || amount < 0 || amount > 9_999_999_999) return fail("Enter the fee as an amount of zero or more.");
  const supabase = await createClient();
  const deal = await findDeal(supabase, ws, dealId);
  if (!deal) return fail("That deal could not be found.");
  if (isFrozen(deal.status)) return fail(FROZEN);
  const { error } = await supabase.from("deal_fees").insert({ deal_id: dealId, workspace_id: ws, kind, payee, amount: toCents(amount) });
  if (error) return failure(error);
  refresh(dealId);
  return done("Fee added. Payouts updated.");
}

export async function removeFee(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const id = uuid(form, "fee");
  if (!id) return fail("That fee could not be found.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("deal_fees").delete().eq("id", id).eq("workspace_id", ws).select("deal_id");
  if (error) return failure(error);
  const row = (data as { deal_id: string }[] | null)?.[0];
  if (!row) return fail("That fee could not be found.");
  refresh(row.deal_id);
  return done("Fee removed. Payouts updated.");
}

// -------------------------------------------------------------- checklist --

export async function tickItem(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const id = uuid(form, "item");
  const dealId = uuid(form, "deal");
  const ticked = form.get("done") === "on";
  if (!id || !dealId) return fail("That item could not be found.");
  const supabase = await createClient();
  const deal = await findDeal(supabase, ws, dealId);
  if (!deal) return fail("That deal could not be found.");
  if (isFrozen(deal.status)) return fail(FROZEN);
  const { data, error } = await supabase.from("deal_checklist")
    .update({ done: ticked, done_at: ticked ? new Date().toISOString() : null })
    .eq("id", id).eq("deal_id", dealId).eq("workspace_id", ws).select("id");
  if (error) return failure(error);
  if (!data?.length) return fail("That item could not be found.");
  refresh(dealId);
  return done();
}

/**
 * "Send agent email". Nothing is sent yet (the email service is a
 * placeholder): this records the intent by marking the deal as waiting on
 * the agent, which the audit log picks up.
 */
export async function sendAgentEmail(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const dealId = uuid(form, "deal");
  if (!dealId) return fail("That deal could not be found.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("deals").update({ waiting_on: "agent" })
    .eq("id", dealId).eq("workspace_id", ws).select("id");
  if (error) return failure(error);
  if (!data?.length) return fail("That deal could not be found.");
  refresh(dealId);
  return done("Recorded. This deal now shows as waiting on the agent. No email was sent: the email service is not connected yet.");
}

export async function setWaiting(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.edit");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const dealId = uuid(form, "deal");
  const waiting = text(form, "waiting_on", 10);
  if (!dealId) return fail("That deal could not be found.");
  if (!["finance", "agent", "nobody"].includes(waiting)) return fail("Choose who the deal is waiting on.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("deals").update({ waiting_on: waiting })
    .eq("id", dealId).eq("workspace_id", ws).select("id");
  if (error) return failure(error);
  if (!data?.length) return fail("That deal could not be found.");
  refresh(dealId);
  return done("Saved.");
}

// ----------------------------------------------------------------- status --

/** Clear for payroll, hold (with a reason) or reopen. The database checks the rider first. */
export async function setDealStatus(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("deals.hold");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const dealId = uuid(form, "deal");
  const intent = text(form, "intent", 10);
  const reason = text(form, "reason", 300);
  if (!dealId) return fail("That deal could not be found.");
  const next = intent === "clear" ? "cleared" : intent === "hold" ? "held" : intent === "reopen" ? "open" : null;
  if (!next) return fail("Choose clear, hold or reopen.");
  if (next === "held" && reason.length < 3) return fail("Give a reason for holding this deal.");

  const supabase = await createClient();
  const { data, error } = await supabase.from("deals")
    .update(next === "held" ? { status: next, held_reason: reason } : { status: next })
    .eq("id", dealId).eq("workspace_id", ws).select("id");
  if (error) return failure(error);
  if (!data?.length) return fail("That deal could not be found.");
  refresh(dealId);
  revalidatePath("/payroll");
  return done(next === "cleared" ? "Cleared for payroll." : next === "held" ? "Held. It is now in the Held folder." : "Reopened.");
}

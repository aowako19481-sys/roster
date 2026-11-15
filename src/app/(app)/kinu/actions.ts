"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { ADDONS, PLANS, WORKSPACE_STATUSES, addonsField, emailField, monthField, monthLabel, pieceUnlocked, planPiece, ticked, timezoneField } from "@/lib/admin-pages";
import { done, fail, failure, isoDate, num, text, uuid, type Result } from "@/lib/result";
import { BILLING_BUCKET, storeBillingFile } from "@/lib/stored-file";
import { createClient } from "@/lib/supabase/server";
import { ensureLogin } from "@/lib/invite-login";

/** Staff-only actions. The database checks again on every call. */
async function staffOnly(): Promise<string | null> {
  const access = await getAccess();
  if (!access) return "Please sign in again.";
  if (!access.isPlatformAdmin) return "You are not allowed to do that.";
  return null;
}

type Filed = { path: string; name: string };

/** A file field from a form, or null if nothing was chosen. */
function fileField(form: FormData, name: string): File | null {
  const value = form.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

/** Plan and seats typed into a form, checked. */
function accountFields(form: FormData): { plan: string; ownerSeats: number; agentSeats: number | null; quote: number | null } | string {
  const plan = text(form, "plan", 20) || "standard";
  if (!PLANS.some((entry) => entry.key === plan)) return "Choose a plan from the list.";
  const ownerSeats = num(form, "owner_seats") ?? 1;
  if (!Number.isInteger(ownerSeats) || ownerSeats < 1 || ownerSeats > 100) return "Owner / Admin seats must be a whole number from 1 to 100.";
  const agentSeats = num(form, "agent_seats");
  if (agentSeats !== null && (!Number.isInteger(agentSeats) || agentSeats < 1 || agentSeats > 1000000)) return "Agent seats must be a whole number, or left empty for no limit.";
  const quote = num(form, "quote");
  if (quote !== null && (quote < 0 || quote > 10000000)) return "The quoted monthly price does not look right.";
  return { plan, ownerSeats, agentSeats, quote };
}

/**
 * Create a brokerage account. The invoice sent to the client is required, so
 * every account starts with its first month filed.
 */
export async function createBrokerage(_prev: Result, form: FormData): Promise<Result> {
  const denied = await staffOnly();
  if (denied) return fail(denied);

  const name = text(form, "name", 120);
  if (name.length < 2) return fail("Give the brokerage a name.");
  const ops = ticked(form, "ops");
  const finance = ticked(form, "finance");
  if (!ops && !finance) return fail("Choose at least one product.");
  const timezone = timezoneField(form, "timezone");
  if (!timezone) return fail("Choose a time zone from the list.");
  const ownerTyped = text(form, "owner_email", 254);
  const owner = ownerTyped ? emailField(form, "owner_email") : null;
  if (ownerTyped && !owner) return fail("The owner's email does not look right.");
  const account = accountFields(form);
  if (typeof account === "string") return fail(account);

  const month = monthField(form, "month");
  if (!month) return fail("Choose the month the invoice is for.");
  const amount = num(form, "amount");
  if (amount === null || amount < 0) return fail("Enter the amount on the invoice.");
  const invoice = fileField(form, "invoice");
  if (!invoice) return fail("Attach the invoice you sent the client.");
  const proof = fileField(form, "proof");
  const paidOn = isoDate(form, "paid_on");
  const contract = fileField(form, "contract");
  const contractStart = isoDate(form, "contract_start");
  const contractEnd = isoDate(form, "contract_end");
  if (contract && (!contractStart || !contractEnd || contractEnd < contractStart)) return fail("Give the contract a start date and a later end date.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_create_workspace", {
    ws_name: name,
    ws_ops: ops,
    ws_finance: finance,
    ws_addons: addonsField(form),
    ws_timezone: timezone,
    owner_email: owner,
  });
  if (error) return failure(error);
  if (typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data)) return fail("The brokerage could not be created. Please try again.");
  const id = data;

  // From here the brokerage exists. Anything that fails is reported on its file, not by creating it twice.
  const problems: string[] = [];
  const { error: accountError } = await supabase.rpc("platform_set_account", {
    ws: id, new_plan: account.plan, new_owner_seats: account.ownerSeats, new_agent_seats: account.agentSeats, new_quote: account.quote,
  });
  if (accountError) problems.push("plan");
  if (owner && (await ensureLogin(owner)) === "ready") {
    await supabase.rpc("invite_member", { ws: id, invite_email: owner, invite_role: "owner_admin", invite_office: null });
  }

  const actor = (await getAccess())?.displayName ?? "Kinu staff";
  const storedInvoice = await storeBillingFile(supabase, id, invoice);
  const storedProof = proof ? await storeBillingFile(supabase, id, proof) : null;
  if ("message" in storedInvoice) problems.push("invoice");
  if (storedProof && "message" in storedProof) problems.push("proof");
  const filedInvoice = "path" in storedInvoice ? (storedInvoice as Filed) : null;
  const filedProof = storedProof && "path" in storedProof ? (storedProof as Filed) : null;
  const { error: monthError } = await supabase.from("billing_months").insert({
    workspace_id: id, month, amount, invoice_no: text(form, "invoice_no", 60) || null,
    invoice_path: filedInvoice?.path ?? null, invoice_name: filedInvoice?.name ?? null,
    proof_path: filedProof?.path ?? null, proof_name: filedProof?.name ?? null,
    payment_ref: text(form, "payment_ref", 80) || null, paid_on: paidOn ?? (filedProof ? new Date().toISOString().slice(0, 10) : null),
    updated_by: actor,
  });
  if (monthError) problems.push("billing");
  if (contract && contractStart && contractEnd) {
    const storedContract = await storeBillingFile(supabase, id, contract);
    if ("message" in storedContract) problems.push("contract");
    else {
      const { error: contractError } = await supabase.from("contracts").insert({
        workspace_id: id, starts_on: contractStart, ends_on: contractEnd, file_path: storedContract.path, file_name: storedContract.name, created_by: actor,
      });
      if (contractError) problems.push("contract");
    }
  }
  revalidatePath("/kinu");
  redirect(problems.length ? `/kinu/${id}?tab=billing&check=${problems.join(",")}` : `/kinu/${id}`);
}

/** Change a brokerage's plan, its seats and its quoted price. */
export async function setAccount(_prev: Result, form: FormData): Promise<Result> {
  const denied = await staffOnly();
  if (denied) return fail(denied);
  const id = uuid(form, "id");
  if (!id) return fail("That brokerage could not be found.");
  const account = accountFields(form);
  if (typeof account === "string") return fail(account);
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_account", {
    ws: id, new_plan: account.plan, new_owner_seats: account.ownerSeats, new_agent_seats: account.agentSeats, new_quote: account.quote,
  });
  if (error) return failure(error);
  revalidatePath("/kinu");
  revalidatePath(`/kinu/${id}`);
  return done("Saved.");
}

/** File a month's invoice and proof of payment, or add to a month already filed. */
export async function fileMonth(_prev: Result, form: FormData): Promise<Result> {
  const denied = await staffOnly();
  if (denied) return fail(denied);
  const id = uuid(form, "id");
  if (!id) return fail("That brokerage could not be found.");
  const month = monthField(form, "month");
  if (!month) return fail("Choose the month.");
  const amount = num(form, "amount");
  if (amount !== null && amount < 0) return fail("The amount cannot be negative.");
  const invoice = fileField(form, "invoice");
  const proof = fileField(form, "proof");

  const supabase = await createClient();
  const { data: existing } = await supabase.from("billing_months").select("*").eq("workspace_id", id).eq("month", month).maybeSingle();
  if (!existing && !invoice) return fail("Attach the invoice for this month.");
  if (!existing && amount === null) return fail("Enter the amount on the invoice.");

  const storedInvoice = invoice ? await storeBillingFile(supabase, id, invoice) : null;
  if (storedInvoice && "message" in storedInvoice) return fail(storedInvoice.message);
  const storedProof = proof ? await storeBillingFile(supabase, id, proof) : null;
  if (storedProof && "message" in storedProof) return fail(storedProof.message);
  const newInvoice = storedInvoice as Filed | null;
  const newProof = storedProof as Filed | null;

  const paidOn = isoDate(form, "paid_on");
  const row = {
    workspace_id: id, month,
    amount: amount ?? existing?.amount ?? null,
    invoice_no: text(form, "invoice_no", 60) || existing?.invoice_no || null,
    invoice_path: newInvoice?.path ?? existing?.invoice_path ?? null,
    invoice_name: newInvoice?.name ?? existing?.invoice_name ?? null,
    proof_path: newProof?.path ?? existing?.proof_path ?? null,
    proof_name: newProof?.name ?? existing?.proof_name ?? null,
    payment_ref: text(form, "payment_ref", 80) || existing?.payment_ref || null,
    paid_on: paidOn ?? existing?.paid_on ?? (newProof ? new Date().toISOString().slice(0, 10) : null),
    note: text(form, "note", 500) || existing?.note || null,
    updated_at: new Date().toISOString(),
    updated_by: (await getAccess())?.displayName ?? "Kinu staff",
  };
  const { error } = await supabase.from("billing_months").upsert(row, { onConflict: "workspace_id,month" });
  if (error) {
    const orphans = [newInvoice?.path, newProof?.path].filter((path): path is string => Boolean(path));
    if (orphans.length) await supabase.storage.from(BILLING_BUCKET).remove(orphans);
    return failure(error);
  }
  // A replaced file is removed so only the current one is kept.
  const replaced = [newInvoice && existing?.invoice_path, newProof && existing?.proof_path].filter((path): path is string => typeof path === "string" && path.length > 0);
  if (replaced.length) await supabase.storage.from(BILLING_BUCKET).remove(replaced);
  revalidatePath("/kinu");
  revalidatePath(`/kinu/${id}`);
  return done(`${monthLabel(month)} filed.`);
}

/** File a contract under the brokerage. */
export async function addContract(_prev: Result, form: FormData): Promise<Result> {
  const denied = await staffOnly();
  if (denied) return fail(denied);
  const id = uuid(form, "id");
  if (!id) return fail("That brokerage could not be found.");
  const start = isoDate(form, "starts_on");
  const end = isoDate(form, "ends_on");
  if (!start || !end || end < start) return fail("Give the contract a start date and a later end date.");
  const file = fileField(form, "contract");
  if (!file) return fail("Attach the signed contract.");
  const supabase = await createClient();
  const stored = await storeBillingFile(supabase, id, file);
  if ("message" in stored) return fail(stored.message);
  const { error } = await supabase.from("contracts").insert({
    workspace_id: id, title: text(form, "title", 120) || "Service agreement", starts_on: start, ends_on: end,
    file_path: stored.path, file_name: stored.name, note: text(form, "note", 500) || null,
    created_by: (await getAccess())?.displayName ?? "Kinu staff",
  });
  if (error) {
    await supabase.storage.from(BILLING_BUCKET).remove([stored.path]);
    return failure(error);
  }
  revalidatePath("/kinu");
  revalidatePath(`/kinu/${id}`);
  return done("Contract filed.");
}

/** Remove a contract filed by mistake. */
export async function removeContract(_prev: Result, form: FormData): Promise<Result> {
  const denied = await staffOnly();
  if (denied) return fail(denied);
  const id = uuid(form, "id");
  const contract = uuid(form, "contract");
  if (!id || !contract) return fail("That contract could not be found.");
  const supabase = await createClient();
  const { data } = await supabase.from("contracts").delete().eq("id", contract).eq("workspace_id", id).select("file_path");
  const path = (data as { file_path: string }[] | null)?.[0]?.file_path;
  if (path) await supabase.storage.from(BILLING_BUCKET).remove([path]);
  revalidatePath(`/kinu/${id}`);
  return done("Removed.");
}

export async function updateBrokerage(_prev: Result, form: FormData): Promise<Result> {
  const denied = await staffOnly();
  if (denied) return fail(denied);

  const id = uuid(form, "id");
  if (!id) return fail("That brokerage could not be found.");
  const name = text(form, "name", 120);
  if (name.length < 2) return fail("Give the brokerage a name.");
  const status = text(form, "status", 12);
  if (!(WORKSPACE_STATUSES as readonly string[]).includes(status)) return fail("Choose a status from the list.");

  const supabase = await createClient();
  const { data: ws } = await supabase.from("workspaces").select("id, addons").eq("id", id).maybeSingle();
  if (!ws) return fail("That brokerage could not be found.");
  // Products and add-ons are changed piece by piece (setPlanPiece). The current
  // add-on list is sent back unchanged, because the database replaces it with
  // whatever list it is given.
  const { error } = await supabase.rpc("platform_update_workspace", {
    ws: id,
    ws_name: name,
    ws_addons: ADDONS.map((addon) => addon.key as string).filter((key) => ((ws.addons ?? []) as string[]).includes(key)),
    ws_status: status,
  });
  if (error) return failure(error);
  revalidatePath("/kinu");
  revalidatePath(`/kinu/${id}`);
  revalidatePath("/", "layout");
  return done("Saved.");
}

export async function inviteOwner(_prev: Result, form: FormData): Promise<Result> {
  const denied = await staffOnly();
  if (denied) return fail(denied);

  const id = uuid(form, "id");
  if (!id) return fail("That brokerage could not be found.");
  const email = emailField(form, "email");
  if (!email) return fail("Enter the owner's work email.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_member", { ws: id, invite_email: email, invite_role: "owner_admin", invite_office: null });
  if (error) return failure(error);

  // Did they join straight away (they already had a login) or is the invitation waiting?
  const lookup = () => supabase.from("member_invites").select("accepted_at").eq("workspace_id", id).eq("email", email).maybeSingle();
  let { data: invite } = await lookup();
  if (!invite?.accepted_at && (await ensureLogin(email)) === "ready") {
    await supabase.rpc("invite_member", { ws: id, invite_email: email, invite_role: "owner_admin", invite_office: null });
    ({ data: invite } = await lookup());
  }
  revalidatePath("/kinu");
  revalidatePath(`/kinu/${id}`);
  return done(invite?.accepted_at
    ? "Added as an owner. They can sign in with that email now."
    : "Invitation recorded. They will be able to sign in once the server key is added.");
}

/** Lock or unlock one piece of a brokerage's plan, leaving every other piece as it is. */
export async function setPlanPiece(_prev: Result, form: FormData): Promise<Result> {
  const denied = await staffOnly();
  if (denied) return fail(denied);

  const id = uuid(form, "id");
  if (!id) return fail("That brokerage could not be found.");
  const piece = planPiece(text(form, "piece", 20));
  if (!piece) return fail("Choose a piece of the plan from the list.");
  const want = text(form, "to", 10);
  if (want !== "locked" && want !== "unlocked") return fail("Choose whether to lock or unlock it.");
  const unlock = want === "unlocked";

  const supabase = await createClient();
  const { data: ws } = await supabase.from("workspaces").select("id, has_ops, has_finance, addons").eq("id", id).maybeSingle();
  if (!ws) return fail("That brokerage could not be found.");
  if (pieceUnlocked(ws, piece.key) === unlock) return done(`${piece.label} is already ${want}.`);

  // Only the one piece changes. The add-on list is always sent in full, because
  // the database replaces it with whatever list it is given.
  const current: string[] = ws.addons ?? [];
  const args: { ws: string; ws_addons: string[]; ws_ops?: boolean; ws_finance?: boolean } = {
    ws: id,
    ws_addons: ADDONS.map((addon) => addon.key as string).filter((key) => (key === piece.key ? unlock : current.includes(key))),
  };
  if (piece.key === "ops" || piece.key === "finance") {
    const other = piece.key === "ops" ? ws.has_finance : ws.has_ops;
    if (!unlock && !other) {
      return fail("A brokerage cannot have both Ops and Finance locked. To stop it being used, set its status to Paused instead.");
    }
    if (piece.key === "ops") args.ws_ops = unlock; else args.ws_finance = unlock;
  }

  const { error } = await supabase.rpc("platform_update_workspace", args);
  if (error) return failure(error);
  revalidatePath("/kinu");
  revalidatePath(`/kinu/${id}`);
  revalidatePath("/", "layout");
  return done(`${piece.label} ${want}.`);
}

/** The contact details and picture on a brokerage's ID card. */
export async function setProfile(_prev: Result, form: FormData): Promise<Result> {
  const denied = await staffOnly();
  if (denied) return fail(denied);
  const id = uuid(form, "id");
  if (!id) return fail("That brokerage could not be found.");
  const emailTyped = text(form, "contact_email", 254);
  if (emailTyped && !emailField(form, "contact_email")) return fail("The contact email does not look right.");
  const website = text(form, "website", 200);
  if (website && !/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(website)) return fail("The website address does not look right.");

  const supabase = await createClient();
  let logo: string | null = null;
  const picture = fileField(form, "logo");
  if (picture) {
    if (!picture.type.startsWith("image/")) return fail("The picture must be a JPEG, PNG or WebP image.");
    const stored = await storeBillingFile(supabase, id, picture);
    if ("message" in stored) return fail(stored.message);
    logo = stored.path;
  }
  const { data: before } = logo ? await supabase.from("workspaces").select("logo_path").eq("id", id).maybeSingle() : { data: null };
  const { error } = await supabase.rpc("platform_set_profile", {
    ws: id, new_contact: text(form, "contact_name", 120), new_email: emailTyped.toLowerCase(), new_phone: text(form, "contact_phone", 40),
    new_address: text(form, "address", 240), new_website: website, new_logo: logo,
  });
  if (error) {
    if (logo) await supabase.storage.from(BILLING_BUCKET).remove([logo]);
    return failure(error);
  }
  if (logo && before?.logo_path) await supabase.storage.from(BILLING_BUCKET).remove([before.logo_path]);
  revalidatePath(`/kinu/${id}`);
  return done("Saved to the ID card.");
}

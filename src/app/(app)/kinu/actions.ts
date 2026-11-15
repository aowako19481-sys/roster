"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { ADDONS, WORKSPACE_STATUSES, addonsField, emailField, pieceUnlocked, planPiece, ticked, timezoneField } from "@/lib/admin-pages";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/** Staff-only actions. The database checks again on every call. */
async function staffOnly(): Promise<string | null> {
  const access = await getAccess();
  if (!access) return "Please sign in again.";
  if (!access.isPlatformAdmin) return "You are not allowed to do that.";
  return null;
}

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
  revalidatePath("/kinu");
  if (typeof data === "string" && /^[0-9a-f-]{36}$/i.test(data)) redirect(`/kinu/${data}`);
  return done("Brokerage created.");
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
  const { data: invite } = await supabase.from("member_invites").select("accepted_at")
    .eq("workspace_id", id).eq("email", email).maybeSingle();
  revalidatePath("/kinu");
  revalidatePath(`/kinu/${id}`);
  return done(invite?.accepted_at
    ? "Added as an owner. They already had a login, so they can sign in now."
    : "Invitation recorded. It is waiting until this person has a login.");
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

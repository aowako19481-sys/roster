"use server";

import { revalidatePath } from "next/cache";
import { actionAccess } from "@/lib/access";
import { emailField, roleField, ticked } from "@/lib/admin-pages";
import { done, fail, failure, text, uuid, type Result } from "@/lib/result";
import { BUILT_IN_ROLES, CAP_GROUPS } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseSecretKey } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

const PAGE = "/settings/people";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An office chosen in a form must be one of this brokerage's own. */
async function officeInWorkspace(supabase: Db, ws: string, office: string): Promise<boolean> {
  const { data } = await supabase.from("offices").select("id").eq("id", office).eq("workspace_id", ws).maybeSingle();
  return Boolean(data);
}

export async function updateMember(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("members.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;

  const member = uuid(form, "member");
  if (!member) return fail("That person could not be found.");
  const name = text(form, "name", 120);
  const choice = text(form, "role", 60);
  const officeTyped = text(form, "office", 40);
  const office = officeTyped ? uuid(form, "office") : null;
  if (officeTyped && !office) return fail("Choose an office from the list.");

  const supabase = await createClient();
  const { data: current } = await supabase.from("workspace_members")
    .select("user_id, role, office_id, custom_role_id, display_name")
    .eq("workspace_id", ws).eq("user_id", member).maybeSingle();
  if (!current) return fail("That person could not be found.");

  let newRole: string | null = null;
  let newCustom: string | null = null;
  let clearCustom = false;
  if (choice.startsWith("role:")) {
    const role = choice.slice(5);
    if (!(BUILT_IN_ROLES as readonly string[]).includes(role)) return fail("Choose a role from the list.");
    if (role !== current.role) newRole = role;
    clearCustom = current.custom_role_id !== null;
  } else if (choice.startsWith("custom:")) {
    const id = choice.slice(7);
    if (!UUID.test(id)) return fail("Choose a role from the list.");
    const { data: custom } = await supabase.from("custom_roles").select("id").eq("id", id).eq("workspace_id", ws).maybeSingle();
    if (!custom) return fail("That custom role no longer exists.");
    if (id !== current.custom_role_id) newCustom = id;
  } else {
    return fail("Choose a role from the list.");
  }

  if (office && office !== current.office_id && !(await officeInWorkspace(supabase, ws, office))) {
    return fail("Choose an office from the list.");
  }
  const clearOffice = !office && current.office_id !== null;
  const newOffice = office && office !== current.office_id ? office : null;
  const newName = name && name !== (current.display_name ?? "") ? name : null;

  if (!newRole && !newCustom && !clearCustom && !clearOffice && !newOffice && !newName) return done("Nothing to change.");

  const { error } = await supabase.rpc("set_member", {
    ws,
    member,
    new_role: newRole,
    new_status: null,
    new_office: newOffice,
    new_custom_role: newCustom,
    clear_office: clearOffice,
    clear_custom_role: clearCustom,
    new_name: newName,
  });
  if (error) return failure(error);
  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  return done(newRole ? "Saved. Changing the role removed any big powers this person had." : "Saved.");
}

async function setStatus(form: FormData, status: "active" | "removed"): Promise<Result> {
  const gate = await actionAccess("members.manage");
  if ("denied" in gate) return fail(gate.denied);
  const member = uuid(form, "member");
  if (!member) return fail("That person could not be found.");
  if (status === "removed" && member === gate.access.userId) {
    return fail("You cannot remove yourself. Ask another admin to do it.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member", {
    ws: gate.access.workspace.id,
    member,
    new_role: null,
    new_status: status,
    new_office: null,
    new_custom_role: null,
    clear_office: false,
    clear_custom_role: false,
    new_name: null,
  });
  if (error) return failure(error);
  revalidatePath(PAGE);
  return done(status === "removed" ? "Removed. They can no longer open this brokerage." : "Access restored.");
}

export async function removeMember(_prev: Result, form: FormData): Promise<Result> {
  return setStatus(form, "removed");
}

export async function restoreMember(_prev: Result, form: FormData): Promise<Result> {
  return setStatus(form, "active");
}

export async function inviteMember(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("members.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;

  const email = emailField(form, "email");
  if (!email) return fail("Enter a work email, like name@brokerage.com.");
  const role = roleField(form, "role");
  if (!role) return fail("Choose a role from the list.");
  const officeTyped = text(form, "office", 40);
  const office = officeTyped ? uuid(form, "office") : null;
  if (officeTyped && !office) return fail("Choose an office from the list.");

  const supabase = await createClient();
  if (office && !(await officeInWorkspace(supabase, ws, office))) return fail("Choose an office from the list.");

  const args = { ws, invite_email: email, invite_role: role, invite_office: office };
  const { error } = await supabase.rpc("invite_member", args);
  if (error) return failure(error);

  // With the server key in place, give the person a login so they can sign
  // in, then ask the database again: it adds an existing user straight away.
  let loginProblem = false;
  if (supabaseSecretKey()) {
    const admin = createAdminClient();
    if (admin) {
      const created = await admin.auth.admin.createUser({ email, email_confirm: true });
      const already = created.error
        && (created.error.code === "email_exists" || /already (been )?registered|already exists/i.test(created.error.message ?? ""));
      if (created.error && !already) {
        console.error("invite: could not create login", created.error.code ?? created.error.status);
        loginProblem = true;
      } else {
        const again = await supabase.rpc("invite_member", args);
        if (again.error) return failure(again.error);
      }
    }
  }

  const { data: invite } = await supabase.from("member_invites").select("accepted_at")
    .eq("workspace_id", ws).eq("email", email).maybeSingle();
  revalidatePath(PAGE);
  if (invite?.accepted_at) return done("Added. They can sign in with that email now.");
  if (loginProblem) return done("Invitation recorded, but their login could not be created just now. Invite them again in a moment.");
  return done("Invitation recorded. They will be able to sign in once the server key is added.");
}

export async function cancelInvite(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("members.manage");
  if ("denied" in gate) return fail(gate.denied);
  const invite = uuid(form, "invite");
  if (!invite) return fail("That invitation could not be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invite", { ws: gate.access.workspace.id, invite });
  if (error) return failure(error);
  revalidatePath(PAGE);
  return done("Invitation cancelled.");
}

/** Big powers. Only an owner may do this; the database is what enforces it. */
export async function setPower(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("members.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const member = uuid(form, "member");
  const power = text(form, "power", 20);
  const granted = text(form, "granted", 5);
  if (!member) return fail("That person could not be found.");
  if (power !== "override" && power !== "payroll.release") return fail("Choose a power from the list.");
  if (granted !== "yes" && granted !== "no") return fail("Choose whether to grant or remove it.");

  const supabase = await createClient();
  const { data: target } = await supabase.from("workspace_members").select("user_id, status")
    .eq("workspace_id", ws).eq("user_id", member).maybeSingle();
  if (!target || target.status !== "active") return fail("That person is not an active member of this brokerage.");

  const { error } = await supabase.rpc("grant_power", { ws, member, power, granted: granted === "yes" });
  if (error) return failure(error);
  revalidatePath(PAGE);
  const label = power === "override" ? "Override" : "Release payroll";
  return done(granted === "yes" ? `${label} granted. This is in the audit log.` : `${label} removed. This is in the audit log.`);
}

const ROLE_CAPS = CAP_GROUPS.flatMap((group) => group.caps.map((entry) => entry.cap));

export async function saveRole(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("members.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;

  const idTyped = text(form, "role_id", 40);
  const id = idTyped ? uuid(form, "role_id") : null;
  if (idTyped && !id) return fail("That role could not be found.");
  const name = text(form, "name", 60);
  if (name.length < 2) return fail("Give the role a name.");
  const caps = ROLE_CAPS.filter((cap) => ticked(form, `cap_${cap}`));
  if (!caps.length) return fail("Tick at least one thing this role can see or do.");
  const officeTyped = text(form, "office", 40);
  const office = officeTyped ? uuid(form, "office") : null;
  if (officeTyped && !office) return fail("Choose an office from the list.");

  const supabase = await createClient();
  if (office && !(await officeInWorkspace(supabase, ws, office))) return fail("Choose an office from the list.");
  if (id) {
    const { data: existing } = await supabase.from("custom_roles").select("id").eq("id", id).eq("workspace_id", ws).maybeSingle();
    if (!existing) return fail("That role could not be found.");
  }

  const { error } = await supabase.rpc("save_custom_role", { ws, role_id: id, role_name: name, role_caps: caps, role_office: office });
  if (error) return error.code === "23505" ? fail("There is already a role with that name.") : failure(error);
  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  return done(id ? "Role saved." : "Role created.");
}

export async function deleteRole(_prev: Result, form: FormData): Promise<Result> {
  const gate = await actionAccess("members.manage");
  if ("denied" in gate) return fail(gate.denied);
  const ws = gate.access.workspace.id;
  const id = uuid(form, "role_id");
  if (!id) return fail("That role could not be found.");
  const supabase = await createClient();
  const { count } = await supabase.from("workspace_members").select("user_id", { count: "exact", head: true })
    .eq("workspace_id", ws).eq("custom_role_id", id).eq("status", "active");
  if (typeof count === "number" && count > 0) {
    return fail(`${count === 1 ? "1 person still has" : `${count} people still have`} this role. Give them another role first.`);
  }
  const { error } = await supabase.rpc("delete_custom_role", { ws, role_id: id });
  if (error) return failure(error);
  revalidatePath(PAGE);
  return done("Role deleted.");
}

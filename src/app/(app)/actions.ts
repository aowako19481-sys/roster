"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOOK_COOKIE, VIEW_AS_COOKIE, WORKSPACE_COOKIE, getAccess } from "@/lib/access";
import { BUILT_IN_ROLES } from "@/lib/roles";
import { sessionCookieOptions } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Ends the session on this device and returns to the sign-in page. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const jar = await cookies();
  jar.delete(WORKSPACE_COOKIE);
  jar.delete(VIEW_AS_COOKIE);
  redirect("/sign-in");
}

/**
 * Records that the signed-in person has seen the first-run tour. The database
 * function stamps only the caller's own row, with the server's time.
 */
export async function completeTour() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_tour_seen");
  if (error) console.error("tour: could not save", error.code);
}

/**
 * Choose which brokerage to look at. The choice is only a preference: the
 * database decides on every request whether this person may see it.
 */
export async function switchWorkspace(form: FormData) {
  const wanted = String(form.get("ws") ?? "");
  const access = await getAccess();
  const jar = await cookies();
  if (access?.workspaces.some((w) => w.id === wanted)) {
    jar.set(WORKSPACE_COOKIE, wanted, { ...sessionCookieOptions, maxAge: 60 * 60 * 24 * 30 });
    jar.delete(VIEW_AS_COOKIE);
  }
  redirect("/");
}

/** Kinu staff: step back out of a brokerage to the console. */
export async function leaveWorkspace() {
  const jar = await cookies();
  jar.delete(WORKSPACE_COOKIE);
  jar.delete(VIEW_AS_COOKIE);
  redirect("/kinu");
}

/** Preview the app as another role. Owners and Kinu staff only; it never grants anything. */
export async function setViewAs(form: FormData) {
  const role = String(form.get("role") ?? "");
  const access = await getAccess();
  const jar = await cookies();
  const allowed = access && (access.isPlatformAdmin || access.role === "owner_admin");
  if (allowed && (BUILT_IN_ROLES as readonly string[]).includes(role)) {
    jar.set(VIEW_AS_COOKIE, role, { ...sessionCookieOptions, maxAge: 60 * 60 * 8 });
  } else {
    jar.delete(VIEW_AS_COOKIE);
  }
  redirect("/");
}

/** The founder console's colours. A preference only; it grants nothing. */
export async function setLook(form: FormData) {
  const jar = await cookies();
  jar.set(LOOK_COOKIE, form.get("look") === "violet" ? "violet" : "silver", { ...sessionCookieOptions, maxAge: 60 * 60 * 24 * 365 });
  redirect("/kinu");
}

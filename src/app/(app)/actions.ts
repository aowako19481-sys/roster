"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Ends the session on this device and returns to the sign-in page. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
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

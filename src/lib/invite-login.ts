import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Makes sure an invited person has a login, so they can sign in by email.
 * This is one of only two jobs the server's secret key is used for (the other
 * is the agent onboarding portal). It creates a login and nothing else: what
 * the person can see is still decided by their invitation and role.
 *
 * Call it only AFTER the invitation itself has been accepted by the database
 * (which checks the caller's permission).
 */
export async function ensureLogin(email: string): Promise<"ready" | "no-key" | "failed"> {
  const admin = createAdminClient();
  if (!admin) return "no-key";
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!created.error) return "ready";
  const already = created.error.code === "email_exists" || /already (been )?registered|already exists/i.test(created.error.message ?? "");
  if (already) return "ready";
  console.error("invite: could not create login", created.error.code ?? created.error.status);
  return "failed";
}

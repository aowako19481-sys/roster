import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv, supabaseSecretKey } from "./env";

/**
 * A client that bypasses row-level security. Use it ONLY where there is no
 * signed-in user to act as, and check what the caller may do in code first:
 *   - src/lib/portal.ts (agent onboarding by private link)
 *   - creating a login for someone who was invited
 * Everything else must use the user's own client from ./server.
 */
export function createAdminClient() {
  const key = supabaseSecretKey();
  if (!key) return null;
  return createClient(supabaseEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

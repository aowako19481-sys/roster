import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { sessionCookieOptions, supabaseEnv } from "./env";

/**
 * Supabase client for server components, server actions and route handlers.
 * It acts as the signed-in user (session cookie), so row-level security
 * decides what every query can see.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, ...sessionCookieOptions });
          }
        } catch {
          // Server components cannot write cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore here.
        }
      },
    },
  });
}

/**
 * The signed-in user, verified with Supabase on the server (never read from
 * the cookie alone). Cached for the length of one request.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

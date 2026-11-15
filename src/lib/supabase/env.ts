// The only two Supabase values this app uses. Both are public by design.
// No secret key exists anywhere in this codebase.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See .env.example.",
    );
  }
  return { url, key };
}

/**
 * Session cookies are only ever read on the server, so the browser's
 * JavaScript is not allowed to see them (httpOnly), and outside local
 * development they are only sent over HTTPS (secure).
 */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * The Supabase secret key, if one has been added on the server. It is NEVER
 * given a NEXT_PUBLIC_ name, so it cannot reach the browser. Only a few
 * server-only jobs use it (creating a login for an invited person, and the
 * agent onboarding portal, where the visitor has no login). Returns null when
 * it has not been set, and those features say so instead of failing.
 */
export function supabaseSecretKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY || null;
}

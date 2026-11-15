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

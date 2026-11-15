import "server-only";
import { cookies } from "next/headers";
import { ALIVE_COOKIE, REMEMBER_COOKIE, REMEMBER_DAYS, SEEN_COOKIE, WHO_COOKIE } from "./session-clock";
import { sessionCookieOptions } from "./supabase/env";

/**
 * Called once, straight after a successful sign-in. Starts the activity clock
 * and, only if the person ticked "Remember me on this device", keeps their
 * email on this device so the next sign-in is one step shorter.
 */
export async function startSession(email: string | null | undefined) {
  const jar = await cookies();
  const now = String(Date.now());
  jar.set(SEEN_COOKIE, now, sessionCookieOptions);
  // The page refreshes this one itself, so its script must be able to write it.
  jar.set(ALIVE_COOKIE, now, { ...sessionCookieOptions, httpOnly: false });
  if (jar.get(REMEMBER_COOKIE)?.value === "1" && email) {
    jar.set(WHO_COOKIE, email.slice(0, 254), { ...sessionCookieOptions, maxAge: REMEMBER_DAYS * 24 * 60 * 60 });
  }
  jar.delete(REMEMBER_COOKIE);
}

/** The email remembered on this device, if any. Only ever used to pre-fill the sign-in page. */
export async function rememberedEmail(): Promise<string | null> {
  const value = (await cookies()).get(WHO_COOKIE)?.value?.trim().toLowerCase() ?? "";
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value : null;
}

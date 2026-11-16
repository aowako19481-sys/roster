"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REMEMBER_COOKIE, WHO_COOKIE } from "@/lib/session-clock";
import { startSession } from "@/lib/session-start";
import { sessionCookieOptions, supabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type RequestState = {
  status: "idle" | "sent" | "error";
  email: string;
  message?: string;
  /** Changes on every successful send so the form can react to a re-send. */
  sentAt?: number;
};

export type VerifyState = {
  status: "idle" | "error";
  message?: string;
};

/**
 * TEMPORARY, for the builder only: emails allowed to sign in with a password
 * alone, without the emailed code. Read from a server-side setting, so the list is
 * never in the code or the browser. Remove the setting to switch this off.
 */
function passwordEmails(): Set<string> {
  return new Set(
    (process.env.PASSWORD_SIGN_IN_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_PATTERN = /^\d{6}$/;

function readEmail(formData: FormData): string | null {
  const raw = formData.get("email");
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

function isRateLimit(error: { status?: number; code?: string }) {
  return error.status === 429 || (error.code ?? "").includes("rate_limit");
}

/**
 * Step 1. Two ways in:
 *   - email and password: the password is checked first, then a 6-digit code
 *     is emailed, so a stolen password alone is not enough;
 *   - "first time here, or forgot your password": a code is emailed, and after
 *     it is entered the person must create a password before anything else.
 * Never creates accounts.
 */
export async function requestCode(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const email = readEmail(formData);
  const typed = formData.get("email");
  const back = typeof typed === "string" ? typed.slice(0, 254) : "";
  if (!email) return { status: "error", email: back, message: "Enter a valid work email, like you@brokerage.com." };
  const codeOnly = formData.get("mode") === "code";

  // "Remember me on this device" is carried to the moment the sign-in succeeds.
  const jar = await cookies();
  if (formData.get("remember") === "on") jar.set(REMEMBER_COOKIE, "1", { ...sessionCookieOptions, maxAge: 15 * 60 });
  else jar.delete(REMEMBER_COOKIE);

  if (!codeOnly) {
    const password = formData.get("password");
    const wrong: RequestState = { status: "error", email, message: "That email and password do not match. First time here? Use the link below to create your password." };
    if (typeof password !== "string" || password.length === 0 || password.length > 200) return wrong;
    // Checked with a throwaway connection that keeps nothing: passing this
    // step does not sign anyone in.
    const { url, key } = supabaseEnv();
    const check = createPlainClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const tried = await check.auth.signInWithPassword({ email, password });
    if (tried.error) {
      if (isRateLimit(tried.error)) return { status: "error", email, message: "Too many attempts. Wait a few minutes, then try again." };
      return wrong;
    }
    if (tried.data.user?.user_metadata?.has_password !== true) await check.auth.updateUser({ data: { has_password: true } });
    await check.auth.signOut({ scope: "local" });

    // TEMPORARY, for the builder only (see passwordEmails): no emailed code.
    if (passwordEmails().has(email)) {
      const direct = await createClient();
      const { error } = await direct.auth.signInWithPassword({ email, password });
      if (error) return wrong;
      await startSession(email);
      redirect("/");
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });

  if (error) {
    if (isRateLimit(error)) {
      return { status: "error", email, message: "Too many sign-in emails for now. Check your inbox for a code we already sent. Otherwise wait a while (up to an hour) and try again." };
    }
    // An unknown email comes back as a 4xx "not allowed" error. We answer the
    // same way as for a known email, so nobody can test which emails exist.
    const isServerProblem = !error.status || error.status >= 500;
    if (isServerProblem) {
      console.error("sign-in: could not send code", error.status, error.code);
      return { status: "error", email, message: "We could not send a code just now. Please try again in a moment." };
    }
  }

  return { status: "sent", email, sentAt: Date.now() };
}

/** Step 2: check the code. On success the session cookie is set and we go home. */
export async function verifyCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const email = readEmail(formData);
  const rawCode = formData.get("code");
  const code = typeof rawCode === "string" ? rawCode.replace(/\s+/g, "") : "";

  if (!email) {
    return { status: "error", message: "Something went wrong. Go back and enter your email again." };
  }
  if (!CODE_PATTERN.test(code)) {
    return { status: "error", message: "Enter all 6 digits of the code from your email." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error) {
    if (isRateLimit(error)) {
      return { status: "error", message: "Too many attempts. Wait a minute, then try again." };
    }
    return {
      status: "error",
      message: "That code is not right or has expired. Check it, or go back to get a new one.",
    };
  }

  await startSession(email);
  // Fixed destinations: never redirect to an address taken from the request.
  redirect(data.user?.user_metadata?.has_password === true ? "/" : "/set-password");
}

/** "Forget this account": removes the remembered email from this device. Nothing else changes. */
export async function forgetDevice() {
  const jar = await cookies();
  jar.delete(WHO_COOKIE);
  jar.delete(REMEMBER_COOKIE);
  redirect("/sign-in");
}

export type PasswordState = { status: "idle" | "error"; message?: string };

/**
 * Create or replace your own password. Only for the person who is signed in
 * (they have just proved they own the email with a code).
 */
export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = formData.get("password");
  const again = formData.get("again");
  const first = String(formData.get("first") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const last = String(formData.get("last") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (first.length < 1 || last.length < 1) return { status: "error", message: "Enter your first and last name." };
  if (typeof password !== "string" || typeof again !== "string") return { status: "error", message: "Enter a password." };
  if (password.length < 10) return { status: "error", message: "Use at least 10 characters. A few words together works well." };
  if (password.length > 200) return { status: "error", message: "That password is too long." };
  if (new Set(password).size < 5) return { status: "error", message: "That password is too easy to guess. Mix more characters." };
  if (password !== again) return { status: "error", message: "The two passwords do not match." };

  const supabase = await createClient();
  const { data: who } = await supabase.auth.getUser();
  if (!who.user) redirect("/sign-in");
  const name = (who.user.email ?? "").split("@")[0]?.toLowerCase() ?? "";
  if (name.length >= 4 && password.toLowerCase().includes(name)) return { status: "error", message: "Do not use your email name in your password." };
  const fullName = `${first} ${last}`;
  const { error } = await supabase.auth.updateUser({ password, data: { has_password: true, full_name: fullName, first_name: first } });
  if (error) {
    if (error.code === "same_password") return { status: "error", message: "That is your current password. Choose a new one." };
    if (error.code === "weak_password") return { status: "error", message: "That password is too easy to guess. Try a longer one." };
    console.error("set-password: failed", error.status, error.code);
    return { status: "error", message: "We could not save your password just now. Please try again." };
  }
  // So colleagues see the same name in lists. A person who is not in a brokerage yet simply has no rows to update.
  await supabase.rpc("set_my_name", { full_name: fullName });
  redirect("/");
}

/** Leave the create-password page without finishing. */
export async function leave() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in");
}

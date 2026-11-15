"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
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

/** Step 1: email a sign-in link (and code) to an existing user. Never creates accounts. */
export async function requestCode(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const email = readEmail(formData);
  if (!email) {
    const typed = formData.get("email");
    return {
      status: "error",
      email: typeof typed === "string" ? typed.slice(0, 254) : "",
      message: "Enter a valid work email, like you@brokerage.com.",
    };
  }

  // Where the link in the email should land. Next.js has already checked that
  // this request came from our own site, and Supabase only honours addresses
  // on its allow-list, so a forged value cannot send anyone elsewhere.
  const origin = (await headers()).get("origin");
  const emailRedirectTo = origin && /^https?:\/\/[^/]+$/.test(origin) ? `${origin}/auth/callback` : undefined;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo },
  });

  if (error) {
    if (isRateLimit(error)) {
      return {
        status: "error",
        email,
        message: "Too many attempts. Wait a minute, then try again.",
      };
    }
    // An unknown email comes back as a 4xx "not allowed" error. We answer the
    // same way as for a known email, so nobody can test which emails exist.
    const isServerProblem = !error.status || error.status >= 500;
    if (isServerProblem) {
      console.error("sign-in: could not send code", error.status, error.code);
      return {
        status: "error",
        email,
        message: "We could not send a code just now. Please try again in a moment.",
      };
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
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error) {
    if (isRateLimit(error)) {
      return { status: "error", message: "Too many attempts. Wait a minute, then try again." };
    }
    return {
      status: "error",
      message: "That code is not right or has expired. Check it, or go back to get a new one.",
    };
  }

  // Fixed destination: never redirect to an address taken from the request.
  redirect("/");
}

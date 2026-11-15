import { NextResponse, type NextRequest } from "next/server";
import { startSession } from "@/lib/session-start";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the sign-in link in the email. Supabase sends the person
 * here with a one-time code, which is swapped for a session. It only works in
 * the browser that asked for the link (that browser holds the matching
 * verifier cookie), so a link forwarded to someone else is useless to them.
 *
 * The destination is fixed: nothing from the address bar decides where the
 * person ends up.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const target = request.nextUrl.clone();
  target.search = "";

  if (code && code.length <= 512) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await startSession(data.user?.email);
      target.pathname = "/";
      return NextResponse.redirect(target);
    }
    console.error("sign-in link: exchange failed", error.status, error.code);
  }

  target.pathname = "/sign-in";
  target.searchParams.set("link", "expired");
  return NextResponse.redirect(target);
}

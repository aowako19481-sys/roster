import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions, supabaseEnv } from "@/lib/supabase/env";

const PUBLIC_PATHS = new Set(["/sign-in"]);
// Reachable while signed out, and left alone when signed in.
const OPEN_PATHS = new Set(["/auth/callback"]);

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Stylesheets come from our own origin only. Inline style attributes are
    // allowed because card positions and bar widths are computed values.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    // The browser never talks to Supabase or any third party; all data access
    // happens on the server.
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, ...sessionCookieOptions });
        }
      },
    },
  });

  // Verifies the session with Supabase and refreshes it if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);

  // A sign-in link can land on any page of the site (Supabase falls back to
  // the site's home address when the exact landing address is not on its
  // allow-list). Wherever it lands, hand it to the one route that handles it.
  if (!user && !OPEN_PATHS.has(pathname)) {
    const code = request.nextUrl.searchParams.get("code");
    const failed = request.nextUrl.searchParams.has("error_code") || request.nextUrl.searchParams.has("error");
    if ((code && code.length <= 512) || failed) {
      const target = request.nextUrl.clone();
      target.search = "";
      if (code && !failed) {
        target.pathname = "/auth/callback";
        target.searchParams.set("code", code);
      } else {
        target.pathname = "/sign-in";
        target.searchParams.set("link", "expired");
      }
      const handoff = NextResponse.redirect(target);
      handoff.headers.set("Content-Security-Policy", csp);
      handoff.headers.set("Cache-Control", "private, no-store");
      return handoff;
    }
  }

  let redirectTo: string | null = null;
  if (!OPEN_PATHS.has(pathname)) {
    if (!user && !isPublic) redirectTo = "/sign-in";
    if (user && isPublic) redirectTo = "/";
  }

  if (redirectTo) {
    const target = request.nextUrl.clone();
    target.pathname = redirectTo;
    target.search = "";
    const redirect = NextResponse.redirect(target);
    // Keep any refreshed session cookies.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    response = redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    // Everything except Next.js static files and common static assets.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};

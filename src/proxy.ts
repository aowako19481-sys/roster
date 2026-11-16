import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ALIVE_COOKIE, CLOSED_MS, IDLE_MS, SEEN_COOKIE } from "@/lib/session-clock";
import { sessionCookieOptions, supabaseEnv, untilBrowserCloses } from "@/lib/supabase/env";

const PUBLIC_PATHS = new Set(["/sign-in"]);
// Reachable while signed out, and left alone when signed in.
// The last two are called by machines, not people; each checks its own password.
const OPEN_PATHS = new Set(["/auth/callback", "/home", "/sitemap.xml", "/api/cron/daily", "/api/documenso/webhook"]);
// The public website: the landing page and the policy pages.
const isSitePath = (pathname: string) => pathname === "/legal" || pathname.startsWith("/legal/");

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Stylesheets come from our own origin only. Inline style attributes are
    // allowed because card positions and bar widths are computed values.
    "style-src 'self' 'unsafe-inline'",
    // blob: is for the local preview of a file the person has just chosen to upload.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // The browser never talks to Supabase or any third party; all data access
    // happens on the server.
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    // The PDF viewer draws pages in a background worker served from our own site.
    "worker-src 'self' blob:",
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
  // Lets the app's frame know which page is being shown (it cannot be set by the visitor: this overwrites it).
  requestHeaders.set("x-kinu-path", request.nextUrl.pathname);
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
          response.cookies.set(name, value, { ...untilBrowserCloses(value, options), ...sessionCookieOptions });
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
  // The agent onboarding portal: reached by private link, with or without a session.
  const isOpen = OPEN_PATHS.has(pathname) || pathname.startsWith("/welcome/") || isSitePath(pathname);

  // A sign-in link can land on any page of the site (Supabase falls back to
  // the site's home address when the exact landing address is not on its
  // allow-list). Wherever it lands, hand it to the one route that handles it.
  if (!user && !isOpen) {
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

  // A visitor who is not signed in sees the public website at the home
  // address. Signed-in people get their dashboard there instead.
  if (!user && pathname === "/") {
    const target = request.nextUrl.clone();
    target.pathname = "/home";
    const site = NextResponse.rewrite(target, { request: { headers: requestHeaders } });
    for (const cookie of response.cookies.getAll()) site.cookies.set(cookie);
    site.headers.set("Content-Security-Policy", csp);
    site.headers.set("Cache-Control", "private, no-store");
    return site;
  }

  // Sensitive records: a session ends after 30 minutes without activity, and
  // when Kinu has been closed (opening a page with no Kinu page open just before).
  if (user && !isOpen && !isPublic) {
    const now = Date.now();
    const seen = Number(request.cookies.get(SEEN_COOKIE)?.value);
    const alive = Number(request.cookies.get(ALIVE_COOKIE)?.value);
    const openingPage = request.method === "GET" && request.headers.get("sec-fetch-dest") === "document";
    const idle = !Number.isFinite(seen) || now - seen > IDLE_MS;
    const closed = openingPage && (!Number.isFinite(alive) || now - alive > CLOSED_MS);
    if (idle || closed) {
      await supabase.auth.signOut({ scope: "local" });
      const target = request.nextUrl.clone();
      target.pathname = "/sign-in";
      target.search = "";
      target.searchParams.set("ended", idle ? "idle" : "closed");
      const ended = NextResponse.redirect(target);
      for (const cookie of response.cookies.getAll()) ended.cookies.set(cookie);
      for (const name of [SEEN_COOKIE, ALIVE_COOKIE, "kinu_ws", "kinu_as"]) ended.cookies.delete(name);
      ended.headers.set("Content-Security-Policy", csp);
      ended.headers.set("Cache-Control", "private, no-store");
      return ended;
    }
    response.cookies.set(SEEN_COOKIE, String(now), sessionCookieOptions);
  }

  let redirectTo: string | null = null;
  if (!isOpen) {
    if (!user && !isPublic) redirectTo = "/sign-in";
    if (user && isPublic) redirectTo = "/";
    // Everyone has their own password. Someone who came in by emailed code
    // alone (first time, or after forgetting it) creates one before anything else.
    const needsPassword = Boolean(user) && user?.user_metadata?.has_password !== true;
    if (needsPassword && pathname !== "/set-password") redirectTo = "/set-password";
    if (user && !needsPassword && pathname === "/set-password") redirectTo = "/";
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

import { timingSafeEqual } from "node:crypto";
import { collectSignatures } from "@/lib/background";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The signing service calls this the moment something is signed, declined or
 * cancelled, with a password only it and this server know. Nothing in the
 * message itself is trusted: it is only a nudge to go and read the real state
 * back from the signing service, which is what decides.
 */
export async function POST(request: Request) {
  const secret = (process.env.DOCUMENSO_WEBHOOK_SECRET ?? "").trim();
  if (secret.length < 16) return new Response("Not configured.", { status: 503 });
  const given = Buffer.from(request.headers.get("x-documenso-secret") ?? ""), wanted = Buffer.from(secret);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return new Response("Not found.", { status: 404 });

  // Which brokerage this is about, if the message says (our own reference starts "kinu:<brokerage id>:").
  let ws: string | null = null;
  try {
    const body = (await request.json()) as { payload?: { externalId?: unknown } };
    const match = typeof body.payload?.externalId === "string" ? /^kinu:([0-9a-f-]{36}):/.exec(body.payload.externalId) : null;
    ws = match ? match[1]! : null;
  } catch { /* an unreadable message still triggers a check of everything */ }

  const db = createAdminClient();
  if (!db) return new Response("Not configured.", { status: 503 });
  const report = await collectSignatures(db, ws);
  return Response.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store" } });
}

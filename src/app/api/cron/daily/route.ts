import { timingSafeEqual } from "node:crypto";
import { runDaily } from "@/lib/background";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily timer. Vercel calls this once a day and proves it is Vercel with
 * a password only it and this server know (CRON_SECRET). Anyone else gets
 * nothing. The answer is counts only.
 */
export async function GET(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (secret.length < 16) return new Response("Not configured.", { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? ""), wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return new Response("Not found.", { status: 404 });
  const report = await runDaily();
  if (!report) return new Response("Not configured.", { status: 503 });
  return Response.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store" } });
}

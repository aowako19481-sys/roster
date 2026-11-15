import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

/** The console's quick search: a few matching brokerages, by name or account number. Kinu staff only. */
export async function GET(request: Request) {
  const access = await getAccess();
  if (!access?.isPlatformAdmin) return Response.json({ rows: [] }, { status: 404 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ rows: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_brokerages", { search: q, only_status: null, only_billing: null, page_no: 1, page_size: 8 });
  const rows = ((data as { rows?: { id: string; name: string; account_no: number; status: string; agents: number }[] } | null)?.rows ?? []).map((row) => ({
    id: row.id, name: row.name, account_no: row.account_no, status: row.status, agents: Number(row.agents),
  }));
  return Response.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
}

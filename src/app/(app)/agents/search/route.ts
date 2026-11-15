import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

/**
 * The Advanced view's agent search. Read as the signed-in person, so they
 * only ever get agents their role and office allow.
 */
export async function GET(request: Request) {
  const access = await getAccess();
  if (!access?.workspace || !access.caps.has("agents.view")) return Response.json({ rows: [] }, { status: 404 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60).replace(/[%_,()]/g, " ");
  if (q.length < 2) return Response.json({ rows: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const supabase = await createClient();
  const { data } = await supabase
    .from("agents")
    .select("id, full_name, email, phone, office, status, licence_status, licence_masked, w9_status, rider_status, onboarding_status, joined_on")
    .eq("workspace_id", access.workspace.id)
    .ilike("full_name", `%${q}%`)
    .order("full_name")
    .limit(8);
  return Response.json({ rows: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

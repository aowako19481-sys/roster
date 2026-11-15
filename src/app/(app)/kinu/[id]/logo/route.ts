import { getAccess } from "@/lib/access";
import { BILLING_BUCKET, sendStoredFile } from "@/lib/stored-file";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A brokerage's logo or photo for its ID card. Kinu staff only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccess();
  if (!access?.isPlatformAdmin || !UUID.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("workspaces").select("logo_path").eq("id", id).maybeSingle();
  if (!data?.logo_path) return new Response("Not found", { status: 404 });
  return sendStoredFile(supabase, data.logo_path, "logo", BILLING_BUCKET);
}

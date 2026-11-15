import { getAccess } from "@/lib/access";
import { sendStoredFile } from "@/lib/stored-file";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The proof stored with a payment, sent through our own site. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccess();
  if (!access?.workspace || !access.caps.has("deals.view") || !UUID.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: payment } = await supabase.from("payments").select("proof_path, reference").eq("id", id).eq("workspace_id", access.workspace.id).maybeSingle();
  if (!payment?.proof_path) return new Response("Not found", { status: 404 });
  return sendStoredFile(supabase, payment.proof_path, `proof-${payment.reference ?? "payment"}`);
}

import { getAccess } from "@/lib/access";
import { sendStoredFile } from "@/lib/stored-file";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One of a deal's stored files (proof of payment or bank receipt), sent through our own site. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const access = await getAccess();
  if (!access?.workspace || !access.caps.has("deals.view") || !UUID.test(id) || !UUID.test(docId)) {
    return new Response("Not found", { status: 404 });
  }
  const supabase = await createClient();
  // Row-level security decides whether this person may see the record at all.
  const { data: doc } = await supabase
    .from("documents")
    .select("path, filename")
    .eq("id", docId)
    .eq("deal_id", id)
    .eq("workspace_id", access.workspace.id)
    .in("kind", ["payment_proof", "bank_receipt"])
    .maybeSingle();
  if (!doc?.path) return new Response("Not found", { status: 404 });
  return sendStoredFile(supabase, doc.path, doc.filename);
}

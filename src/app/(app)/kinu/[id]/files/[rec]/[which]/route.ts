import { getAccess } from "@/lib/access";
import { BILLING_BUCKET, sendStoredFile } from "@/lib/stored-file";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A filed invoice, proof of payment or contract. Kinu staff only; the database and storage check again. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; rec: string; which: string }> }) {
  const { id, rec, which } = await params;
  const access = await getAccess();
  if (!access?.isPlatformAdmin || !UUID.test(id) || !UUID.test(rec) || !["invoice", "proof", "contract"].includes(which)) {
    return new Response("Not found", { status: 404 });
  }
  const supabase = await createClient();
  let path: string | null = null;
  let name = "file";
  if (which === "contract") {
    const { data } = await supabase.from("contracts").select("file_path, file_name").eq("id", rec).eq("workspace_id", id).maybeSingle();
    path = data?.file_path ?? null;
    name = data?.file_name ?? name;
  } else {
    const { data } = await supabase.from("billing_months").select("invoice_path, invoice_name, proof_path, proof_name").eq("id", rec).eq("workspace_id", id).maybeSingle();
    path = (which === "invoice" ? data?.invoice_path : data?.proof_path) ?? null;
    name = (which === "invoice" ? data?.invoice_name : data?.proof_name) ?? name;
  }
  if (!path) return new Response("Not found", { status: 404 });
  return sendStoredFile(supabase, path, name, BILLING_BUCKET);
}

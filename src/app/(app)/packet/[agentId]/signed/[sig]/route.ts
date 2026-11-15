import { getAccess } from "@/lib/access";
import { pdfResponse, signedRecordPdf, type SignatureRecord } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The brokerage's copy of one signed record, as a PDF. Row-level security decides who may read it. */
export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string; sig: string }> }) {
  const { agentId, sig } = await params;
  const access = await getAccess();
  if (!access?.workspace || !access.caps.has("agents.view") || !UUID.test(agentId) || !UUID.test(sig)) {
    return new Response("Not found", { status: 404 });
  }
  const supabase = await createClient();
  const { data: record } = await supabase
    .from("signatures")
    .select("*")
    .eq("id", sig)
    .eq("agent_id", agentId)
    .eq("workspace_id", access.workspace.id)
    .maybeSingle();
  if (!record) return new Response("Not found", { status: 404 });

  let original: Uint8Array | null = null;
  if (typeof record.file_path === "string" && record.file_path.endsWith(".pdf")) {
    const { data } = await supabase.storage.from("documents").download(record.file_path);
    if (data) original = new Uint8Array(await data.arrayBuffer());
  }
  const bytes = await signedRecordPdf(record as SignatureRecord, access.workspace.name, original);
  return pdfResponse(bytes, `${record.title} - ${record.signer_name} - signed`);
}

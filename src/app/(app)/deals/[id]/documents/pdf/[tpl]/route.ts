import { getAccess } from "@/lib/access";
import { loadDealDocData, pdfValues } from "@/lib/autofill";
import { fillPdf, pdfResponse } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A brokerage's own PDF form, filled in for one deal. Everything is read as the signed-in user. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; tpl: string }> }) {
  const { id, tpl } = await params;
  const access = await getAccess();
  if (!access?.workspace || !access.caps.has("deals.view") || !UUID.test(id) || !UUID.test(tpl)) return new Response("Not found", { status: 404 });
  const ws = access.workspace.id;
  const supabase = await createClient();
  const [{ data: template }, data, { data: row }] = await Promise.all([
    supabase.from("doc_templates").select("name, file_path, field_map").eq("id", tpl).eq("workspace_id", ws).eq("active", true).maybeSingle(),
    loadDealDocData(supabase, ws, id),
    supabase.from("deal_doc_values").select("filled").eq("deal_id", id).eq("template_id", tpl).eq("workspace_id", ws).maybeSingle(),
  ]);
  if (!template?.file_path || !data) return new Response("Not found", { status: 404 });
  const { data: file } = await supabase.storage.from("documents").download(template.file_path);
  if (!file) return new Response("Not found", { status: 404 });
  const bytes = await fillPdf(new Uint8Array(await file.arrayBuffer()), pdfValues(template.field_map, data, (row?.filled ?? {}) as Record<string, string>));
  if (!bytes) return new Response("That PDF could not be filled in.", { status: 422 });
  return pdfResponse(bytes, `${template.name} - ${data.deal.address}`);
}

import { getAccess } from "@/lib/access";
import { pdfValues, sampleDocData, templateFillLabels } from "@/lib/autofill";
import { fillPdf, pdfResponse } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A brokerage's PDF form filled in with a made-up deal, to check the field set-up. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccess();
  if (!access?.workspace || !access.caps.has("deals.view") || !UUID.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: template } = await supabase.from("doc_templates").select("name, body, file_path, field_map, fields").eq("id", id).eq("workspace_id", access.workspace.id).maybeSingle();
  if (!template?.file_path) return new Response("Not found", { status: 404 });
  const { data: file } = await supabase.storage.from("documents").download(template.file_path);
  if (!file) return new Response("Not found", { status: 404 });
  const typed = Object.fromEntries(templateFillLabels(template).map((label) => [label, `(${label})`]));
  const bytes = await fillPdf(new Uint8Array(await file.arrayBuffer()), pdfValues(template.field_map, sampleDocData(access.workspace.name), typed));
  if (!bytes) return new Response("That PDF could not be filled in.", { status: 422 });
  return pdfResponse(bytes, `${template.name} - sample`);
}

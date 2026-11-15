import { getAccess } from "@/lib/access";
import { BILLING_BUCKET, sendStoredFile } from "@/lib/stored-file";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One document from the founder's filing cabinet. The founder only. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const access = await getAccess();
  if (!access?.isFounder || !UUID.test(file)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("founder_files").select("file_path, file_name").eq("id", file).maybeSingle();
  if (!data?.file_path) return new Response("Not found", { status: 404 });
  return sendStoredFile(supabase, data.file_path, data.file_name, BILLING_BUCKET);
}

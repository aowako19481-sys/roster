import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

/**
 * The PDF behind a document to sign, for the on-screen editor and previews.
 * Only people in the brokerage who may see it get it: the query runs as the
 * signed-in person, so the database decides.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccess();
  if (!access?.workspace || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("sign_templates").select("file_path").eq("id", id).eq("workspace_id", access.workspace.id).maybeSingle();
  if (!data?.file_path) return new Response("Not found", { status: 404 });
  const file = await supabase.storage.from("documents").download(data.file_path as string);
  if (file.error || !file.data) return new Response("Not found", { status: 404 });
  return new Response(file.data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="document.pdf"',
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

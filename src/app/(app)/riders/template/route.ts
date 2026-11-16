import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

/** The brokerage's own rider document, for the preview on the Riders page. The database decides who may read it. */
export async function GET() {
  const access = await getAccess();
  if (!access?.workspace) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("workspaces").select("rider_template_path").eq("id", access.workspace.id).maybeSingle();
  if (!data?.rider_template_path) return new Response("Not found", { status: 404 });
  const file = await supabase.storage.from("documents").download(data.rider_template_path as string);
  if (file.error || !file.data) return new Response("Not found", { status: 404 });
  return new Response(file.data, {
    headers: {
      "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="rider.pdf"', "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    },
  });
}

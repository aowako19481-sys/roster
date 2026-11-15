import { NextResponse } from "next/server";
import { requireCap } from "@/lib/access";
import { UUID_RE } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };
const notFound = () => new NextResponse("File not found.", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Opens one stored file. The file's record is loaded as the signed-in person,
 * so row-level security decides whether they may see it; only then is a link
 * that lasts one minute made, and the browser sent to it.
 */
export async function GET(_request: Request, { params }: Context) {
  const access = await requireCap("files.view");
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const supabase = await createClient();
  const ws = access.workspace.id;
  const { data: doc } = await supabase.from("documents").select("path").eq("id", id).eq("workspace_id", ws).maybeSingle();
  const path = doc?.path as string | null | undefined;
  // A stored path always starts with the brokerage's own id.
  if (!path || !path.startsWith(`${ws}/`)) return notFound();

  const { data: signed, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
  if (error || !signed?.signedUrl) return notFound();
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

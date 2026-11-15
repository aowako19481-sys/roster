import { NextResponse } from "next/server";
import { requireCap } from "@/lib/access";
import { UUID_RE } from "@/lib/ops";
import { sendStoredFile } from "@/lib/stored-file";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };
const notFound = () => new NextResponse("File not found.", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Opens one stored file. The file's record is loaded as the signed-in person,
 * so row-level security decides whether they may see it; only then is the
 * file itself read, again as that person, and sent back.
 */
export async function GET(_request: Request, { params }: Context) {
  const access = await requireCap("files.view");
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const supabase = await createClient();
  const ws = access.workspace.id;
  const { data: doc } = await supabase.from("documents").select("path, filename").eq("id", id).eq("workspace_id", ws).maybeSingle();
  const path = doc?.path as string | null | undefined;
  // A stored path always starts with the brokerage's own id.
  if (!path || !path.startsWith(`${ws}/`)) return notFound();

  // Sent through our own site (photos open in the page, PDFs download), so the
  // file never needs an address on another company's server.
  return sendStoredFile(supabase, path, String(doc?.filename ?? "file"));
}

import { requireCap } from "@/lib/access";
import { todayIso } from "@/lib/format";
import { csvResponse, docKind, statusWord, toCsv } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";

/** Downloads the file list of one cabinet as a CSV. It lists the files; it does not contain them. */
export async function GET(request: Request) {
  const access = await requireCap("files.view");
  const kind = docKind(new URL(request.url).searchParams.get("kind"));
  if (!kind) return new Response("Choose a cabinet to export.", { status: 400 });

  const supabase = await createClient();
  const ws = access.workspace.id;
  const [docRes, agentRes] = await Promise.all([
    supabase.from("documents").select("filename, agent_id, status, note, path, created_at").eq("workspace_id", ws).eq("kind", kind.kind)
      .order("created_at", { ascending: false }).limit(5000),
    access.caps.has("agents.view") ? supabase.from("agents").select("id, full_name").eq("workspace_id", ws).limit(2000) : Promise.resolve({ data: [] }),
  ]);
  if (docRes.error) return new Response("The export could not be made. Please try again.", { status: 500 });
  const nameOf = new Map((agentRes.data ?? []).map((agent) => [agent.id as string, agent.full_name as string]));

  const rows = (docRes.data ?? []).map((doc) => [
    doc.filename as string,
    kind.one,
    doc.agent_id ? nameOf.get(doc.agent_id as string) ?? "" : "",
    statusWord("document", doc.status as string).label,
    (doc.note as string | null) ?? "",
    String(doc.created_at ?? "").slice(0, 10),
    doc.path ? "Yes" : "No",
  ]);
  const csv = toCsv(["File", "Cabinet", "Agent", "Status", "Note", "Added", "File stored"], rows);
  return csvResponse(`${kind.kind}-files-${todayIso(access.workspace.timezone)}`, csv);
}

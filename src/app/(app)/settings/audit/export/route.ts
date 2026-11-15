import { getAccess } from "@/lib/access";
import { AUDIT_ENTITIES, auditEntity, auditFields, auditSearch, auditSearchFilter, csvRow, describeAudit, type AuditRow } from "@/lib/admin-pages";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const MAX_ROWS = 5000;
const CHUNK = 1000;

/** The audit log as a CSV file, with the same filters as the page. */
export async function GET(request: Request) {
  const access = await getAccess();
  if (!access) return new Response("Please sign in.", { status: 401 });
  if (!access.workspace || !access.caps.has("audit.view")) return new Response("You are not allowed to export the audit log.", { status: 403 });
  const ws = access.workspace;

  const url = new URL(request.url);
  const entity = auditEntity(url.searchParams.get("entity") ?? undefined);
  const q = auditSearch(url.searchParams.get("q") ?? undefined);

  const supabase = await createClient();
  const rows: AuditRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += CHUNK) {
    let query = supabase.from("audit_log")
      .select("id, actor_label, action, entity, entity_id, summary, detail, at")
      .eq("workspace_id", ws.id);
    if (entity) query = query.eq("entity", entity);
    if (q) query = query.or(auditSearchFilter(q));
    const { data, error } = await query.order("at", { ascending: false }).order("id", { ascending: false }).range(from, from + CHUNK - 1);
    if (error) return new Response("The export could not be made. Try again in a moment.", { status: 500 });
    rows.push(...((data ?? []) as AuditRow[]));
    if (!data || data.length < CHUNK) break;
  }

  const lines = [csvRow(["When (UTC)", "Who", "Area", "Action", "Record", "What happened", "Details"])];
  for (const row of rows) {
    lines.push(csvRow([
      new Date(row.at).toISOString(),
      row.actor_label ?? "System",
      AUDIT_ENTITIES[row.entity] ?? row.entity,
      row.action,
      row.entity_id ?? "",
      describeAudit(row),
      auditFields(row.detail).map((field) => `${field.label}: ${field.value}`).join("; "),
    ]));
  }

  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${todayIso(ws.timezone)}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

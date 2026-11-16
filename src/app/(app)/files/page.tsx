import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { DropZone } from "@/components/DropZone";
import { FilePreview } from "@/components/FilePreview";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Badge, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { day, todayIso } from "@/lib/format";
import { addDays, daysBetween, DOC_KINDS, docKind, matches, one, withQuery } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import { uploadFile } from "./actions";

export const metadata: Metadata = { title: "Compliance files" };

type Props = { searchParams: Promise<{ kind?: string | string[]; q?: string | string[] }> };
type Doc = { id: string; agent_id: string | null; filename: string; path: string | null; status: string; note: string | null; created_at: string };
type Expiring = { id: string; full_name: string; office: string; licence_expires_on: string };

// Reminders go out 90, 60 and 30 days before a licence runs out.
const WINDOWS = [
  { label: "Within 30 days", note: "30-day reminder", min: 0, max: 30 },
  { label: "In 31 to 60 days", note: "60-day reminder", min: 31, max: 60 },
  { label: "In 61 to 90 days", note: "90-day reminder", min: 61, max: 90 },
];

export default async function FilesPage({ searchParams }: Props) {
  const access = await requireCap("files.view");
  const params = await searchParams;
  const cabinet = docKind(one(params.kind)) ?? DOC_KINDS[0];
  const q = one(params.q);
  const ws = access.workspace.id;
  const tz = access.workspace.timezone;
  const today = todayIso(tz);
  const canManage = access.caps.has("files.manage");
  const seeAgents = access.caps.has("agents.view");
  const supabase = await createClient();

  const [counts, docRes, agentRes, expiryRes] = await Promise.all([
    Promise.all(DOC_KINDS.map((entry) =>
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("kind", entry.kind)
        .then((res) => res.count ?? 0))),
    supabase.from("documents").select("id, agent_id, filename, path, status, note, created_at").eq("workspace_id", ws).eq("kind", cabinet.kind)
      .order("created_at", { ascending: false }).limit(1000),
    seeAgents ? supabase.from("agents").select("id, full_name, office, status").eq("workspace_id", ws).order("full_name").limit(1000) : Promise.resolve({ data: [] }),
    seeAgents
      ? supabase.from("agents").select("id, full_name, office, licence_expires_on").eq("workspace_id", ws).neq("status", "exited")
          .lte("licence_expires_on", addDays(today, 90)).order("licence_expires_on").limit(500)
      : Promise.resolve({ data: [] }),
  ]);

  const agents = (agentRes.data ?? []) as { id: string; full_name: string; office: string; status: string }[];
  const nameOf = new Map(agents.map((agent) => [agent.id, agent.full_name]));
  const docs = ((docRes.data ?? []) as Doc[]).filter((doc) => matches(q, doc.filename, doc.note, doc.agent_id ? nameOf.get(doc.agent_id) : ""));
  const expiring = (expiryRes.data ?? []) as Expiring[];
  const expired = expiring.filter((agent) => daysBetween(today, agent.licence_expires_on) < 0);
  const total = counts.reduce((sum, count) => sum + count, 0);

  const expiryList = (people: Expiring[]) => (
    <ul className={ui.list}>
      {people.map((agent) => {
        const days = daysBetween(today, agent.licence_expires_on);
        return (
          <li key={agent.id}>
            <Link href={`/agents/${agent.id}`} className={ui.rowLink}>{agent.full_name}</Link>{" "}
            <span className={ui.soft}>{agent.office}</span>
            <br />
            <span className={ui.soft}>
              {days < 0 ? `Expired ${day(agent.licence_expires_on)}` : `Expires ${day(agent.licence_expires_on)} · ${days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`}`}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Files" title="Compliance files" sub={`${total} ${total === 1 ? "file" : "files"} across six cabinets, each kept private to this brokerage.`} />

      <nav aria-label="Cabinets" className={ui.tabs}>
        {DOC_KINDS.map((entry, index) => (
          <Link
            key={entry.kind}
            href={withQuery("/files", { kind: entry.kind })}
            className={entry.kind === cabinet.kind ? ui.tabOn : ui.tab}
            aria-current={entry.kind === cabinet.kind ? "page" : undefined}
          >
            {entry.label} · {counts[index] ?? 0}
          </Link>
        ))}
      </nav>

      <div className={ui.split}>
        <Card
          title={cabinet.label}
          aside={
            <a href={withQuery("/files/export", { kind: cabinet.kind })} className={`${ui.btn} ${ui.small}`} download>
              Export cabinet (CSV)
            </a>
          }
        >
          <form method="get" action="/files" role="search" className={ui.inline} style={{ marginBottom: 14 }}>
            <input type="hidden" name="kind" value={cabinet.kind} />
            <label className={ui.field} style={{ flex: "1 1 240px" }}>
              Search this cabinet by file, agent or note
              <input className={ui.input} type="search" name="q" defaultValue={q} maxLength={120} />
            </label>
            <button type="submit" className={ui.btn}>Search</button>
            {q && <Link href={withQuery("/files", { kind: cabinet.kind })} className={ui.linkBtn}>Clear search</Link>}
          </form>
          {docRes.error ? (
            <Empty>The files could not be loaded. Please refresh the page.</Empty>
          ) : docs.length ? (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Agent</th>
                    <th scope="col">Status</th>
                    <th scope="col">Added</th>
                    <th scope="col">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <span className={ui.strong}>{doc.filename}</span>
                        {doc.note && (
                          <>
                            <br />
                            <span className={ui.soft}>{doc.note}</span>
                          </>
                        )}
                      </td>
                      <td>
                        {doc.agent_id && nameOf.has(doc.agent_id) ? (
                          <Link href={`/agents/${doc.agent_id}`} className={ui.rowLink}>{nameOf.get(doc.agent_id)}</Link>
                        ) : (
                          <span className={ui.soft}>–</span>
                        )}
                      </td>
                      <td><StatusBadge kind="document" value={doc.status} /></td>
                      <td>{day(doc.created_at, tz)}</td>
                      <td>
                        {doc.path ? (
                          <FilePreview src={`/files/${doc.id}`} name={doc.filename} kind={/\.pdf$/i.test(doc.path) ? "pdf" : "image"} width={64} />
                        ) : (
                          <span className={ui.soft}>Record only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{q ? "No files in this cabinet match that search." : "This cabinet is empty."}</Empty>
          )}
        </Card>

        <div className={ui.stack}>
          {seeAgents && (
            <Card title="Licence expiry" aside={<span className={ui.soft}>Next 90 days</span>}>
              <p className={ui.help}>Reminders go out 90, 60 and 30 days before a licence runs out.</p>
              {expired.length > 0 && (
                <section aria-label="Already expired">
                  <h3 className={ui.strong} style={{ marginTop: 14 }}>
                    Already expired <Badge tone="bad">{expired.length}</Badge>
                  </h3>
                  {expiryList(expired)}
                </section>
              )}
              {WINDOWS.map((window) => {
                const people = expiring.filter((agent) => {
                  const days = daysBetween(today, agent.licence_expires_on);
                  return days >= window.min && days <= window.max;
                });
                return (
                  <section key={window.label} aria-label={window.label}>
                    <h3 className={ui.strong} style={{ marginTop: 14 }}>
                      {window.label} <Badge tone={people.length ? "warn" : "muted"}>{people.length}</Badge>{" "}
                      <span className={ui.soft}>{window.note}</span>
                    </h3>
                    {people.length ? expiryList(people) : <p className={ui.soft}>Nobody.</p>}
                  </section>
                );
              })}
            </Card>
          )}

          {canManage && (
            <Card title="Add a file">
              <ActionForm action={uploadFile} resetOnSuccess>
                <DropZone name="file" label="File" required />
                <label className={ui.field}>
                  Cabinet
                  <select className={ui.select} name="kind" defaultValue={cabinet.kind} required>
                    {DOC_KINDS.map((entry) => (
                      <option key={entry.kind} value={entry.kind}>{entry.label}</option>
                    ))}
                  </select>
                </label>
                <label className={ui.field}>
                  Agent (optional)
                  <select className={ui.select} name="agent" defaultValue="">
                    <option value="">Not about one agent</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.full_name} · {agent.office}</option>
                    ))}
                  </select>
                </label>
                <label className={ui.field}>
                  Note (optional)
                  <input className={ui.input} name="note" maxLength={200} />
                </label>
                <div>
                  <Submit busy="Uploading…">Upload file</Submit>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

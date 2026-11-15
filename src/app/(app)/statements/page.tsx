import type { Metadata } from "next";
import Link from "next/link";
import { Card, Empty, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agent statements" };

type Agent = { id: string; full_name: string; office: string | null; status: string; gci_ytd: number };

export default async function StatementsPage() {
  const access = await requireCap("statements.view");
  const supabase = await createClient();
  const { data } = await supabase.from("agents").select("id, full_name, office, status, gci_ytd")
    .eq("workspace_id", access.workspace.id).order("full_name").limit(2000);
  const agents = (data ?? []) as Agent[];

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Finance" title="Agent statements" sub="Pick an agent to see their closed and open deals, what they have earned so far and how close they are to the next tier." />
      <Card title="Choose an agent" aside={<span className={ui.soft}>{agents.length} {agents.length === 1 ? "agent" : "agents"}</span>}>
        {agents.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Office</th>
                  <th scope="col" className={ui.num}>Closed commission this year</th>
                  <th scope="col"><span style={{ position: "absolute", left: -9999 }}>Open</span></th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td><Link href={`/statements/${agent.id}`} className={ui.rowLink}>{agent.full_name}</Link></td>
                    <td>{agent.office ?? "–"}</td>
                    <td className={ui.num}>{money(agent.gci_ytd)}</td>
                    <td className={ui.num}><Link href={`/statements/${agent.id}`} className={ui.linkBtn} aria-label={`Open statement for ${agent.full_name}`}>Open statement</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No agents yet.</Empty>
        )}
      </Card>
    </div>
  );
}

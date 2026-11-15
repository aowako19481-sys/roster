import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Card, Empty, PageHeader, Placeholder, Stat, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { todayIso } from "@/lib/format";
import { cohortLabel, maskTin } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

type Agent = {
  id: string; full_name: string; office: string; status: string; cohort: string | null; licence_status: string;
  w9_status: string; rider_status: string; onboarding_status: string;
};
type Group = { label: string; total: number; ready: number; inProgress: number; flagged: number };

function summarise(agents: Agent[], keyOf: (agent: Agent) => string, labelOf: (key: string) => string, newestFirst = false): Group[] {
  const groups = new Map<string, Group>();
  for (const agent of agents) {
    const key = keyOf(agent);
    const group = groups.get(key) ?? { label: labelOf(key), total: 0, ready: 0, inProgress: 0, flagged: 0 };
    group.total += 1;
    if (agent.onboarding_status === "ready") group.ready += 1;
    else if (agent.onboarding_status === "flagged") group.flagged += 1;
    else group.inProgress += 1;
    groups.set(key, group);
  }
  const keys = [...groups.keys()].sort();
  if (newestFirst) keys.reverse();
  return keys.map((key) => groups.get(key)!);
}

function SummaryTable({ caption, first, groups }: { caption: string; first: string; groups: Group[] }) {
  if (!groups.length) return <Empty>No agents yet.</Empty>;
  return (
    <div className={ui.tableWrap}>
      <table className={ui.table}>
        <caption className={ui.soft}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{first}</th>
            <th scope="col" className={ui.num}>Agents</th>
            <th scope="col" className={ui.num}>Ready</th>
            <th scope="col" className={ui.num}>In progress</th>
            <th scope="col" className={ui.num}>Flagged</th>
            <th scope="col" className={ui.num}>Ready %</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.label}>
              <td className={ui.strong}>{group.label}</td>
              <td className={ui.num}>{group.total}</td>
              <td className={ui.num}>{group.ready}</td>
              <td className={ui.num}>{group.inProgress}</td>
              <td className={ui.num}>{group.flagged}</td>
              <td className={ui.num}>{Math.round((group.ready / group.total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReportsPage() {
  const access = await requireCap("reports.view");
  const ws = access.workspace.id;
  const seeTax = access.caps.has("w9.view");
  const year = todayIso(access.workspace.timezone).slice(0, 4);
  const supabase = await createClient();

  const [agentRes, taxRes] = await Promise.all([
    supabase.from("agents").select("id, full_name, office, status, cohort, licence_status, w9_status, rider_status, onboarding_status")
      .eq("workspace_id", ws).order("full_name").limit(5000),
    seeTax ? supabase.from("agent_tax").select("agent_id, legal_name, tin_last4").eq("workspace_id", ws).limit(5000) : Promise.resolve({ data: [] }),
  ]);
  const agents = ((agentRes.data ?? []) as Agent[]).filter((agent) => agent.status !== "exited");
  const taxOf = new Map(((taxRes.data ?? []) as { agent_id: string; legal_name: string | null; tin_last4: string | null }[]).map((row) => [row.agent_id, row]));
  const total = agents.length;
  const countWhere = (test: (agent: Agent) => boolean) => agents.filter(test).length;
  const withW9 = agents.filter((agent) => agent.w9_status === "received");
  const withoutW9 = agents.filter((agent) => agent.w9_status !== "received");

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow={`Reports · tax year ${year}`} title="Reports" sub="Where onboarding stands, and what is still missing before year-end.">
        <a href="/reports/roster" className={ui.btn} download>
          Export agent roster (CSV)
        </a>
      </PageHeader>

      <div className={ui.grid4}>
        <Stat label="Agents" value={total} note="Not counting agents who have left" />
        <Stat label="Licence verified" value={countWhere((agent) => agent.licence_status === "verified")} note={`of ${total}`} />
        <Stat label="W-9 received" value={withW9.length} note={`of ${total}`} />
        <Stat label="Rider signed" value={countWhere((agent) => agent.rider_status === "signed")} note={`of ${total}`} />
      </div>

      {agentRes.error && <Card><Empty>The report could not be loaded. Please refresh the page.</Empty></Card>}

      <div className={ui.grid2}>
        <Card title="Onboarding by cohort">
          <SummaryTable caption="Agents grouped by the month they were invited" first="Cohort"
            groups={summarise(agents, (agent) => agent.cohort ?? "", (key) => (key ? cohortLabel(key) : "Earlier"), true)} />
        </Card>
        <Card title="Onboarding by office">
          <SummaryTable caption="Agents grouped by office" first="Office" groups={summarise(agents, (agent) => agent.office, (key) => key)} />
        </Card>
      </div>

      <Card title="Agent roster export">
        <p className={ui.help}>
          A CSV of every agent with office, team, status and where their licence, W-9 and rider stand. It never includes tax
          numbers, licence numbers or splits.
        </p>
        <p style={{ marginTop: 12 }}>
          <a href="/reports/roster" className={`${ui.btn} ${ui.small}`} download>
            Download roster (CSV)
          </a>
        </p>
      </Card>

      <Card title={`Year-end 1099 pack · ${year}`}>
        <div className={ui.stack}>
          <div className={ui.grid3}>
            <Stat label="W-9 on file" value={withW9.length} note="Ready for the pack" />
            <Stat label="W-9 missing or mismatched" value={withoutW9.length} note="Fix these before January" />
            <Stat label="Ready" value={total ? `${Math.round((withW9.length / total) * 100)}%` : "–"} />
          </div>
          <Placeholder service="Compliance pack / e-file export">
            The filing-ready 1099 file for your accountant or e-file service will be made here once the compliance pack is
            connected, with payout totals matched to each W-9. This page shows who is ready; it does not file anything.
          </Placeholder>
          {seeTax ? (
            <div className={ui.grid2}>
              <section aria-label="Agents without a W-9 on file">
                <h3 className={ui.strong}>Missing or mismatched ({withoutW9.length})</h3>
                {withoutW9.length ? (
                  <ul className={ui.list}>
                    {withoutW9.map((agent) => (
                      <li key={agent.id}>
                        <Link href={`/agents/${agent.id}`} className={ui.rowLink}>{agent.full_name}</Link>{" "}
                        <StatusBadge kind="w9" value={agent.w9_status} />
                        <br />
                        <span className={ui.soft}>{agent.office}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>Everyone has a W-9 on file.</Empty>
                )}
              </section>
              <section aria-label="Agents with a W-9 on file">
                <h3 className={ui.strong}>W-9 on file ({withW9.length})</h3>
                {withW9.length ? (
                  <div className={ui.tableWrap} style={{ maxHeight: 420, overflowY: "auto" }} tabIndex={0} role="region" aria-label="Agents with a W-9 on file, scrollable">
                    <table className={ui.table}>
                      <thead>
                        <tr>
                          <th scope="col">Agent</th>
                          <th scope="col">Legal name on W-9</th>
                          <th scope="col">Tax number</th>
                        </tr>
                      </thead>
                      <tbody>
                        {withW9.map((agent) => (
                          <tr key={agent.id}>
                            <td><Link href={`/agents/${agent.id}`} className={ui.rowLink}>{agent.full_name}</Link></td>
                            <td>{taxOf.get(agent.id)?.legal_name ?? "–"}</td>
                            <td className={ui.mono}>{maskTin(taxOf.get(agent.id)?.tin_last4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>No W-9s on file yet.</Empty>
                )}
              </section>
            </div>
          ) : (
            <p className={ui.help}>
              Your role shows the counts only. The names and W-9 details are limited to people who handle tax forms.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

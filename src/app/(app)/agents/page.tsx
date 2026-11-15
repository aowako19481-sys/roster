import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Badge, ButtonLink, Card, Empty, PageHeader, Tabs, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { pct } from "@/lib/format";
import { matches, one, withQuery } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Agents" };

type Props = { searchParams: Promise<{ q?: string | string[]; status?: string | string[] }> };

type AgentRow = {
  id: string; full_name: string; email: string | null; office: string; team_label: string | null; status: string;
  licence_status: string; w9_status: string; rider_status: string;
};

// "Onboarding" covers everyone who has been invited but is not active yet.
const FILTERS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: "", label: "All", statuses: null },
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "onboarding", label: "Onboarding", statuses: ["invited", "onboarding"] },
  { key: "flagged", label: "Flagged", statuses: ["flagged"] },
  { key: "exited", label: "Exited", statuses: ["exited"] },
];

export default async function AgentsPage({ searchParams }: Props) {
  const access = await requireCap("agents.view");
  const params = await searchParams;
  const q = one(params.q);
  const filter = FILTERS.find((entry) => entry.key === one(params.status)) ?? FILTERS[0];
  const showSplits = access.caps.has("splits.view");
  const ws = access.workspace.id;
  const supabase = await createClient();

  const [agentsRes, membersRes, teamsRes, ridersRes] = await Promise.all([
    supabase.from("agents")
      .select("id, full_name, email, office, team_label, status, licence_status, w9_status, rider_status")
      .eq("workspace_id", ws).order("full_name").limit(1000),
    supabase.from("team_members").select("team_id, agent_id").eq("workspace_id", ws).limit(2000),
    supabase.from("teams").select("id, name").eq("workspace_id", ws).limit(500),
    showSplits
      ? supabase.from("riders").select("agent_id, split_pct").eq("workspace_id", ws).eq("is_current", true).not("agent_id", "is", null).limit(2000)
      : Promise.resolve({ data: [] as { agent_id: string; split_pct: number }[] }),
  ]);

  const all = (agentsRes.data ?? []) as AgentRow[];
  const teamName = new Map((teamsRes.data ?? []).map((team) => [team.id as string, team.name as string]));
  const teamsOf = new Map<string, string[]>();
  for (const member of membersRes.data ?? []) {
    const name = teamName.get(member.team_id as string);
    if (name) teamsOf.set(member.agent_id as string, [...(teamsOf.get(member.agent_id as string) ?? []), name]);
  }
  const splitOf = new Map((ridersRes.data ?? []).map((rider) => [rider.agent_id as string, rider.split_pct as number]));
  const teamText = (agent: AgentRow) => teamsOf.get(agent.id)?.join(", ") ?? agent.team_label ?? "";

  const searched = all.filter((agent) => matches(q, agent.full_name, agent.office, agent.email, teamText(agent)));
  const rows = searched.filter((agent) => !filter.statuses || filter.statuses.includes(agent.status));
  const count = (statuses: string[] | null) => searched.filter((agent) => !statuses || statuses.includes(agent.status)).length;
  const href = (status: string) => withQuery("/agents", { q, status });

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Agents"
        title={`${all.length} ${all.length === 1 ? "agent" : "agents"}`}
        sub="Everyone at the brokerage, with where their licence, W-9 and rider stand."
      >
        {access.caps.has("agents.invite") && (
          <ButtonLink href="/invite" primary>
            Invite agents
          </ButtonLink>
        )}
      </PageHeader>

      <Card>
        <form method="get" action="/agents" role="search" className={ui.inline}>
          {filter.key && <input type="hidden" name="status" value={filter.key} />}
          <label className={ui.field} style={{ flex: "1 1 280px" }}>
            Search by name, office, team or email
            <input className={ui.input} type="search" name="q" defaultValue={q} maxLength={120} />
          </label>
          <button type="submit" className={ui.btn}>
            Search
          </button>
          {q && (
            <Link href={withQuery("/agents", { status: filter.key })} className={ui.linkBtn}>
              Clear search
            </Link>
          )}
        </form>
      </Card>

      <Tabs
        items={FILTERS.map((entry) => ({ href: href(entry.key), label: `${entry.label} · ${count(entry.statuses)}` }))}
        current={href(filter.key)}
      />

      <Card title={filter.key ? `${filter.label} agents` : "All agents"} aside={<span className={ui.soft}>Showing {rows.length} of {all.length}</span>}>
        {agentsRes.error ? (
          <Empty>The list could not be loaded. Please refresh the page.</Empty>
        ) : rows.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Office</th>
                  <th scope="col">Team</th>
                  <th scope="col">Status</th>
                  <th scope="col">Licence</th>
                  <th scope="col">W-9</th>
                  <th scope="col">Rider</th>
                  {showSplits && <th scope="col" className={ui.num}>Split</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((agent) => (
                  <tr key={agent.id}>
                    <th scope="row">
                      <Link href={`/agents/${agent.id}`} className={ui.rowLink}>
                        {agent.full_name}
                      </Link>
                      {agent.email && (
                        <>
                          <br />
                          <span className={ui.soft}>{agent.email}</span>
                        </>
                      )}
                    </th>
                    <td>{agent.office}</td>
                    <td>{teamText(agent) ? <Badge>{teamText(agent)}</Badge> : <span className={ui.soft}>Solo</span>}</td>
                    <td><StatusBadge kind="agent" value={agent.status} /></td>
                    <td><StatusBadge kind="licence" value={agent.licence_status} /></td>
                    <td><StatusBadge kind="w9" value={agent.w9_status} /></td>
                    <td><StatusBadge kind="rider" value={agent.rider_status} /></td>
                    {showSplits && (
                      <td className={ui.num}>{splitOf.has(agent.id) ? pct(splitOf.get(agent.id)) : <span className={ui.soft}>No signed rider</span>}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{q ? "No agents match that search." : "No agents here yet."}</Empty>
        )}
      </Card>
    </div>
  );
}

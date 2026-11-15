import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, Empty, PageHeader, Stat, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { pct } from "@/lib/format";
import { buildTree, one, UUID_RE, type TreeNode } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import { draftRider, recordSignature } from "../riders/actions";
import { addTeamMember, createTeam, removeTeamMember } from "./actions";
import styles from "./teams.module.css";

export const metadata: Metadata = { title: "Teams" };

type Props = { searchParams: Promise<{ team?: string | string[] }> };
type Team = { id: string; name: string; lead_agent_id: string | null };
type Member = { team_id: string; agent_id: string; parent_agent_id: string | null; role_label: string };
type TeamRider = { id: string; team_id: string; split_pct: number; version: number; status: string; is_current: boolean };

const TEAM_NOTE = "The brokerage tracks only each team’s combined split. How a team divides it stays on the notices of contract.";

export default async function TeamsPage({ searchParams }: Props) {
  const access = await requireCap("agents.view");
  const wanted = one((await searchParams).team);
  const ws = access.workspace.id;
  const showSplits = access.caps.has("splits.view");
  const canManage = access.caps.has("teams.manage");
  const canRiders = access.caps.has("riders.manage") && showSplits;
  const supabase = await createClient();

  const [teamRes, memberRes, agentRes, riderRes] = await Promise.all([
    supabase.from("teams").select("id, name, lead_agent_id").eq("workspace_id", ws).order("name").limit(500),
    supabase.from("team_members").select("team_id, agent_id, parent_agent_id, role_label").eq("workspace_id", ws).limit(5000),
    supabase.from("agents").select("id, full_name, office, status").eq("workspace_id", ws).order("full_name").limit(1000),
    showSplits
      ? supabase.from("riders").select("id, team_id, split_pct, version, status, is_current").eq("workspace_id", ws).not("team_id", "is", null).in("status", ["signed", "sent", "draft"]).limit(1000)
      : Promise.resolve({ data: [] as TeamRider[] }),
  ]);
  const teams = (teamRes.data ?? []) as Team[];
  const members = (memberRes.data ?? []) as Member[];
  const agents = (agentRes.data ?? []) as { id: string; full_name: string; office: string; status: string }[];
  const riders = (riderRes.data ?? []) as TeamRider[];
  const agentOf = new Map(agents.map((agent) => [agent.id, agent]));
  const nameOf = (id: string | null) => (id && agentOf.get(id)?.full_name) || "Someone outside your view";
  const membersOf = (teamId: string) => members.filter((member) => member.team_id === teamId);
  const currentRider = (teamId: string) => riders.find((rider) => rider.team_id === teamId && rider.is_current);

  const selected = teams.find((team) => team.id === (UUID_RE.test(wanted) ? wanted : "")) ?? teams[0] ?? null;
  const selectedMembers = selected ? membersOf(selected.id) : [];
  const tree = selected ? buildTree(selectedMembers, selected.lead_agent_id) : [];
  const selectedRider = selected ? currentRider(selected.id) : undefined;
  const waitingRider = selected ? riders.find((rider) => rider.team_id === selected.id && rider.status !== "signed") : undefined;
  const onSelected = new Set(selectedMembers.map((member) => member.agent_id));
  const addable = agents.filter((agent) => !onSelected.has(agent.id) && agent.status !== "exited");

  const renderNodes = (nodes: TreeNode<Member>[]) => (
    <ul>
      {nodes.map((node) => {
        const agent = agentOf.get(node.item.agent_id);
        const isLead = selected?.lead_agent_id === node.item.agent_id;
        return (
          <li key={node.item.agent_id}>
            <div className={styles.node}>
              {agent ? (
                <Link href={`/agents/${agent.id}`} className={ui.rowLink}>{agent.full_name}</Link>
              ) : (
                <span className={ui.soft}>Someone outside your view</span>
              )}
              <Badge tone={isLead ? "dark" : "plain"}>{isLead ? "Team lead" : node.item.role_label}</Badge>
              {agent && <span className={ui.soft}>{agent.office}</span>}
              {canManage && selected && !isLead && (
                <ActionForm action={removeTeamMember} className={ui.inline}>
                  <input type="hidden" name="team" value={selected.id} />
                  <input type="hidden" name="agent" value={node.item.agent_id} />
                  <Submit variant="link" busy="Removing…" aria-label={`Remove ${nameOf(node.item.agent_id)} from ${selected.name}`}>
                    Remove
                  </Submit>
                </ActionForm>
              )}
            </div>
            {node.children.length > 0 && renderNodes(node.children)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Teams" title="Registered teams" sub={TEAM_NOTE} />

      {teams.length ? (
        <nav aria-label="Teams" className={ui.grid3}>
          {teams.map((team) => {
            const rider = currentRider(team.id);
            const count = membersOf(team.id).length;
            const isCurrent = selected?.id === team.id;
            return (
              <Card key={team.id} className={isCurrent ? styles.current : ""}>
                <Link href={`/teams?team=${team.id}`} className={styles.teamLink} aria-current={isCurrent ? "true" : undefined}>
                  <span className={styles.teamName}>{team.name}</span>
                  <br />
                  <span className={ui.soft}>
                    {count} {count === 1 ? "person" : "people"} · lead {team.lead_agent_id ? nameOf(team.lead_agent_id) : "not set"}
                  </span>
                </Link>
                {showSplits && (
                  <p style={{ marginTop: 10 }}>
                    {rider ? <Badge tone="ok">Team split {pct(rider.split_pct)}</Badge> : <Badge tone="warn">No signed team rider</Badge>}
                  </p>
                )}
              </Card>
            );
          })}
        </nav>
      ) : (
        <Card>
          <Empty>No teams are registered yet.</Empty>
        </Card>
      )}

      {selected && (
        <div className={ui.split}>
          <Card title={`${selected.name} · structure`} aside={<span className={ui.soft}>Select anyone to open their card</span>}>
            {tree.length ? <div className={styles.tree}>{renderNodes(tree)}</div> : <Empty>This team has no members yet.</Empty>}
            <p className={ui.help} style={{ marginTop: 14 }}>{TEAM_NOTE}</p>
          </Card>

          <div className={ui.stack}>
            {showSplits && (
              <Card title="Team rider">
                <div className={ui.stack}>
                  <Stat
                    label="Combined team split"
                    value={selectedRider ? pct(selectedRider.split_pct) : "–"}
                    note={selectedRider ? `Version ${selectedRider.version}, signed` : "No signed team rider yet"}
                  />
                  {waitingRider && (
                    <p className={ui.help}>
                      Version {waitingRider.version} at {pct(waitingRider.split_pct)} is waiting for a signature.
                    </p>
                  )}
                  {canRiders && waitingRider && (
                    <ActionForm action={recordSignature} resetOnSuccess>
                      <input type="hidden" name="rider" value={waitingRider.id} />
                      <label className={ui.field}>
                        Name of the person who signed
                        <input className={ui.input} name="signer" defaultValue={selected.lead_agent_id ? agentOf.get(selected.lead_agent_id)?.full_name ?? "" : ""} required minLength={2} maxLength={120} />
                      </label>
                      <div>
                        <Submit small>Record signature</Submit>
                      </div>
                    </ActionForm>
                  )}
                  {canRiders && (
                    <ActionForm action={draftRider} resetOnSuccess>
                      <input type="hidden" name="team" value={selected.id} />
                      <label className={ui.field}>
                        Draft a team rider at (%)
                        <input className={ui.input} name="pct" inputMode="decimal" required defaultValue={selectedRider?.split_pct ?? ""} />
                      </label>
                      <p className={ui.help}>It takes effect only once it is signed. Drafting replaces any team rider still waiting.</p>
                      <div>
                        <Submit small variant="plain">Draft team rider</Submit>
                      </div>
                    </ActionForm>
                  )}
                </div>
              </Card>
            )}

            {canManage && (
              <Card title={`Add a member to ${selected.name}`}>
                <ActionForm action={addTeamMember} resetOnSuccess>
                  <input type="hidden" name="team" value={selected.id} />
                  <label className={ui.field}>
                    Agent
                    <select className={ui.select} name="agent" required defaultValue="">
                      <option value="" disabled>Choose an agent</option>
                      {addable.map((agent) => (
                        <option key={agent.id} value={agent.id}>{agent.full_name} · {agent.office}</option>
                      ))}
                    </select>
                  </label>
                  <label className={ui.field}>
                    Reports to
                    <select className={ui.select} name="parent" defaultValue={selected.lead_agent_id ?? ""}>
                      {selectedMembers.map((member) => (
                        <option key={member.agent_id} value={member.agent_id}>{nameOf(member.agent_id)}</option>
                      ))}
                    </select>
                  </label>
                  <label className={ui.field}>
                    Role label
                    <input className={ui.input} name="role" defaultValue="Member" maxLength={40} />
                  </label>
                  <div>
                    <Submit small>Add member</Submit>
                  </div>
                </ActionForm>
              </Card>
            )}
          </div>
        </div>
      )}

      {canManage && (
        <Card title="Register a new team">
          <ActionForm action={createTeam} resetOnSuccess>
            <div className={ui.formRow}>
              <label className={ui.field}>
                Team name
                <input className={ui.input} name="name" required minLength={2} maxLength={80} />
              </label>
              <label className={ui.field}>
                Team lead
                <select className={ui.select} name="lead" required defaultValue="">
                  <option value="" disabled>Choose the lead</option>
                  {agents.filter((agent) => agent.status !== "exited").map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.full_name} · {agent.office}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className={ui.help}>
              A team gets its own team rider. Unless changed in Settings, an agent can be on one team at a time.
            </p>
            <div>
              <Submit>Create team</Submit>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

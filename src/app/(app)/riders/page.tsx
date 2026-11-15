import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Badge, Card, Empty, PageHeader, Placeholder, Stat, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { day, dayTime, pct } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { decideTier, recordSignature } from "./actions";

export const metadata: Metadata = { title: "Tier clearance" };

type Approval = {
  id: string; subject_kind: string; subject_name: string; reason: string; from_pct: number; to_pct: number; status: string;
  agent_id: string | null; team_id: string | null; decided_at: string | null; created_at: string | null;
};
type WaitingRider = { id: string; agent_id: string | null; team_id: string | null; version: number; split_pct: number; created_at: string };

const ORDER: Record<string, number> = { waiting: 0, held: 1, approved: 2 };
const RULE = "Approving drafts the new rider and logs who approved it.";

export default async function RidersPage() {
  const access = await requireCap("splits.view");
  const ws = access.workspace.id;
  const tz = access.workspace.timezone;
  const canApprove = access.caps.has("tiers.approve");
  const canSign = access.caps.has("riders.manage");
  const supabase = await createClient();

  const [approvalRes, riderRes, agentRes, teamRes] = await Promise.all([
    supabase.from("tier_approvals")
      .select("id, subject_kind, subject_name, reason, from_pct, to_pct, status, agent_id, team_id, decided_at, created_at")
      .eq("workspace_id", ws).order("position").limit(500),
    supabase.from("riders").select("id, agent_id, team_id, version, split_pct, created_at").eq("workspace_id", ws).eq("status", "sent")
      .order("created_at", { ascending: false }).limit(500),
    supabase.from("agents").select("id, full_name").eq("workspace_id", ws).limit(1000),
    supabase.from("teams").select("id, name, lead_agent_id").eq("workspace_id", ws).limit(500),
  ]);
  const approvals = ((approvalRes.data ?? []) as Approval[]).sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  const waitingRiders = (riderRes.data ?? []) as WaitingRider[];
  const agentName = new Map((agentRes.data ?? []).map((agent) => [agent.id as string, agent.full_name as string]));
  const teamOf = new Map((teamRes.data ?? []).map((team) => [team.id as string, team as { id: string; name: string; lead_agent_id: string | null }]));
  const countOf = (status: string) => approvals.filter((approval) => approval.status === status).length;

  const decide = (approval: Approval, decision: string, label: string, variant: "primary" | "plain" | "danger" = "plain") => (
    <ActionForm action={decideTier} className={ui.inline}>
      <input type="hidden" name="approval" value={approval.id} />
      <input type="hidden" name="decision" value={decision} />
      <Submit small variant={variant} aria-label={`${label}: ${approval.subject_name}, ${approval.from_pct}% to ${approval.to_pct}%`}>
        {label}
      </Submit>
    </ActionForm>
  );

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Riders"
        title="Tier clearance"
        sub="When an agent or team crosses a tier, the move waits here for a person to clear it."
      />

      <div className={ui.grid3}>
        <Stat label="Waiting" value={countOf("waiting")} />
        <Stat label="Held for review" value={countOf("held")} />
        <Stat label="Approved" value={countOf("approved")} />
      </div>

      <Card title="Tier moves" aside={!canApprove ? <Badge tone="muted">View only</Badge> : undefined}>
        <p className={ui.help} style={{ marginBottom: 14 }}>
          <strong>Pay never changes on its own.</strong> {RULE} A deal entered at the new split stays blocked until the move is
          approved here.
        </p>
        {approvalRes.error ? (
          <Empty>The list could not be loaded. Please refresh the page.</Empty>
        ) : approvals.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Who</th>
                  <th scope="col">Reason</th>
                  <th scope="col" className={ui.num}>From → to</th>
                  <th scope="col">Status</th>
                  {canApprove && <th scope="col">Decision</th>}
                </tr>
              </thead>
              <tbody>
                {approvals.map((approval) => (
                  <tr key={approval.id}>
                    <td>
                      {approval.agent_id ? (
                        <Link href={`/agents/${approval.agent_id}`} className={ui.rowLink}>{approval.subject_name}</Link>
                      ) : approval.team_id ? (
                        <Link href={`/teams?team=${approval.team_id}`} className={ui.rowLink}>{approval.subject_name}</Link>
                      ) : (
                        <span className={ui.strong}>{approval.subject_name}</span>
                      )}
                      <br />
                      <span className={ui.soft}>{approval.subject_kind === "team" ? "Team rider" : "Individual rider"}</span>
                    </td>
                    <td>{approval.reason}</td>
                    <td className={ui.num}>
                      {pct(approval.from_pct)} <span aria-hidden="true">→</span><span className={ui.soft}> to </span>{pct(approval.to_pct)}
                    </td>
                    <td>
                      <StatusBadge kind="tier" value={approval.status} />
                      {approval.decided_at && approval.status !== "waiting" && (
                        <>
                          <br />
                          <span className={ui.soft}>{dayTime(approval.decided_at, tz)}</span>
                        </>
                      )}
                    </td>
                    {canApprove && (
                      <td>
                        <div className={ui.inline}>
                          {approval.status === "waiting" && decide(approval, "approve", "Approve", "primary")}
                          {approval.status === "waiting" && decide(approval, "hold", "Hold for review")}
                          {approval.status === "held" && decide(approval, "approve", "Approve", "primary")}
                          {approval.status === "held" && decide(approval, "reopen", "Reopen")}
                          {approval.status === "approved" && decide(approval, "undo", "Undo")}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No tier moves are waiting. They appear here when an agent or team crosses a tier.</Empty>
        )}
      </Card>

      <Card title="Riders waiting for signature" aside={<span className={ui.soft}>{waitingRiders.length} waiting</span>}>
        {waitingRiders.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Who</th>
                  <th scope="col">Version</th>
                  <th scope="col" className={ui.num}>Split</th>
                  <th scope="col">Sent</th>
                  {canSign && <th scope="col">Record signature</th>}
                </tr>
              </thead>
              <tbody>
                {waitingRiders.map((rider) => {
                  const team = rider.team_id ? teamOf.get(rider.team_id) : undefined;
                  const who = rider.agent_id ? agentName.get(rider.agent_id) : team?.name;
                  const signer = rider.agent_id ? who : team?.lead_agent_id ? agentName.get(team.lead_agent_id) : "";
                  return (
                    <tr key={rider.id}>
                      <td>
                        {rider.agent_id ? (
                          <Link href={`/agents/${rider.agent_id}`} className={ui.rowLink}>{who ?? "Agent outside your view"}</Link>
                        ) : (
                          <Link href={`/teams?team=${rider.team_id}`} className={ui.rowLink}>{who ?? "Team"}</Link>
                        )}
                        <br />
                        <span className={ui.soft}>{rider.team_id ? "Team rider" : "Individual rider"}</span>
                      </td>
                      <td>v{rider.version}</td>
                      <td className={ui.num}>{pct(rider.split_pct)}</td>
                      <td>{day(rider.created_at, tz)}</td>
                      {canSign && (
                        <td>
                          <ActionForm action={recordSignature} className={ui.inline}>
                            <input type="hidden" name="rider" value={rider.id} />
                            <label className={ui.field}>
                              Signed by
                              <input className={ui.input} name="signer" defaultValue={signer ?? ""} required minLength={2} maxLength={120} />
                            </label>
                            <Submit small variant="plain" aria-label={`Record signature for ${who ?? "this rider"}`}>
                              Record signature
                            </Submit>
                          </ActionForm>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No riders are waiting for a signature.</Empty>
        )}
        <div style={{ marginTop: 14 }}>
          <Placeholder service="E-signature email">
            Agents sign their rider through their private onboarding link. Emailing a rider for signature will connect here
            later; until then, record a signature collected on paper with the button above.
          </Placeholder>
        </div>
      </Card>
    </div>
  );
}

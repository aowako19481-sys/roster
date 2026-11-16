import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Badge, Card, Empty, PageHeader, Placeholder, Stat, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { day, dayTime, pct } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { documensoReady } from "@/lib/documenso";
import { cancelRiderSigning, checkSignatures, decideTier, recordSignature, remindRider, sendRider, setRiderTemplate } from "./actions";

export const metadata: Metadata = { title: "Tier clearance" };

type Approval = {
  id: string; subject_kind: string; subject_name: string; reason: string; from_pct: number; to_pct: number; status: string;
  agent_id: string | null; team_id: string | null; decided_at: string | null; created_at: string | null;
};
type SignRequest = { id: string; rider_id: string; signer_name: string; status: string; sent_at: string };
const SIGN_LABEL: Record<string, string> = { sent: "Sent", opened: "Opened", signed: "Signed", declined: "Declined", cancelled: "Cancelled" };
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

  const [approvalRes, riderRes, agentRes, teamRes, requestRes, workspaceRes] = await Promise.all([
    supabase.from("tier_approvals")
      .select("id, subject_kind, subject_name, reason, from_pct, to_pct, status, agent_id, team_id, decided_at, created_at")
      .eq("workspace_id", ws).order("position").limit(500),
    supabase.from("riders").select("id, agent_id, team_id, version, split_pct, created_at").eq("workspace_id", ws).eq("status", "sent")
      .order("created_at", { ascending: false }).limit(500),
    supabase.from("agents").select("id, full_name").eq("workspace_id", ws).limit(1000),
    supabase.from("teams").select("id, name, lead_agent_id").eq("workspace_id", ws).limit(500),
    supabase.from("sign_requests").select("id, rider_id, signer_name, status, sent_at").eq("workspace_id", ws).order("sent_at").limit(1000),
    supabase.from("workspaces").select("rider_template_name").eq("id", ws).maybeSingle(),
  ]);
  const signingOn = documensoReady();
  const templateName = (workspaceRes.data?.rider_template_name as string | null | undefined) ?? null;
  const requestsOf = new Map<string, SignRequest[]>();
  for (const request of (requestRes.data ?? []) as SignRequest[]) requestsOf.set(request.rider_id, [...(requestsOf.get(request.rider_id) ?? []), request]);
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

      {canSign && (
        <Card title="Electronic signature" aside={signingOn ? <Badge tone="muted">On</Badge> : <Badge tone="muted">Not switched on</Badge>}>
          <div className={ui.stack}>
            <p className={ui.help}>
              {signingOn
                ? "Send a rider and each person gets an email to sign on screen. The signed copy and its certificate file themselves in the agent’s file."
                : "Electronic signing is not switched on for Kinu yet. Until it is, record signatures by hand below."}
            </p>
            <p>
              <strong>Your rider document:</strong> {templateName ?? "none uploaded. Riders go out as a one-page Kinu rider."}
            </p>
            <ActionForm action={setRiderTemplate} className={ui.inline}>
              <label className={ui.field}>
                {templateName ? "Replace it with another PDF" : "Upload your own rider (PDF, up to 4 MB)"}
                <input className={ui.input} type="file" name="file" required accept="application/pdf" style={{ paddingTop: 9 }} />
              </label>
              <Submit small busy="Uploading…">Save rider document</Submit>
            </ActionForm>
            <p className={ui.help}>Kinu adds one page after your document with the person’s split, tiers and the place to sign.</p>
            <div className={ui.inline}>
              {templateName ? (
                <ActionForm action={setRiderTemplate} className={ui.inline}>
                  <input type="hidden" name="remove" value="yes" />
                  <Submit small variant="plain">Remove my rider document</Submit>
                </ActionForm>
              ) : null}
              {signingOn ? (
                <ActionForm action={checkSignatures} className={ui.inline}>
                  <Submit small variant="plain" busy="Checking…">Check for new signatures</Submit>
                </ActionForm>
              ) : null}
            </div>
          </div>
        </Card>
      )}

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
                  <th scope="col">Electronic signature</th>
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
                      <td>
                        {(() => {
                          const requests = (requestsOf.get(rider.id) ?? []).filter((request) => request.status !== "cancelled");
                          const waiting = requests.some((request) => request.status === "sent" || request.status === "opened");
                          return (
                            <div className={ui.stack} style={{ gap: 8 }}>
                              {requests.length ? (
                                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                                  {requests.map((request) => (
                                    <li key={request.id}>
                                      {request.signer_name}: <strong>{SIGN_LABEL[request.status] ?? request.status}</strong>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className={ui.soft}>Not sent yet</span>
                              )}
                              {canSign && signingOn && !waiting && (
                                <ActionForm action={sendRider} className={ui.inline}>
                                  <input type="hidden" name="rider" value={rider.id} />
                                  {rider.team_id ? (
                                    <label className={ui.field}>
                                      Who signs
                                      <select className={ui.input} name="mode" defaultValue="lead">
                                        <option value="lead">Team lead only</option>
                                        <option value="members">Every team member</option>
                                      </select>
                                    </label>
                                  ) : null}
                                  <Submit small busy="Sending…" aria-label={`Send for signature: ${who ?? "rider"}, version ${rider.version}`}>
                                    {requests.length ? "Send again" : "Send for signature"}
                                  </Submit>
                                </ActionForm>
                              )}
                              {canSign && waiting && (
                                <div className={ui.inline}>
                                  <ActionForm action={remindRider} className={ui.inline}>
                                    <input type="hidden" name="rider" value={rider.id} />
                                    <Submit small variant="plain" busy="Sending…" aria-label={`Remind: ${who ?? "rider"}`}>Remind</Submit>
                                  </ActionForm>
                                  <ActionForm action={cancelRiderSigning} className={ui.inline}>
                                    <input type="hidden" name="rider" value={rider.id} />
                                    <Submit small variant="danger" aria-label={`Cancel signing: ${who ?? "rider"}`}>Cancel</Submit>
                                  </ActionForm>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
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

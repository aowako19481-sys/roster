import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { NewLinkForm } from "@/components/ops/NewLinkForm";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { Badge, ButtonLink, Card, Empty, PageHeader, Placeholder, Stat, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { day, dayTime, money, moneyWhole, pct, titleCase } from "@/lib/format";
import { auditText, cohortLabel, docKind, maskTin, readTiers, tiersToText, UUID_RE } from "@/lib/ops";
import { createClient } from "@/lib/supabase/server";
import { reissueInvite } from "../../invite/actions";
import { draftRider, recordSignature } from "../../riders/actions";
import { reviewLicence, saveAgentDetails } from "./actions";

export const metadata: Metadata = { title: "Agent card" };

type Props = { params: Promise<{ id: string }> };

type Rider = {
  id: string; version: number; split_pct: number; tiers: unknown; status: string; is_current: boolean;
  signed_name: string | null; signed_at: string | null; signature_note: string | null; created_at: string;
};

const none = Promise.resolve({ data: null, error: null });

export default async function AgentCardPage({ params }: Props) {
  const access = await requireCap("agents.view");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const can = (cap: Parameters<typeof access.caps.has>[0]) => access.caps.has(cap);
  const ws = access.workspace.id;
  const tz = access.workspace.timezone;
  const supabase = await createClient();

  // The full licence number is never read here: only the masked form is shown.
  const { data: agent } = await supabase.from("agents")
    .select("id, full_name, email, phone, office, office_id, status, cohort, licence_masked, licence_state, licence_status, licence_note, licence_expires_on, w9_status, rider_status, onboarding_status, gci_ytd, joined_on, exited_on, invite_sent_at, invite_expires_at")
    .eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!agent) notFound();

  const showDeals = can("deals.view") && access.workspace.hasFinance;
  const [memberRes, officeRes, docRes, riderRes, taxRes, lineRes, auditRes] = await Promise.all([
    supabase.from("team_members").select("team_id, role_label").eq("workspace_id", ws).eq("agent_id", id),
    can("agents.edit") ? supabase.from("offices").select("id, name").eq("workspace_id", ws).order("name") : none,
    can("files.view")
      ? supabase.from("documents").select("id, kind, filename, path, status, note, created_at").eq("workspace_id", ws).eq("agent_id", id).order("created_at", { ascending: false }).limit(100)
      : none,
    can("splits.view")
      ? supabase.from("riders").select("id, version, split_pct, tiers, status, is_current, signed_name, signed_at, signature_note, created_at").eq("workspace_id", ws).eq("agent_id", id).order("version", { ascending: false }).limit(50)
      : none,
    can("w9.view") ? supabase.from("agent_tax").select("legal_name, tin_last4, provider_ref, received_at").eq("workspace_id", ws).eq("agent_id", id).maybeSingle() : none,
    showDeals
      ? supabase.from("deal_agents").select("deal_id, basis, split_pct, payout, check_status").eq("workspace_id", ws).eq("agent_id", id).limit(200)
      : none,
    can("audit.view")
      ? supabase.from("audit_log").select("id, action, entity, summary, detail, actor_label, at").eq("workspace_id", ws).eq("entity_id", id).order("at", { ascending: false }).limit(40)
      : none,
  ]);

  const memberships = (memberRes.data ?? []) as { team_id: string; role_label: string }[];
  const lines = (lineRes.data ?? []) as { deal_id: string; basis: string; split_pct: number; payout: number; check_status: string }[];
  const [teamRes, dealRes] = await Promise.all([
    memberships.length
      ? supabase.from("teams").select("id, name, lead_agent_id").eq("workspace_id", ws).in("id", memberships.map((m) => m.team_id))
      : none,
    lines.length
      ? supabase.from("deals").select("id, address, deal_type, status, gci, deposit_date, created_at").eq("workspace_id", ws).in("id", lines.map((line) => line.deal_id)).order("created_at", { ascending: false }).limit(8)
      : none,
  ]);

  const teams = (teamRes.data ?? []) as { id: string; name: string; lead_agent_id: string | null }[];
  const offices = (officeRes.data ?? []) as { id: string; name: string }[];
  const documents = (docRes.data ?? []) as { id: string; kind: string; filename: string; path: string | null; status: string; note: string | null; created_at: string }[];
  const riders = (riderRes.data ?? []) as Rider[];
  const tax = taxRes.data as { legal_name: string | null; tin_last4: string | null; provider_ref: string | null; received_at: string | null } | null;
  const deals = (dealRes.data ?? []) as { id: string; address: string; deal_type: string; status: string; gci: number; deposit_date: string | null }[];
  const audit = (auditRes.data ?? []) as { id: number; action: string; entity: string; summary: string | null; detail: unknown; actor_label: string | null; at: string }[];

  const current = riders.find((rider) => rider.is_current) ?? null;
  const waiting = riders.find((rider) => rider.status === "sent" || rider.status === "draft") ?? null;
  const tiers = readTiers(current?.tiers ?? waiting?.tiers);
  const nextTier = current ? tiers.filter((tier) => tier.pct > current.split_pct).sort((a, b) => a.from - b.from)[0] : undefined;
  const lineOf = new Map(lines.map((line) => [line.deal_id, line]));
  const stillOnboarding = agent.onboarding_status !== "ready" && agent.status !== "exited";

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Agent card"
        title={agent.full_name}
        sub={[agent.office, agent.email, agent.phone].filter(Boolean).join(" · ")}
      >
        <StatusBadge kind="agent" value={agent.status} />
        {teams.map((team) => (
          <Link key={team.id} href={`/teams?team=${team.id}`} className={ui.rowLink}>
            <Badge tone="dark">
              {team.name}
              {team.lead_agent_id === agent.id ? " · lead" : ""}
            </Badge>
          </Link>
        ))}
        <ButtonLink href="/agents" small>
          All agents
        </ButtonLink>
      </PageHeader>

      <div className={ui.grid4}>
        <Stat label="Cohort" value={cohortLabel(agent.cohort)} />
        <Stat label="Joined" value={day(agent.joined_on)} note={agent.exited_on ? `Exited ${day(agent.exited_on)}` : undefined} />
        <Stat label="Onboarding" value={titleCase(agent.onboarding_status)} />
        {showDeals && <Stat label="Commission this year" value={moneyWhole(agent.gci_ytd)} note="From closed payrolls" />}
      </div>

      <div className={ui.grid2}>
        <Card title="Licence" aside={<StatusBadge kind="licence" value={agent.licence_status} />}>
          <dl className={ui.kv}>
            <dt>Number</dt>
            <dd className={ui.mono}>{agent.licence_masked ?? "Not on file"}</dd>
            <dt>State</dt>
            <dd>{agent.licence_state ?? "–"}</dd>
            <dt>Expires</dt>
            <dd>{day(agent.licence_expires_on)}</dd>
            <dt>Note</dt>
            <dd>{agent.licence_note ?? "–"}</dd>
          </dl>
          {can("riders.manage") && (
            <div className={ui.stack} style={{ marginTop: 18 }}>
              <ActionForm action={reviewLicence}>
                <input type="hidden" name="agent" value={agent.id} />
                <input type="hidden" name="verdict" value="verified" />
                <div>
                  <Submit small>Confirm licence</Submit>
                </div>
                <p className={ui.help}>Confirm only after checking the number and name against the state’s public record.</p>
              </ActionForm>
              <ActionForm action={reviewLicence} resetOnSuccess>
                <input type="hidden" name="agent" value={agent.id} />
                <input type="hidden" name="verdict" value="mismatch" />
                <div className={ui.inline}>
                  <label className={ui.field} style={{ flex: "1 1 220px" }}>
                    What does not match?
                    <input className={ui.input} name="note" required minLength={3} maxLength={200} placeholder="e.g. name differs from state record" />
                  </label>
                  <Submit small variant="danger">Flag mismatch</Submit>
                </div>
              </ActionForm>
              <Placeholder service="State licence lookup">
                The number will be checked against the state record automatically once a lookup service is connected. Until
                then a person confirms it here.
              </Placeholder>
            </div>
          )}
        </Card>

        <Card title="W-9" aside={<StatusBadge kind="w9" value={agent.w9_status} />}>
          {can("w9.view") ? (
            <dl className={ui.kv}>
              <dt>Legal name</dt>
              <dd>{tax?.legal_name ?? "Not on file"}</dd>
              <dt>Tax number</dt>
              <dd className={ui.mono}>{maskTin(tax?.tin_last4)}</dd>
              <dt>Received</dt>
              <dd>{tax?.received_at ? dayTime(tax.received_at, tz) : "–"}</dd>
            </dl>
          ) : (
            <p className={ui.help}>Your role shows only whether the W-9 is in. The details are limited to people who handle tax forms.</p>
          )}
          <div style={{ marginTop: 18 }}>
            <Placeholder service="W-9 service">
              The full form is held by the W-9 service, never here. Only the last four digits of the tax number are ever kept
              or shown.
            </Placeholder>
          </div>
        </Card>
      </div>

      {can("splits.view") && (
        <Card
          title="Individual rider and tiers"
          aside={current ? <Badge tone="ok">Current · v{current.version}</Badge> : <Badge tone="warn">No signed rider</Badge>}
        >
          <div className={ui.split}>
            <div className={ui.stack}>
              <div className={ui.grid3}>
                <Stat label="Split" value={current ? pct(current.split_pct) : "–"} note={current?.signed_at ? `Signed ${day(current.signed_at, tz)}${current.signed_name ? ` by ${current.signed_name}` : ""}` : undefined} />
                <Stat label="Next tier" value={nextTier ? pct(nextTier.pct) : "–"} note={nextTier ? `From ${moneyWhole(nextTier.from)} commission` : "No higher tier on this rider"} />
                <Stat label="Waiting for signature" value={waiting ? pct(waiting.split_pct) : "None"} note={waiting ? `Version ${waiting.version}` : undefined} />
              </div>
              {tiers.length > 0 && (
                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <caption className={ui.soft} style={{ textAlign: "left", paddingBottom: 8 }}>Tiers on the {current ? "current" : "waiting"} rider</caption>
                    <thead>
                      <tr>
                        <th scope="col">Commission this year</th>
                        <th scope="col" className={ui.num}>Split</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((tier) => (
                        <tr key={`${tier.from}-${tier.pct}`}>
                          <td>{tier.to === null ? `${moneyWhole(tier.from)} and above` : `${moneyWhole(tier.from)} to ${moneyWhole(tier.to)}`}</td>
                          <td className={ui.num}>{pct(tier.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className={ui.help}>
                Crossing a tier drafts the new rider and holds it for finance. Pay never changes on its own.{" "}
                <Link href="/riders">Open tier clearance</Link>
              </p>
              {riders.length > 0 && (
                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <caption className={ui.soft} style={{ textAlign: "left", paddingBottom: 8 }}>Every version of this rider</caption>
                    <thead>
                      <tr>
                        <th scope="col">Version</th>
                        <th scope="col" className={ui.num}>Split</th>
                        <th scope="col">Status</th>
                        <th scope="col">Signed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riders.map((rider) => (
                        <tr key={rider.id}>
                          <td>v{rider.version}</td>
                          <td className={ui.num}>{pct(rider.split_pct)}</td>
                          <td>
                            <StatusBadge kind="rider" value={rider.status === "sent" ? "sent" : rider.status} />
                          </td>
                          <td>
                            {rider.signed_at ? `${day(rider.signed_at, tz)}${rider.signed_name ? ` · ${rider.signed_name}` : ""}` : "–"}
                            {rider.signature_note && <span className={ui.soft}> · {rider.signature_note}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {can("riders.manage") && (
              <div className={ui.stack}>
                {waiting && (
                  <ActionForm action={recordSignature} resetOnSuccess>
                    <h3 className={ui.strong}>Record signature</h3>
                    <p className={ui.help}>
                      Version {waiting.version} at {pct(waiting.split_pct)} is waiting. Use this when the signature was collected
                      outside the portal, for example on paper.
                    </p>
                    <input type="hidden" name="rider" value={waiting.id} />
                    <label className={ui.field}>
                      Name of the person who signed
                      <input className={ui.input} name="signer" defaultValue={agent.full_name} required minLength={2} maxLength={120} />
                    </label>
                    <div>
                      <Submit small>Record signature</Submit>
                    </div>
                  </ActionForm>
                )}
                <ActionForm action={draftRider} resetOnSuccess>
                  <h3 className={ui.strong}>Draft rider amendment</h3>
                  <p className={ui.help}>
                    A split changes only through a signed amendment. Drafting replaces any amendment still waiting for a signature.
                  </p>
                  <input type="hidden" name="agent" value={agent.id} />
                  <label className={ui.field}>
                    New split (%)
                    <input className={ui.input} name="pct" inputMode="decimal" required defaultValue={current?.split_pct ?? waiting?.split_pct ?? ""} />
                  </label>
                  <label className={ui.field}>
                    Tiers, one per line: from, to, percent
                    <textarea className={`${ui.textarea} ${ui.mono}`} name="tiers" rows={4} defaultValue={tiersToText(tiers)} aria-describedby="tiers-help" />
                  </label>
                  <p id="tiers-help" className={ui.help}>Leave “to” empty for the top tier, e.g. “40000, , 85”. Leave the box empty for no tiers.</p>
                  <div>
                    <Submit small variant="plain">Draft amendment</Submit>
                  </div>
                </ActionForm>
                <Placeholder service="E-signature email">
                  The amendment will be emailed to the agent for signature once the email service is connected. For now the
                  agent signs through their onboarding link, or you record a paper signature above.
                </Placeholder>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className={ui.grid2}>
        {can("files.view") && (
          <Card title="Documents" aside={<Link href={`/agents/${id}/file`} className={ui.linkBtn}>Open agent file</Link>}>
            {documents.length ? (
              <ul className={ui.list}>
                {documents.map((doc) => (
                  <li key={doc.id}>
                    <span className={ui.strong}>{doc.filename}</span> <StatusBadge kind="document" value={doc.status} />
                    <br />
                    <span className={ui.soft}>
                      {docKind(doc.kind)?.one ?? titleCase(doc.kind)} · added {day(doc.created_at, tz)}
                      {doc.note ? ` · ${doc.note}` : ""}
                    </span>
                    {doc.path && (
                      <>
                        {" "}
                        <a href={`/files/${doc.id}`} className={ui.linkBtn} target="_blank" rel="noopener noreferrer">
                          View<span className={ui.soft}> (opens in a new tab)</span>
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No documents on file for this agent yet.</Empty>
            )}
          </Card>
        )}

        {showDeals && (
          <Card title="Recent deals">
            {deals.length ? (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">Address</th>
                      <th scope="col">Status</th>
                      <th scope="col" className={ui.num}>GCI</th>
                      {can("payouts.view") && <th scope="col" className={ui.num}>Payout</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((deal) => (
                      <tr key={deal.id}>
                        <td>
                          <Link href={`/deals/${deal.id}`} className={ui.rowLink}>{deal.address}</Link>
                          <br />
                          <span className={ui.soft}>
                            {titleCase(deal.deal_type)}
                            {lineOf.get(deal.id)?.basis === "team" ? " · on the team rider" : ""}
                          </span>
                        </td>
                        <td><StatusBadge kind="deal" value={deal.status} /></td>
                        <td className={ui.num}>{money(deal.gci)}</td>
                        {can("payouts.view") && <td className={ui.num}>{money(lineOf.get(deal.id)?.payout)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No deals for this agent yet.</Empty>
            )}
          </Card>
        )}
      </div>

      {(can("agents.edit") || can("agents.invite")) && (
        <div className={ui.grid2}>
          {can("agents.edit") && (
            <Card title="Edit details">
              <ActionForm action={saveAgentDetails}>
                <input type="hidden" name="id" value={agent.id} />
                <div className={ui.formRow}>
                  <label className={ui.field}>
                    Office
                    <select className={ui.select} name="office" defaultValue={agent.office_id ?? ""} required>
                      {!agent.office_id && <option value="">Choose an office</option>}
                      {offices.map((office) => (
                        <option key={office.id} value={office.id}>{office.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className={ui.field}>
                    Phone
                    <input className={ui.input} name="phone" type="tel" autoComplete="off" defaultValue={agent.phone ?? ""} maxLength={40} />
                  </label>
                </div>
                <label className={ui.field}>
                  Email
                  <input className={ui.input} name="email" type="email" autoComplete="off" defaultValue={agent.email ?? ""} required maxLength={254} />
                </label>
                <p className={ui.help}>
                  Splits cannot be edited here. They change only through a rider amendment, so every change has a signature.
                </p>
                <div>
                  <Submit>Save changes</Submit>
                </div>
              </ActionForm>
            </Card>
          )}
          {can("agents.invite") && (
            <Card title="Onboarding link">
              {stillOnboarding ? (
                <div className={ui.stack}>
                  <p className={ui.help}>
                    {agent.invite_sent_at
                      ? `Last link made ${dayTime(agent.invite_sent_at, tz)}; it works until ${day(agent.invite_expires_at, tz)}.`
                      : "No link has been made for this agent yet."}{" "}
                    Making a new link stops the old one from working.
                  </p>
                  <NewLinkForm action={reissueInvite} agentId={agent.id} agentName={agent.full_name} label="Send a new onboarding link" />
                  <Placeholder service="Email (Resend)">
                    The link will be emailed to the agent automatically once the email service is connected. For now, copy
                    it and send it by hand.
                  </Placeholder>
                </div>
              ) : (
                <Empty>{agent.status === "exited" ? "This agent has left the brokerage." : "This agent has finished onboarding, so no link is needed."}</Empty>
              )}
            </Card>
          )}
        </div>
      )}

      {can("audit.view") && (
        <Card title="Audit trail">
          {audit.length ? (
            <ul className={ui.list}>
              {audit.map((entry) => (
                <li key={entry.id}>
                  <span className={ui.strong}>{auditText(entry)}</span>
                  <br />
                  <span className={ui.soft}>
                    {entry.actor_label ?? "System"} · <time dateTime={entry.at}>{dayTime(entry.at, tz)}</time>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing recorded for this agent yet.</Empty>
          )}
        </Card>
      )}
    </div>
  );
}

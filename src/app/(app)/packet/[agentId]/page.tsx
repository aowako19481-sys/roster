import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, ButtonLink, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { dayTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { markOutsideStep } from "../actions";

export const metadata: Metadata = { title: "Agent paperwork" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND_LABEL: Record<string, string> = { sign: "Sign", acknowledge: "Acknowledge", upload: "Upload", outside: "Outside the app", bank: "Direct deposit" };

export default async function AgentPacketPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  if (!UUID.test(agentId)) notFound();
  const access = await requireCap("agents.view");
  const ws = access.workspace.id;
  const supabase = await createClient();

  const { data: agent } = await supabase.from("agents").select("id, full_name, office, status").eq("id", agentId).eq("workspace_id", ws).maybeSingle();
  if (!agent) notFound();

  const [{ data: items }, { data: doneRows }, { data: team }, { data: signatures }, { data: bank }] = await Promise.all([
    supabase.from("packet_items").select("id, title, kind, required, applies_to, active").eq("workspace_id", ws).eq("active", true).order("position").limit(200),
    supabase.from("agent_packet").select("item_id, signed_name, done_by, done_at").eq("workspace_id", ws).eq("agent_id", agentId).limit(500),
    supabase.from("team_members").select("team_id").eq("workspace_id", ws).eq("agent_id", agentId).limit(1),
    supabase.from("signatures").select("id, subject, title, method, signer_name, signed_at, ip_address").eq("workspace_id", ws).eq("agent_id", agentId).order("signed_at", { ascending: false }).limit(200),
    supabase.from("agent_bank").select("bank_name, account_type, last4, updated_at").eq("workspace_id", ws).eq("agent_id", agentId).maybeSingle(),
  ]);
  const onTeam = (team ?? []).length > 0;
  const mine = (items ?? []).filter((item) => item.applies_to === "everyone" || onTeam);
  const doneOf = new Map((doneRows ?? []).map((row) => [row.item_id as string, row]));
  const canTick = access.caps.has("agents.edit");

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Onboarding packet" title={agent.full_name} sub={`${agent.office} · what this agent has completed, and what is still to do.`}>
        <ButtonLink href="/packet">All paperwork</ButtonLink>
        <ButtonLink href={`/agents/${agent.id}`}>Agent card</ButtonLink>
      </PageHeader>
      <Card title="Paperwork">
        {mine.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Type</th>
                  <th scope="col">Required</th>
                  <th scope="col">Status</th>
                  <th scope="col">Completed</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mine.map((item) => {
                  const row = doneOf.get(item.id);
                  return (
                    <tr key={item.id}>
                      <td className={ui.strong}>{item.title}</td>
                      <td>{KIND_LABEL[item.kind] ?? item.kind}</td>
                      <td>{item.required ? "Required" : "Optional"}</td>
                      <td>
                        <Badge tone={row ? "ok" : "plain"}>{row ? "Done" : "To do"}</Badge>
                      </td>
                      <td className={ui.soft}>
                        {row
                          ? `${dayTime(row.done_at as string, access.workspace.timezone)} · ${row.signed_name ? `signed as ${row.signed_name}` : row.done_by === "agent" ? "by the agent" : `by ${row.done_by}`}`
                          : "–"}
                      </td>
                      <td>
                        {item.kind === "outside" && canTick && (
                          <ActionForm action={markOutsideStep} className={ui.inline}>
                            <input type="hidden" name="agent" value={agent.id} />
                            <input type="hidden" name="item" value={item.id} />
                            <input type="hidden" name="done" value={row ? "false" : "true"} />
                            <Submit small variant="plain">
                              {row ? "Mark not done" : "Mark done"}
                            </Submit>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>The packet is empty.</Empty>
        )}
        <p className={ui.help}>
          Signing, acknowledging and uploading can only be done by the agent, through their private link. Staff can
          tick steps that happen outside the app.
        </p>
      </Card>

      <Card title="Signature records" aside={<span className={ui.soft}>Cannot be changed after signing</span>}>
        {signatures?.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">How</th>
                  <th scope="col">Signed as</th>
                  <th scope="col">When</th>
                  <th scope="col">From</th>
                  <th scope="col">
                    <span className="sr-only">Download</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {signatures.map((record) => (
                  <tr key={record.id}>
                    <td className={ui.strong}>{record.title}</td>
                    <td>{record.method === "acknowledgement" ? "Acknowledged" : "E-signature"}</td>
                    <td>{record.signer_name}</td>
                    <td>{dayTime(record.signed_at as string, access.workspace.timezone)}</td>
                    <td className={ui.mono}>{record.ip_address ?? "–"}</td>
                    <td>
                      <a className={ui.rowLink} href={`/packet/${agent.id}/signed/${record.id}`}>
                        Signed record<span className="sr-only"> for {record.title}</span> (PDF)
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing signed yet.</Empty>
        )}
        <p className={ui.help}>
          Each record keeps the exact wording, the agent&apos;s agreement to sign electronically, the time, where it was
          signed from, and a fingerprint of the document.
        </p>
      </Card>

      <Card title="Direct deposit">
        {bank ? (
          <dl className={ui.kv}>
            <dt>Bank</dt>
            <dd>{bank.bank_name}</dd>
            <dt>Account</dt>
            <dd>
              {bank.account_type === "savings" ? "Savings" : "Checking"} ending {bank.last4}
            </dd>
            <dt>Authorised</dt>
            <dd>{dayTime(bank.updated_at as string, access.workspace.timezone)}</dd>
          </dl>
        ) : (
          <Empty>No direct deposit authorisation on file.</Empty>
        )}
        <p className={ui.help}>
          Full account and routing numbers are never kept here. Take them through your bank or payroll provider.
        </p>
      </Card>
    </div>
  );
}

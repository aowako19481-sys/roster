import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, Empty, PageHeader, Placeholder, Stat, ui, type Tone } from "@/components/ui";
import { requireAddon } from "@/lib/access";
import { day, money, moneyWhole, titleCase } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { markExited } from "./actions";
import styles from "../settings/settings.module.css";

export const metadata: Metadata = { title: "Exit Kit" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_STATUSES = ["open", "held", "cleared"];

type Props = { searchParams: Promise<{ agent?: string | string[] }> };

type AgentRow = {
  id: string; full_name: string; office: string | null; status: string; exited_on: string | null; joined_on: string | null;
  licence_status: string; licence_expires_on: string | null; w9_status: string; rider_status: string; gci_ytd?: number | string;
};

type Step = { label: string; state: "Done" | "To do" | "Not connected" | "Not available"; detail: string };
const STEP_TONE: Record<Step["state"], Tone> = { Done: "ok", "To do": "warn", "Not connected": "muted", "Not available": "muted" };

const LICENCE_WORDS: Record<string, string> = {
  verified: "Verified", mismatch: "Flagged: mismatch", expiring: "Expiring", not_uploaded: "Not uploaded", submitted: "Waiting for confirmation",
};

export default async function ExitKitPage({ searchParams }: Props) {
  const access = await requireAddon("retention", "agents.view");
  const ws = access.workspace;
  const seeDeals = ws.hasFinance && access.caps.has("deals.view");
  const seeCommission = access.caps.has("splits.view");
  const seeFiles = access.caps.has("files.view");
  const canExit = access.caps.has("agents.edit") && !access.viewAs;
  const { agent: wanted } = await searchParams;
  const agentId = typeof wanted === "string" && UUID.test(wanted) ? wanted : null;

  const supabase = await createClient();
  const columns = "id, full_name, office, status, exited_on, joined_on, licence_status, licence_expires_on, w9_status, rider_status"
    + (seeCommission ? ", gci_ytd" : "");
  const { data: agentRows } = await supabase.from("agents").select(columns)
    .eq("workspace_id", ws.id).order("full_name").limit(5000);
  const agents = (agentRows ?? []) as unknown as AgentRow[];
  const agent = agentId ? agents.find((row) => row.id === agentId) ?? null : null;
  const exited = agents.filter((row) => row.status === "exited")
    .sort((a, b) => (b.exited_on ?? "").localeCompare(a.exited_on ?? ""));
  const year = new Date().getFullYear();
  const exitedThisYear = exited.filter((row) => (row.exited_on ?? "").startsWith(String(year)));
  const lost = exitedThisYear.reduce((sum, row) => sum + Number(row.gci_ytd ?? 0), 0);

  // Everything below is about the chosen agent only.
  let openDeals: { id: string; address: string; deal_type: string; status: string; gci: number | string }[] = [];
  let inPayroll = 0;
  let files: { id: string; kind: string; filename: string; status: string }[] = [];
  if (agent) {
    if (seeDeals) {
      const { data: lines } = await supabase.from("deal_agents").select("deal_id")
        .eq("workspace_id", ws.id).eq("agent_id", agent.id).limit(1000);
      const ids = [...new Set((lines ?? []).map((line) => line.deal_id as string))];
      for (let at = 0; at < ids.length; at += 100) {
        const { data: deals } = await supabase.from("deals").select("id, address, deal_type, status, gci")
          .eq("workspace_id", ws.id).in("id", ids.slice(at, at + 100)).in("status", [...OPEN_STATUSES, "processed"]);
        for (const deal of deals ?? []) {
          if (deal.status === "processed") inPayroll += 1;
          else openDeals.push(deal);
        }
      }
      openDeals = openDeals.sort((a, b) => a.address.localeCompare(b.address));
    }
    if (seeFiles) {
      const { data } = await supabase.from("documents").select("id, kind, filename, status")
        .eq("workspace_id", ws.id).eq("agent_id", agent.id).order("created_at", { ascending: false }).limit(50);
      files = data ?? [];
    }
  }

  const steps: Step[] = [];
  if (agent) {
    steps.push(seeDeals
      ? {
          label: "Reassign or protect open deals",
          state: openDeals.length ? "To do" : "Done",
          detail: openDeals.length
            ? `${openDeals.length === 1 ? "1 open deal names" : `${openDeals.length} open deals name`} this agent. Decide who takes each one, or keep it with the departing agent.`
            : "No open deals name this agent.",
        }
      : { label: "Reassign or protect open deals", state: "Not available", detail: "Deals are not part of your role or this brokerage's plan. Ask Finance to check." });
    steps.push(seeDeals
      ? {
          label: "Final payout task for Finance",
          state: inPayroll || openDeals.length ? "To do" : "Done",
          detail: inPayroll
            ? `${inPayroll === 1 ? "1 deal is" : `${inPayroll} deals are`} in a payroll that has not closed yet. Finance confirms the final payout once it closes.`
            : openDeals.length
              ? "Finance confirms the final payout after the open deals above are settled."
              : "Nothing is waiting to be paid to this agent.",
        }
      : { label: "Final payout task for Finance", state: "Not available", detail: "Finance confirms whether anything is still owed to this agent." });
    steps.push({
      label: "Licence",
      state: agent.licence_status === "verified" ? "Done" : "To do",
      detail: `${LICENCE_WORDS[agent.licence_status] ?? titleCase(agent.licence_status)}${agent.licence_expires_on ? ` · expires ${day(agent.licence_expires_on, ws.timezone)}` : ""}. Release or transfer the licence with the state once the agent has left.`,
    });
    steps.push({
      label: "W-9 and rider on file",
      state: agent.w9_status === "received" && agent.rider_status === "signed" ? "Done" : "To do",
      detail: `W-9: ${titleCase(agent.w9_status)} · Rider: ${titleCase(agent.rider_status)}. Both are needed for the year-end 1099, even after the agent has gone.`,
    });
    steps.push({ label: "Exit survey", state: "Not connected", detail: "Sent to the agent once the survey is connected." });
    steps.push({ label: "Add to the win-back list", state: "Not connected", detail: "Kept for a later check-in once the list has somewhere to live." });
    steps.push({
      label: "Mark as exited",
      state: agent.status === "exited" ? "Done" : "To do",
      detail: agent.status === "exited" ? `Marked as exited on ${day(agent.exited_on, ws.timezone)}.` : "The last step, once everything above is in hand.",
    });
  }
  const doneCount = steps.filter((step) => step.state === "Done").length;

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Add-on · Exit Kit"
        title="Clean exits"
        sub="When an agent leaves: what is still open, what Finance still owes, and what has to stay on file."
      >
        <Link href="/retention" className={ui.btn}>See who is at risk now</Link>
      </PageHeader>

      <Card title="Choose an agent">
        {agents.length ? (
          <form method="get" action="/exit-kit" className={ui.inline}>
            <label className={ui.field}>
              Agent
              <select className={ui.select} name="agent" defaultValue={agent?.id ?? ""} required>
                <option value="" disabled>Choose an agent</option>
                {agents.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.full_name}{row.office ? ` · ${row.office}` : ""}{row.status === "exited" ? " · exited" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={ui.btnPrimary}>Show exit checklist</button>
          </form>
        ) : (
          <Empty>There are no agents on file yet.</Empty>
        )}
      </Card>

      {agentId && !agent && (
        <Card title="Agent not found">
          <Empty>That agent is not on file in this brokerage, or is outside the office you can see.</Empty>
        </Card>
      )}

      {agent && (
        <>
          <section className={`${ui.card} ${ui.pad} ${ui.grid4}`} aria-label={`Summary for ${agent.full_name}`}>
            <Stat label="Agent" value={agent.full_name} note={agent.office ?? "No office"} />
            <Stat label="Status" value={<Badge tone={agent.status === "exited" ? "muted" : agent.status === "flagged" ? "bad" : "plain"}>{titleCase(agent.status)}</Badge>} note={agent.exited_on ? `left ${day(agent.exited_on, ws.timezone)}` : agent.joined_on ? `joined ${day(agent.joined_on, ws.timezone)}` : undefined} />
            <Stat label="Checklist" value={`${doneCount}/${steps.length}`} note="steps done" />
            {seeCommission
              ? <Stat label="Commission this year" value={moneyWhole(agent.gci_ytd)} note="from closed deals" />
              : <Stat label="Commission this year" value="–" note="not shown for your role" />}
          </section>

          <Card title={`Exit checklist for ${agent.full_name}`}>
            <ol className={ui.list}>
              {steps.map((step) => (
                <li key={step.label}>
                  <div className={ui.inline}>
                    <Badge tone={STEP_TONE[step.state]}>{step.state}</Badge>
                    <span className={ui.strong}>{step.label}</span>
                  </div>
                  <span className={ui.soft}>{step.detail}</span>
                </li>
              ))}
            </ol>
          </Card>

          <div className={ui.grid2}>
            <Card title="Open deals to protect" aside={seeDeals ? <span className={ui.soft}>{openDeals.length} open</span> : undefined}>
              {!seeDeals ? (
                <Empty>Deals are not part of your role or this brokerage’s plan, so they are not listed here.</Empty>
              ) : openDeals.length ? (
                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <thead>
                      <tr>
                        <th scope="col">Deal</th>
                        <th scope="col">Type</th>
                        <th scope="col">Status</th>
                        <th scope="col" className={ui.num}>GCI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openDeals.map((deal) => (
                        <tr key={deal.id}>
                          <th scope="row" className={styles.rowHead}><Link href={`/deals/${deal.id}`} className={ui.rowLink}>{deal.address}</Link></th>
                          <td>{titleCase(deal.deal_type)}</td>
                          <td><Badge tone={deal.status === "held" ? "warn" : "plain"}>{titleCase(deal.status)}</Badge></td>
                          <td className={ui.num}>{money(deal.gci)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>No open deals name this agent.</Empty>
              )}
              {seeDeals && (
                <p className={ui.help}>
                  To reassign a deal, open it and change the agent on it; the rider check runs again for the new agent. To keep it
                  with the departing agent, leave it as it is and it pays out as normal.
                </p>
              )}
            </Card>

            <Card title="Licence and documents">
              <dl className={ui.kv}>
                <dt>Licence</dt>
                <dd>{LICENCE_WORDS[agent.licence_status] ?? titleCase(agent.licence_status)}{agent.licence_expires_on ? ` · expires ${day(agent.licence_expires_on, ws.timezone)}` : ""}</dd>
                <dt>W-9</dt>
                <dd>{titleCase(agent.w9_status)}</dd>
                <dt>Rider</dt>
                <dd>{titleCase(agent.rider_status)}</dd>
                <dt>Files</dt>
                <dd>{seeFiles ? (files.length === 1 ? "1 on file" : `${files.length} on file`) : "Not shown for your role"}</dd>
              </dl>
              {seeFiles && files.length > 0 && (
                <ul className={ui.list}>
                  {files.slice(0, 8).map((file) => (
                    <li key={file.id}>
                      {file.filename} <span className={ui.soft}>· {titleCase(file.kind)} · {titleCase(file.status)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className={ui.help}>Files stay on record after an agent leaves. Nothing is deleted by marking an exit.</p>
            </Card>
          </div>

          <div className={ui.grid2}>
            <Card title="Exit survey">
              <Placeholder service="Exit survey">
                An optional short survey will be sent to the departing agent, and the reasons agents give will be summarised
                here. It needs email and somewhere to keep the answers, which are not connected yet.
              </Placeholder>
            </Card>
            <Card title="Mark as exited">
              {agent.status === "exited" ? (
                <p className={ui.help}>
                  {agent.full_name} was marked as exited on {day(agent.exited_on, ws.timezone)}. Their private onboarding link no
                  longer works.
                </p>
              ) : canExit ? (
                <ActionForm action={markExited}>
                  <input type="hidden" name="agent" value={agent.id} />
                  <p className={ui.help}>
                    This sets {agent.full_name} to “Exited” with today’s date and switches off their onboarding link. It does not
                    change their deals, payouts or files, and it is written to the audit log.
                  </p>
                  <div>
                    <Submit variant="danger">Mark {agent.full_name} as exited</Submit>
                  </div>
                </ActionForm>
              ) : (
                <Empty>Only people who may edit agents can mark an exit.</Empty>
              )}
            </Card>
          </div>
        </>
      )}

      <div className={ui.grid2}>
        <Card title={`Left in ${year}`} aside={<span className={ui.soft}>{exitedThisYear.length === 1 ? "1 departure" : `${exitedThisYear.length} departures`}</span>}>
          {seeCommission && (
            <Stat label="Commission that left this year" value={moneyWhole(lost)} note="closed commission this year of agents who have left" />
          )}
          {exited.length ? (
            <ul className={ui.list}>
              {exited.slice(0, 20).map((row) => (
                <li key={row.id}>
                  <Link href={`/exit-kit?agent=${row.id}`} className={ui.rowLink}>{row.full_name}</Link>{" "}
                  <span className={ui.soft}>· {row.office ?? "No office"} · left {day(row.exited_on, ws.timezone)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No agent has been marked as exited.</Empty>
          )}
        </Card>
        <Card title="Win-back list">
          <Placeholder service="Win-back list">
            Agents worth a call a few months after leaving, with a reminder date and the reason they gave. It needs its own
            storage and the exit survey, which come later. The list of people who have left is on this page in the meantime.
          </Placeholder>
        </Card>
      </div>
    </div>
  );
}

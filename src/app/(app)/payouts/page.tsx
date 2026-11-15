import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Placeholder, Stat, ui } from "@/components/ui";
import { requireAddon } from "@/lib/access";
import {
  checkLabel, checkTone, dealStatusLabel, dealStatusTone, failsCheck, groupBy, inBatches, overrideReasonLabel,
} from "@/lib/finance";
import { dayTime, money, pct } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payout checks" };

type Deal = { id: string; address: string; status: string; payroll_id: string | null };
type Line = {
  id: string; deal_id: string; agent_id: string; basis: string; share_pct: number; split_pct: number; rider_pct: number | null;
  check_status: string; check_reason: string | null; override_reason: string | null; override_note: string | null; payout: number;
};
type Fee = { deal_id: string; payee: string; amount: number };
type Audit = { entity_id: string | null; actor_label: string | null; at: string };

const LINE_COLUMNS = "id, deal_id, agent_id, basis, share_pct, split_pct, rider_pct, check_status, check_reason, override_reason, override_note, payout";
const RANK: Record<string, number> = { incorrect: 0, needs_approval: 1, overridden: 2, skipped: 3, correct: 4 };

export default async function PayoutChecksPage() {
  const access = await requireAddon("finance_shield", "payouts.view");
  const ws = access.workspace.id;
  const tz = access.workspace.timezone;
  const supabase = await createClient();

  // Everything that has not been paid and closed yet.
  const [{ data: dealRows }, { data: overriddenRows }, { data: aboveRows }, { data: feeRows }] = await Promise.all([
    supabase.from("deals").select("id, address, status, payroll_id").eq("workspace_id", ws).neq("status", "closed").order("address").limit(1000),
    supabase.from("deal_agents").select(LINE_COLUMNS).eq("workspace_id", ws).eq("check_status", "overridden").limit(500),
    supabase.from("deal_agents").select(LINE_COLUMNS).eq("workspace_id", ws).not("rider_pct", "is", null).limit(5000),
    supabase.from("deal_fees").select("deal_id, payee, amount").eq("workspace_id", ws).eq("kind", "referral").limit(5000),
  ]);
  const liveDeals = (dealRows ?? []) as Deal[];
  const overridden = (overriddenRows ?? []) as Line[];
  const above = ((aboveRows ?? []) as Line[]).filter((line) => line.rider_pct !== null && Number(line.split_pct) > Number(line.rider_pct));
  const referrals = (feeRows ?? []) as Fee[];

  const liveLines = await inBatches<Line>(liveDeals.map((deal) => deal.id), (batch) =>
    supabase.from("deal_agents").select(LINE_COLUMNS).eq("workspace_id", ws).in("deal_id", batch));

  const otherDealIds = [...overridden, ...above].map((line) => line.deal_id).concat(referrals.map((fee) => fee.deal_id));
  const liveIds = new Set(liveDeals.map((deal) => deal.id));
  const otherDeals = await inBatches<Deal>(otherDealIds.filter((id) => !liveIds.has(id)), (batch) =>
    supabase.from("deals").select("id, address, status, payroll_id").eq("workspace_id", ws).in("id", batch));
  const dealById = new Map([...liveDeals, ...otherDeals].map((deal) => [deal.id, deal]));

  const agents = await inBatches<{ id: string; full_name: string }>([...liveLines, ...overridden, ...above].map((line) => line.agent_id), (batch) =>
    supabase.from("agents").select("id, full_name").eq("workspace_id", ws).in("id", batch));
  const agentName = new Map(agents.map((agent) => [agent.id, agent.full_name]));
  const nameOf = (id: string) => agentName.get(id) ?? "Agent in another office";

  // Who overrode, and when, comes from the audit log (only for people allowed to read it).
  const overrideLog = new Map<string, Audit>();
  if (access.caps.has("audit.view") && overridden.length) {
    const rows = await inBatches<Audit>(overridden.map((line) => line.id), (batch) =>
      supabase.from("audit_log").select("entity_id, actor_label, at").eq("workspace_id", ws).eq("entity", "deal_agents").eq("action", "override")
        .in("entity_id", batch).order("at", { ascending: false }));
    for (const row of rows) {
      const seen = row.entity_id ? overrideLog.get(row.entity_id) : null;
      if (row.entity_id && (!seen || row.at > seen.at)) overrideLog.set(row.entity_id, row);
    }
  }

  const sorted = [...liveLines].sort((a, b) =>
    (RANK[a.check_status] ?? 9) - (RANK[b.check_status] ?? 9)
    || (dealById.get(a.deal_id)?.address ?? "").localeCompare(dealById.get(b.deal_id)?.address ?? ""));
  const mismatched = sorted.filter((line) => failsCheck(line.check_status));
  const count = (status: string) => liveLines.filter((line) => line.check_status === status).length;

  // Pattern watch, straight from the data.
  const payeeGroups = [...groupBy(referrals, (fee) => fee.payee.trim().toLowerCase().replace(/\s+/g, " ")).values()]
    .filter((group) => new Set(group.map((fee) => fee.deal_id)).size > 1)
    .sort((a, b) => b.length - a.length);
  const aboveGroups = [...groupBy(above, (line) => line.agent_id).values()].filter((group) => group.length > 1).sort((a, b) => b.length - a.length);

  const dealLink = (id: string) => {
    const deal = dealById.get(id);
    return deal ? <Link href={`/deals/${id}`} className={ui.rowLink}>{deal.address}</Link> : <span className={ui.soft}>A deal you cannot see</span>;
  };

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Finance Shield · add-on"
        title="Payout checks"
        sub="Every payout that has not been paid yet, compared against the signed rider before payroll is released."
      />

      <div className={ui.grid4}>
        <Card><Stat label="Match the rider" value={count("correct")} note="Lines on unpaid deals" /></Card>
        <Card><Stat label="Do not match" value={mismatched.length} note={mismatched.length ? "Blocked from payroll until resolved" : "Nothing is blocked"} /></Card>
        <Card><Stat label="Overridden" value={count("overridden")} note="Signed off with a reason" /></Card>
        <Card><Stat label="Not checked" value={count("skipped")} note="Pass-through and referral deals" /></Card>
      </div>

      <Card title="Do not match the rider" aside={<Badge tone={mismatched.length ? "bad" : "ok"}>{mismatched.length ? `${mismatched.length} held back` : "All clear"}</Badge>}>
        {mismatched.length ? (
          <ul className={ui.list}>
            {mismatched.map((line) => (
              <li key={line.id} className={ui.inline} style={{ alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p className={ui.strong}>{dealLink(line.deal_id)} · {nameOf(line.agent_id)}</p>
                  <p>{line.check_reason ?? "The split does not match the rider."}</p>
                  <p className={ui.soft}>
                    Entered {pct(line.split_pct)} · {line.rider_pct === null ? "no signed rider" : `rider ${pct(line.rider_pct)}`} · payout as entered {money(line.payout)}
                  </p>
                </div>
                <div className={ui.inline} style={{ alignItems: "center" }}>
                  <Badge tone={checkTone(line.check_status)}>{checkLabel(line.check_status)}</Badge>
                  <Link href={`/deals/${line.deal_id}`} className={`${ui.btn} ${ui.small}`}>Resolve on the deal sheet</Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Every payout on an unpaid deal matches its rider, has been overridden with a reason, or is on a deal type that is not checked.</Empty>
        )}
      </Card>

      <Card title="Every unpaid payout" aside={<span className={ui.soft}>{sorted.length} {sorted.length === 1 ? "line" : "lines"}</span>}>
        {sorted.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Deal</th>
                  <th scope="col">Deal status</th>
                  <th scope="col">Agent</th>
                  <th scope="col" className={ui.num}>Rider</th>
                  <th scope="col" className={ui.num}>Entered</th>
                  <th scope="col" className={ui.num}>Payout</th>
                  <th scope="col">Check</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((line) => {
                  const deal = dealById.get(line.deal_id);
                  return (
                    <tr key={line.id}>
                      <td>{dealLink(line.deal_id)}</td>
                      <td>{deal ? <Badge tone={dealStatusTone(deal.status)}>{dealStatusLabel(deal.status)}</Badge> : "–"}</td>
                      <td>{nameOf(line.agent_id)}{line.basis === "team" ? <span className={ui.soft}> · team</span> : null}</td>
                      <td className={ui.num}>{line.rider_pct === null ? "None" : pct(line.rider_pct)}</td>
                      <td className={ui.num}>{pct(line.split_pct)}</td>
                      <td className={`${ui.num} ${ui.strong}`}>{money(line.payout)}</td>
                      <td><Badge tone={checkTone(line.check_status)}>{line.check_status === "correct" ? "Matches rider" : checkLabel(line.check_status)}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>There are no unpaid deals.</Empty>
        )}
      </Card>

      <Card title="Overrides" aside={<span className={ui.soft}>{overridden.length} on file, paid and unpaid</span>}>
        {overridden.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Deal</th>
                  <th scope="col">Agent</th>
                  <th scope="col" className={ui.num}>Kept</th>
                  <th scope="col" className={ui.num}>Rider</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Note</th>
                  <th scope="col">Signed off</th>
                </tr>
              </thead>
              <tbody>
                {overridden.map((line) => {
                  const log = overrideLog.get(line.id);
                  return (
                    <tr key={line.id}>
                      <td>{dealLink(line.deal_id)}</td>
                      <td>{nameOf(line.agent_id)}</td>
                      <td className={ui.num}>{pct(line.split_pct)}</td>
                      <td className={ui.num}>{line.rider_pct === null ? "None" : pct(line.rider_pct)}</td>
                      <td>{overrideReasonLabel(line.override_reason)}</td>
                      <td>{line.override_note ?? "–"}</td>
                      <td>
                        {log ? (
                          <>{log.actor_label ?? "Unknown"}<div className={ui.soft}>{dayTime(log.at, tz)}</div></>
                        ) : (
                          <span className={ui.soft}>{line.check_reason ?? "–"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No override has been used.</Empty>
        )}
      </Card>

      <Card title="Pattern watch">
        <p className={ui.help} style={{ marginBottom: 12 }}>
          Simple counts from this brokerage&rsquo;s own deals. A pattern is a reason to look, not a finding.
        </p>
        <div className={ui.grid2}>
          <section aria-labelledby="watch-referral">
            <h3 id="watch-referral" className={ui.h2}>The same referral payee, more than once</h3>
            {payeeGroups.length ? (
              <ul className={ui.list}>
                {payeeGroups.slice(0, 20).map((group) => (
                  <li key={group[0]?.payee}>
                    <p className={ui.strong}>{group[0]?.payee}</p>
                    <p className={ui.soft}>
                      {group.length} referral fees on {new Set(group.map((fee) => fee.deal_id)).size} deals, {money(group.reduce((sum, fee) => sum + Number(fee.amount), 0))} in all
                    </p>
                    <p>{[...new Set(group.map((fee) => fee.deal_id))].slice(0, 6).map((id, i) => <span key={id}>{i > 0 ? ", " : ""}{dealLink(id)}</span>)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No referral payee appears on more than one deal.</Empty>
            )}
          </section>
          <section aria-labelledby="watch-above">
            <h3 id="watch-above" className={ui.h2}>Entered above the rider, more than once</h3>
            {aboveGroups.length ? (
              <ul className={ui.list}>
                {aboveGroups.slice(0, 20).map((group) => (
                  <li key={group[0]?.agent_id}>
                    <p className={ui.strong}>{nameOf(group[0]?.agent_id ?? "")}</p>
                    <p className={ui.soft}>{group.length} lines entered above the signed rider</p>
                    <p>
                      {group.slice(0, 6).map((line, i) => (
                        <span key={line.id}>{i > 0 ? ", " : ""}{dealLink(line.deal_id)} ({pct(line.split_pct)} against {pct(line.rider_pct)}, {checkLabel(line.check_status).toLowerCase()})</span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No agent has been entered above their rider more than once.</Empty>
            )}
          </section>
        </div>
      </Card>

      <Card title="Dispute file">
        <div className={ui.form}>
          <p>
            When an agent says they were underpaid, the dispute file is a proper statement of everything that decided the payout, in order: the
            calculation, the rider clause applied, a dated timeline and every approval and override.
          </p>
          <Placeholder service="Document templates">
            The dispute file will be produced on the brokerage&rsquo;s letterhead with a case number once document templates are connected. Until
            then, each deal sheet shows the same facts: the calculation, the rider check and the audit trail.
          </Placeholder>
          <div><button type="button" className={ui.btn} disabled>Create a dispute file</button></div>
        </div>
      </Card>
    </div>
  );
}

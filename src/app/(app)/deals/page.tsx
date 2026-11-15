import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, Empty, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import {
  DEAL_STATUSES, DEAL_STATUS_VALUES, checkSummary, dealStatusLabel, dealStatusTone, dealTypeLabel, groupBy, inBatches,
  searchPattern, waitingLabel,
} from "@/lib/finance";
import { day, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deals" };

type Props = { searchParams: Promise<{ q?: string | string[]; status?: string | string[] }> };

type Deal = {
  id: string; address: string; deal_type: string; gci: number; deposit_date: string | null;
  status: string; waiting_on: string; pp_number: string | null;
};
type Line = { deal_id: string; agent_id: string; check_status: string };

const COLUMNS = "id, address, deal_type, gci, deposit_date, status, waiting_on, pp_number";
const LIMIT = 200;

export default async function DealsPage({ searchParams }: Props) {
  const access = await requireCap("deals.view");
  const ws = access.workspace.id;
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 80);
  const status = typeof params.status === "string" && DEAL_STATUS_VALUES.includes(params.status) ? params.status : "";
  const pattern = q ? searchPattern(q) : null;
  const supabase = await createClient();

  let deals: Deal[] = [];
  if (q && !pattern) {
    deals = [];
  } else if (pattern) {
    // Lookup bar: address or PP number, plus any deal an agent of that name is on.
    let direct = supabase.from("deals").select(COLUMNS).eq("workspace_id", ws)
      .or(`address.ilike.${pattern},pp_number.ilike.${pattern}`);
    if (status) direct = direct.eq("status", status);
    const [{ data: byText }, { data: namedAgents }] = await Promise.all([
      direct.order("deposit_date", { ascending: false, nullsFirst: false }).limit(LIMIT),
      supabase.from("agents").select("id").eq("workspace_id", ws).ilike("full_name", pattern).limit(50),
    ]);
    const found = new Map<string, Deal>(((byText ?? []) as Deal[]).map((deal) => [deal.id, deal]));
    const agentIds = ((namedAgents ?? []) as { id: string }[]).map((agent) => agent.id);
    if (agentIds.length) {
      const { data: theirLines } = await supabase.from("deal_agents").select("deal_id").eq("workspace_id", ws).in("agent_id", agentIds).limit(1000);
      const dealIds = ((theirLines ?? []) as { deal_id: string }[]).map((line) => line.deal_id).filter((id) => !found.has(id));
      const more = await inBatches<Deal>(dealIds, (batch) => {
        let query = supabase.from("deals").select(COLUMNS).eq("workspace_id", ws).in("id", batch);
        if (status) query = query.eq("status", status);
        return query;
      });
      for (const deal of more) found.set(deal.id, deal);
    }
    deals = [...found.values()]
      .sort((a, b) => (b.deposit_date ?? "").localeCompare(a.deposit_date ?? "") || a.address.localeCompare(b.address))
      .slice(0, LIMIT);
  } else {
    let query = supabase.from("deals").select(COLUMNS).eq("workspace_id", ws);
    if (status) query = query.eq("status", status);
    const { data } = await query.order("deposit_date", { ascending: false, nullsFirst: false }).order("address").limit(LIMIT);
    deals = (data ?? []) as Deal[];
  }

  const lines = await inBatches<Line>(deals.map((deal) => deal.id), (batch) =>
    supabase.from("deal_agents").select("deal_id, agent_id, check_status").eq("workspace_id", ws).in("deal_id", batch));
  const agents = await inBatches<{ id: string; full_name: string }>(lines.map((line) => line.agent_id), (batch) =>
    supabase.from("agents").select("id, full_name").eq("workspace_id", ws).in("id", batch));
  const agentName = new Map(agents.map((agent) => [agent.id, agent.full_name]));
  const linesByDeal = groupBy(lines, (line) => line.deal_id);

  const filtered = Boolean(q || status);

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Finance" title="Deals" sub="Every deal sheet, with the rider check the database made when it was saved.">
        {access.caps.has("deals.edit") && <ButtonLink href="/deals/new" primary>New deal</ButtonLink>}
      </PageHeader>

      <Card title="Lookup">
        <form method="get" action="/deals" role="search" className={ui.inline}>
          <label className={ui.field} style={{ flex: "1 1 280px" }}>
            Address, agent or PP number
            <input className={ui.input} type="search" name="q" defaultValue={q} maxLength={80} placeholder="For example 245 Elm, Maya or PP-70311" />
          </label>
          <label className={ui.field}>
            Status
            <select className={ui.select} name="status" defaultValue={status}>
              <option value="">Any status</option>
              {DEAL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <button type="submit" className={ui.btn}>Search</button>
          {filtered && <Link href="/deals" className={ui.linkBtn}>Clear</Link>}
        </form>
      </Card>

      <Card
        title={filtered ? "Matching deals" : "All deals"}
        aside={<span className={ui.soft} role="status">{deals.length === LIMIT ? `First ${LIMIT} shown` : `${deals.length} ${deals.length === 1 ? "deal" : "deals"}`}</span>}
      >
        {deals.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Address</th>
                  <th scope="col">Type</th>
                  <th scope="col" className={ui.num}>GCI</th>
                  <th scope="col">Deposit date</th>
                  <th scope="col">Agents</th>
                  <th scope="col">Rider check</th>
                  <th scope="col">Status</th>
                  <th scope="col">Waiting on</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => {
                  const dealLines = linesByDeal.get(deal.id) ?? [];
                  const check = checkSummary(dealLines);
                  return (
                    <tr key={deal.id}>
                      <td>
                        <Link href={`/deals/${deal.id}`} className={ui.rowLink}>{deal.address}</Link>
                        {deal.pp_number && <div className={`${ui.soft} ${ui.mono}`}>{deal.pp_number}</div>}
                      </td>
                      <td>{dealTypeLabel(deal.deal_type)}</td>
                      <td className={ui.num}>{money(deal.gci)}</td>
                      <td>{day(deal.deposit_date)}</td>
                      <td>{dealLines.length ? dealLines.map((line) => agentName.get(line.agent_id) ?? "Agent in another office").join(", ") : <span className={ui.soft}>None</span>}</td>
                      <td><Badge tone={check.tone}>{check.label}</Badge></td>
                      <td><Badge tone={dealStatusTone(deal.status)}>{dealStatusLabel(deal.status)}</Badge></td>
                      <td>{waitingLabel(deal.waiting_on)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{filtered ? "No deals match that search." : "No deals yet."}</Empty>
        )}
      </Card>
    </div>
  );
}

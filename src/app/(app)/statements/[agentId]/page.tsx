import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink, PageHeader, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { dealStatusLabel, dealTypeLabel, inBatches } from "@/lib/finance";
import { day, money, moneyWhole, pct, todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { Listen } from "../Listen";
import styles from "../statement.module.css";

export const metadata: Metadata = { title: "Agent statement" };

type Props = { params: Promise<{ agentId: string }> };
type Agent = { id: string; full_name: string; office: string | null; gci_ytd: number };
type Line = { deal_id: string; share_pct: number; split_pct: number; payout: number };
type Deal = { id: string; address: string; deal_type: string; status: string; deposit_date: string | null };
type Tier = { from: number; pct: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STAGE: Record<string, string> = {
  open: "Being prepared by finance",
  held: "On hold",
  cleared: "Ready for the next payroll",
  processed: "In payroll now",
};

function readTiers(value: unknown): Tier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tier) => ({ from: Number((tier as { from?: unknown })?.from), pct: Number((tier as { pct?: unknown })?.pct) }))
    .filter((tier) => Number.isFinite(tier.from) && Number.isFinite(tier.pct))
    .sort((a, b) => a.from - b.from);
}

export default async function StatementPage({ params }: Props) {
  const access = await requireCap("statements.view");
  const ws = access.workspace.id;
  const { agentId } = await params;
  if (!UUID.test(agentId)) notFound();
  const supabase = await createClient();

  const { data: agentRow } = await supabase.from("agents").select("id, full_name, office, gci_ytd").eq("id", agentId).eq("workspace_id", ws).maybeSingle();
  if (!agentRow) notFound();
  const agent = agentRow as Agent;
  const first = agent.full_name.split(" ")[0];

  const [{ data: lineRows }, { data: riderRow }] = await Promise.all([
    supabase.from("deal_agents").select("deal_id, share_pct, split_pct, payout").eq("agent_id", agentId).eq("workspace_id", ws).limit(2000),
    supabase.from("riders").select("split_pct, tiers").eq("agent_id", agentId).eq("workspace_id", ws).eq("is_current", true).maybeSingle(),
  ]);
  const lines = (lineRows ?? []) as Line[];
  const deals = await inBatches<Deal>(lines.map((line) => line.deal_id), (batch) =>
    supabase.from("deals").select("id, address, deal_type, status, deposit_date").eq("workspace_id", ws).in("id", batch));
  const dealById = new Map(deals.map((deal) => [deal.id, deal]));
  const rows = lines
    .map((line) => ({ line, deal: dealById.get(line.deal_id) }))
    .filter((row): row is { line: Line; deal: Deal } => Boolean(row.deal))
    .sort((a, b) => (b.deal.deposit_date ?? "").localeCompare(a.deal.deposit_date ?? "") || a.deal.address.localeCompare(b.deal.address));
  const closed = rows.filter((row) => row.deal.status === "closed");
  const open = rows.filter((row) => row.deal.status !== "closed");
  const sum = (list: typeof rows) => list.reduce((total, row) => total + Number(row.line.payout), 0);
  const earned = sum(closed);
  const coming = sum(open);

  const rider = riderRow as { split_pct: number; tiers: unknown } | null;
  const tiers = readTiers(rider?.tiers);
  const ytd = Number(agent.gci_ytd);
  const nextTier = rider ? tiers.find((tier) => tier.pct > Number(rider.split_pct)) ?? null : null;
  const reached = nextTier ? ytd >= nextTier.from : false;
  const toGo = nextTier ? Math.max(nextTier.from - ytd, 0) : 0;

  const tierWords = !rider
    ? `There is no signed split agreement on file for ${first} yet.`
    : !nextTier
      ? `${first}'s split is ${pct(rider.split_pct)}. This is the highest tier in the agreement.`
      : reached
        ? `${first}'s split is ${pct(rider.split_pct)}. ${first} has passed ${moneyWhole(nextTier.from)} in closed commission this year, so the move to ${pct(nextTier.pct)} is waiting for approval.`
        : `${first}'s split is ${pct(rider.split_pct)}. At ${moneyWhole(nextTier.from)} in closed commission this year, it goes up to ${pct(nextTier.pct)}. So far: ${moneyWhole(ytd)}. Still to go: ${moneyWhole(toGo)}.`;

  const today = todayIso(access.workspace.timezone);
  const spoken = [
    `Statement for ${agent.full_name}, as of ${day(today)}.`,
    `Paid so far, from closed deals: ${money(earned)}.`,
    open.length ? `Still to come, from ${open.length} open ${open.length === 1 ? "deal" : "deals"}: ${money(coming)}. This can change until the deal is paid.` : "There are no open deals.",
    `Closed commission this year: ${money(ytd)}.`,
    tierWords,
    closed.length ? `Closed deals: ${closed.map((row) => `${row.deal.address}, paid ${money(row.line.payout)}`).join(". ")}.` : "No closed deals yet.",
    open.length ? `Open deals: ${open.map((row) => `${row.deal.address}, ${STAGE[row.deal.status] ?? dealStatusLabel(row.deal.status)}, expected ${money(row.line.payout)}`).join(". ")}.` : "",
  ].filter(Boolean).join(" ");

  const table = (list: typeof rows, amountHeading: string, showStage: boolean) => (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Address</th>
            <th scope="col">Type</th>
            <th scope="col">Deposit date</th>
            {showStage && <th scope="col">Where it is</th>}
            <th scope="col">Share and split</th>
            <th scope="col" className={styles.num}>{amountHeading}</th>
          </tr>
        </thead>
        <tbody>
          {list.map(({ line, deal }) => (
            <tr key={deal.id}>
              <th scope="row">{deal.address}</th>
              <td>{dealTypeLabel(deal.deal_type)}</td>
              <td>{day(deal.deposit_date)}</td>
              {showStage && <td>{STAGE[deal.status] ?? dealStatusLabel(deal.status)}</td>}
              <td>{pct(line.share_pct)} of the deal at {pct(line.split_pct)}</td>
              <td className={styles.num}><strong>{money(line.payout)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Agent statement" title={agent.full_name} sub={[agent.office, `As of ${day(today)}`].filter(Boolean).join(" · ")}>
        <Listen text={spoken} />
        <ButtonLink href="/statements">All agents</ButtonLink>
      </PageHeader>

      <article className={styles.sheet} aria-label={`Statement for ${agent.full_name}`}>
        <h2>Earnings to date</h2>
        <dl className={styles.figures}>
          <div>
            <dt>Paid so far (closed deals)</dt>
            <dd>{money(earned)}</dd>
          </div>
          <div>
            <dt>Still to come (open deals)</dt>
            <dd>{money(coming)}</dd>
          </div>
          <div>
            <dt>Closed commission this year</dt>
            <dd>{money(ytd)}</dd>
          </div>
        </dl>
        {open.length > 0 && <p style={{ marginTop: 12 }}>Amounts still to come can change until the deal has been paid.</p>}

        <h2>Tier progress</h2>
        <p>{tierWords}</p>
        {rider && nextTier && (
          <p>
            <progress
              className={styles.meter}
              max={nextTier.from > 0 ? nextTier.from : 1}
              value={Math.min(ytd, nextTier.from > 0 ? nextTier.from : 1)}
              aria-label={`Progress to the ${pct(nextTier.pct)} tier: ${moneyWhole(ytd)} of ${moneyWhole(nextTier.from)}`}
            />
          </p>
        )}

        <h2>Closed deals ({closed.length})</h2>
        {closed.length ? table(closed, "Paid", false) : <p>No closed deals yet.</p>}

        <h2>Open deals ({open.length})</h2>
        {open.length ? table(open, "Expected", true) : <p>No open deals right now.</p>}
      </article>
    </div>
  );
}

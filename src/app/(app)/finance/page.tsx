import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, Empty, PageHeader, Stat, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import {
  clock, dealStatusLabel, dealStatusTone, dealTypeLabel, failsCheck, groupBy, inBatches, upcomingPayDates, waitingLabel, weekDay,
} from "@/lib/finance";
import { day, money, todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Finance overview" };

type Deal = {
  id: string; address: string; deal_type: string; gci: number; deposit_date: string | null; status: string;
  held_reason: string | null; waiting_on: string;
};
type Line = { deal_id: string; check_status: string };
type Item = { deal_id: string; label: string; done: boolean };
type Settings = { payroll_weekdays: number[]; cutoff_time: string };

const ORDER: Record<string, number> = { open: 0, held: 1, cleared: 2 };

export default async function FinancePage() {
  const access = await requireCap("deals.view");
  const ws = access.workspace.id;
  const supabase = await createClient();

  const today = todayIso(access.workspace.timezone);
  const [dealsRes, settingsRes, openRunRes] = await Promise.all([
    supabase.from("deals").select("id, address, deal_type, gci, deposit_date, status, held_reason, waiting_on")
      .eq("workspace_id", ws).in("status", ["open", "cleared", "held"]).order("deposit_date", { ascending: true, nullsFirst: false }).limit(500),
    supabase.from("workspaces").select("payroll_weekdays, cutoff_time").eq("id", ws).maybeSingle(),
    supabase.from("payrolls").select("pay_date, status").eq("workspace_id", ws).eq("status", "open").gte("pay_date", today).order("pay_date").limit(1),
  ]);
  const deals = ((dealsRes.data ?? []) as Deal[])
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || (a.deposit_date ?? "9999").localeCompare(b.deposit_date ?? "9999") || a.address.localeCompare(b.address));
  const settings = settingsRes.data as Settings | null;
  const ids = deals.map((deal) => deal.id);

  const [lines, items, paid] = await Promise.all([
    inBatches<Line>(ids, (batch) => supabase.from("deal_agents").select("deal_id, check_status").eq("workspace_id", ws).in("deal_id", batch)),
    inBatches<Item>(ids, (batch) => supabase.from("deal_checklist").select("deal_id, label, done").eq("workspace_id", ws).in("deal_id", batch).order("position")),
    inBatches<{ deal_id: string }>(ids, (batch) => supabase.from("payment_allocations").select("deal_id").eq("workspace_id", ws).in("deal_id", batch)),
  ]);
  const linesByDeal = groupBy(lines, (line) => line.deal_id);
  const itemsByDeal = groupBy(items, (item) => item.deal_id);
  const hasPayment = new Set(paid.map((p) => p.deal_id));

  const nextDate = upcomingPayDates(settings?.payroll_weekdays, today, 1)[0] ?? null;
  const openRun = (openRunRes.data as { pay_date: string }[] | null)?.[0] ?? null;
  const count = (status: string) => deals.filter((deal) => deal.status === status).length;
  const failing = lines.filter((line) => failsCheck(line.check_status)).length;

  /** In plain words, what stands between this deal and payroll. */
  const missingFor = (deal: Deal) => {
    const out: string[] = [];
    const dealLines = linesByDeal.get(deal.id) ?? [];
    if (dealLines.length === 0) out.push("No agent on the deal");
    const wrong = dealLines.filter((line) => line.check_status === "incorrect").length;
    const approval = dealLines.filter((line) => line.check_status === "needs_approval").length;
    if (wrong) out.push(wrong === 1 ? "Incorrect split" : `${wrong} incorrect splits`);
    if (approval) out.push(approval === 1 ? "Split needs tier approval" : `${approval} splits need tier approval`);
    for (const item of itemsByDeal.get(deal.id) ?? []) if (!item.done) out.push(`Not checked: ${item.label}`);
    if (!hasPayment.has(deal.id)) out.push("No payment recorded");
    if (!deal.deposit_date) out.push("No deposit date");
    if (deal.status === "held") out.push(`Held: ${deal.held_reason ?? "no reason recorded"}`);
    return out;
  };

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Finance" title="Overview" sub={`Where every deal stands today, ${day(today)}, and what each one still needs before payroll.`}>
        {access.caps.has("deals.edit") && <ButtonLink href="/deals/new" primary>New deal</ButtonLink>}
        <ButtonLink href="/deals">All deals</ButtonLink>
      </PageHeader>

      <div className={ui.grid4}>
        <Card><Stat label="Open deals" value={count("open")} note="Still being worked on" /></Card>
        <Card><Stat label="Cleared, ready for payroll" value={count("cleared")} note="Go in at the next cutoff" /></Card>
        <Card><Stat label="Held" value={count("held")} note={<Link href="/payroll">See the Held folder</Link>} /></Card>
        <Card>
          <Stat
            label="Lines failing the rider check"
            value={failing}
            note={failing ? (access.caps.has("payouts.view") && access.workspace.addons.includes("finance_shield") ? <Link href="/payouts">See payout checks</Link> : "Fix, approve or override before clearing") : "Every split matches its rider"}
          />
        </Card>
      </div>

      <Card title="Next payroll" aside={<Link href="/payroll" className={ui.linkBtn}>Payroll calendar</Link>}>
        {nextDate ? (
          <div className={ui.grid3}>
            <Stat label="Payroll date" value={weekDay(nextDate)} note={nextDate === today ? "Today" : undefined} />
            <Stat label="Cutoff" value={clock(settings?.cutoff_time)} note={`On ${weekDay(nextDate)}. Cleared deals go in; the rest wait.`} />
            <Stat
              label="Payroll run"
              value={openRun ? "Open" : "Not opened"}
              note={openRun ? `Open for ${weekDay(openRun.pay_date)}` : "Open it from the payroll calendar"}
            />
          </div>
        ) : (
          <Empty>No payroll days are set for this brokerage yet.</Empty>
        )}
      </Card>

      <Card title="Run sheet" aside={<span className={ui.soft}>{deals.length} open, cleared or held</span>}>
        {deals.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Deal</th>
                  <th scope="col" className={ui.num}>GCI</th>
                  <th scope="col">Deposit date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Still missing</th>
                  <th scope="col">Waiting on</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal, index) => {
                  const missing = missingFor(deal);
                  return (
                    <tr key={deal.id}>
                      <td className={ui.soft}>{index + 1}</td>
                      <td>
                        <Link href={`/deals/${deal.id}`} className={ui.rowLink}>{deal.address}</Link>
                        <div className={ui.soft}>{dealTypeLabel(deal.deal_type)}</div>
                      </td>
                      <td className={ui.num}>{money(deal.gci)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{day(deal.deposit_date)}</td>
                      <td><Badge tone={dealStatusTone(deal.status)}>{dealStatusLabel(deal.status)}</Badge></td>
                      <td>
                        {missing.length ? (
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {missing.map((entry) => <li key={entry}>{entry}</li>)}
                          </ul>
                        ) : (
                          <Badge tone="ok">Nothing missing</Badge>
                        )}
                      </td>
                      <td>{waitingLabel(deal.waiting_on)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No open, cleared or held deals. Everything has been through payroll.</Empty>
        )}
      </Card>
    </div>
  );
}

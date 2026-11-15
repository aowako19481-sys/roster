import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, Empty, PageHeader, Placeholder, Stat, ui, type Tone } from "@/components/ui";
import { requireCap } from "@/lib/access";
import { BRAND } from "@/lib/brand";
import { clock, dealTypeLabel, documentDeadline, groupBy, inBatches, upcomingPayDates, weekDay, weekdayName } from "@/lib/finance";
import { dayTime, money, todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addToPayroll, closePayroll, openPayroll, releasePayroll, runCutoff } from "./actions";

export const metadata: Metadata = { title: "Payroll" };

type Settings = { payroll_weekdays: number[]; cutoff_time: string; close_time: string; timezone: string };
type Payroll = { id: string; pay_date: string; cutoff_at: string; status: string; released_at: string | null; closed_at: string | null };
type Deal = { id: string; address: string; deal_type: string; gci: number; company_dollar: number; status: string; held_reason: string | null; payroll_id: string | null };
type Line = { deal_id: string; payout: number; check_status: string };

const PAYROLL_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "plain" },
  cutoff: { label: "Cutoff run", tone: "warn" },
  released: { label: "Released", tone: "ok" },
  closed: { label: "Closed", tone: "muted" },
};

export default async function PayrollPage() {
  const access = await requireCap("deals.view");
  const ws = access.workspace.id;
  const tz = access.workspace.timezone;
  const canManage = access.caps.has("payroll.manage");
  const canRelease = access.caps.has("payroll.release");
  const supabase = await createClient();

  const [settingsRes, payrollsRes, waitingRes] = await Promise.all([
    supabase.from("workspaces").select("payroll_weekdays, cutoff_time, close_time, timezone").eq("id", ws).maybeSingle(),
    supabase.from("payrolls").select("id, pay_date, cutoff_at, status, released_at, closed_at").eq("workspace_id", ws).order("pay_date", { ascending: false }).limit(12),
    supabase.from("deals").select("id, address, deal_type, gci, company_dollar, status, held_reason, payroll_id")
      .eq("workspace_id", ws).in("status", ["cleared", "held"]).order("address").limit(500),
  ]);
  const settings = settingsRes.data as Settings | null;
  const payrolls = (payrollsRes.data ?? []) as Payroll[];
  const waiting = (waitingRes.data ?? []) as Deal[];
  const held = waiting.filter((deal) => deal.status === "held");
  const cleared = waiting.filter((deal) => deal.status === "cleared");

  const inPayroll = await inBatches<Deal>(payrolls.map((p) => p.id), (batch) =>
    supabase.from("deals").select("id, address, deal_type, gci, company_dollar, status, held_reason, payroll_id").eq("workspace_id", ws).in("payroll_id", batch).order("address"));
  const lines = await inBatches<Line>([...inPayroll, ...waiting].map((deal) => deal.id), (batch) =>
    supabase.from("deal_agents").select("deal_id, payout, check_status").eq("workspace_id", ws).in("deal_id", batch));
  const linesByDeal = groupBy(lines, (line) => line.deal_id);
  const payoutOf = (deal: Deal) => (linesByDeal.get(deal.id) ?? []).reduce((sum, line) => sum + Number(line.payout), 0);
  const dealsByPayroll = groupBy(inPayroll, (deal) => deal.payroll_id ?? "");

  const today = todayIso(tz);
  const upcoming = upcomingPayDates(settings?.payroll_weekdays, today, 6);
  const byDate = new Map(payrolls.map((p) => [p.pay_date, p]));
  const notOpened = upcoming.filter((date) => !byDate.has(date));
  const addable = payrolls.filter((p) => p.status === "open" || p.status === "cutoff");

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow="Finance" title="Payroll" sub="At cutoff, cleared deals go into the payroll. Everything else waits in the Held folder with its reason." />

      <Card>
        <p>
          <strong className={ui.strong}>{BRAND} never moves money.</strong> Releasing a payroll records the decision, who made it and when.
          Finance then pays the agents through its own bank and payroll systems.
        </p>
      </Card>

      <Card title="Calendar" aside={access.caps.has("settings.manage") ? <Link href="/settings" className={ui.linkBtn}>Change in settings</Link> : undefined}>
        <div className={ui.grid3}>
          <Stat label="Payroll days" value={settings?.payroll_weekdays?.length ? settings.payroll_weekdays.map(weekdayName).join(" and ") : "Not set"} />
          <Stat label="Cutoff" value={clock(settings?.cutoff_time)} note={`On payroll day, ${settings?.timezone ?? tz}`} />
          <Stat label="Close" value={clock(settings?.close_time)} note="Processed deals become Closed" />
        </div>
        {upcoming.length > 0 && (
          <div className={ui.tableWrap} style={{ marginTop: 22 }}>
            <table className={ui.table}>
              <caption className={ui.soft} style={{ textAlign: "left", paddingBottom: 10 }}>Upcoming payroll dates</caption>
              <thead>
                <tr>
                  <th scope="col">Payroll date</th>
                  <th scope="col">Cutoff</th>
                  <th scope="col">Agent documents due</th>
                  <th scope="col">Payroll run</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((date) => {
                  const run = byDate.get(date);
                  return (
                    <tr key={date}>
                      <td className={ui.strong}>{weekDay(date)}{date === today ? " (today)" : ""}</td>
                      <td>{clock(settings?.cutoff_time)}</td>
                      <td>{weekDay(documentDeadline(date))}</td>
                      <td>
                        {run ? (
                          <Badge tone={PAYROLL_STATUS[run.status]?.tone ?? "plain"}>{PAYROLL_STATUS[run.status]?.label ?? run.status}</Badge>
                        ) : canManage ? (
                          <ActionForm action={openPayroll} className={ui.inline}>
                            <input type="hidden" name="pay_date" value={date} />
                            <Submit small variant="plain" aria-label={`Open payroll for ${weekDay(date)}`}>Open payroll</Submit>
                          </ActionForm>
                        ) : (
                          <span className={ui.soft}>Not opened</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canManage && (
          <details style={{ marginTop: 14 }}>
            <summary className={ui.linkBtn}>Open a payroll for another date</summary>
            <ActionForm action={openPayroll} className={ui.inline} resetOnSuccess style={{ marginTop: 10 }}>
              <label className={ui.field}>
                Payroll date
                <input className={ui.input} type="date" name="pay_date" defaultValue={notOpened[0] ?? today} required />
              </label>
              <Submit variant="plain">Open payroll</Submit>
            </ActionForm>
          </details>
        )}
      </Card>

      <Card title="Payroll runs">
        {payrolls.length ? (
          <div className={ui.stack}>
            {payrolls.map((run) => {
              const deals = dealsByPayroll.get(run.id) ?? [];
              const total = deals.reduce((sum, deal) => sum + payoutOf(deal), 0);
              const state = PAYROLL_STATUS[run.status] ?? { label: run.status, tone: "plain" as Tone };
              return (
                <section key={run.id} aria-labelledby={`run-${run.id}`} style={{ paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                  <div className={ui.inline} style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <h3 id={`run-${run.id}`} className={ui.h2}>{weekDay(run.pay_date)}</h3>
                      <p className={ui.soft}>
                        Cutoff {dayTime(run.cutoff_at, tz)} · {deals.length} {deals.length === 1 ? "deal" : "deals"} · payouts {money(total)}
                        {run.released_at ? ` · released ${dayTime(run.released_at, tz)}` : ""}
                        {run.closed_at ? ` · closed ${dayTime(run.closed_at, tz)}` : ""}
                      </p>
                    </div>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </div>

                  {deals.length ? (
                    <div className={ui.tableWrap} style={{ marginTop: 12 }}>
                      <table className={ui.table}>
                        <thead>
                          <tr>
                            <th scope="col">Deal</th>
                            <th scope="col">Type</th>
                            <th scope="col" className={ui.num}>GCI</th>
                            <th scope="col" className={ui.num}>Payouts</th>
                            <th scope="col" className={ui.num}>Company dollar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deals.map((deal) => (
                            <tr key={deal.id}>
                              <td><Link href={`/deals/${deal.id}`} className={ui.rowLink}>{deal.address}</Link></td>
                              <td>{dealTypeLabel(deal.deal_type)}</td>
                              <td className={ui.num}>{money(deal.gci)}</td>
                              <td className={`${ui.num} ${ui.strong}`}>{money(payoutOf(deal))}</td>
                              <td className={ui.num}>{money(deal.company_dollar)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className={ui.soft} style={{ marginTop: 10 }}>
                      {run.status === "open" ? "No deals yet. Cleared deals go in when the cutoff is run." : "No deals in this payroll."}
                    </p>
                  )}

                  {(canManage || canRelease) && run.status !== "closed" && (
                    <div className={ui.inline} style={{ marginTop: 12, alignItems: "flex-start" }}>
                      {canManage && run.status === "open" && (
                        <ActionForm action={runCutoff}>
                          <input type="hidden" name="payroll" value={run.id} />
                          <div><Submit small>Run cutoff</Submit></div>
                          <p className={ui.help}>Takes in every cleared deal ({cleared.length} now) and holds open deals deposited on or before this date.</p>
                        </ActionForm>
                      )}
                      {run.status === "cutoff" && canRelease && (
                        <ActionForm action={releasePayroll}>
                          <input type="hidden" name="payroll" value={run.id} />
                          <div><Submit small>Release</Submit></div>
                          <p className={ui.help}>Records the decision only. No money moves from {BRAND}.</p>
                        </ActionForm>
                      )}
                      {run.status === "cutoff" && !canRelease && (
                        <p className={ui.help}>Waiting for someone with the power to release payroll (the owner, or a person the owner has granted it to).</p>
                      )}
                      {canManage && run.status === "released" && (
                        <ActionForm action={closePayroll}>
                          <input type="hidden" name="payroll" value={run.id} />
                          <div><Submit small>Close payroll</Submit></div>
                          <p className={ui.help}>Marks its deals Closed and counts them towards each agent&rsquo;s year.</p>
                        </ActionForm>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <Empty>No payroll has been opened yet.</Empty>
        )}
      </Card>

      {canManage && (
        <Card title="Add a deal to a payroll">
          {addable.length && waiting.length ? (
            <ActionForm action={addToPayroll} className={ui.inline} resetOnSuccess>
              <label className={ui.field}>
                Payroll
                <select className={ui.select} name="payroll" defaultValue={addable[0]?.id}>
                  {addable.map((run) => <option key={run.id} value={run.id}>{weekDay(run.pay_date)} · {PAYROLL_STATUS[run.status]?.label}</option>)}
                </select>
              </label>
              <label className={ui.field} style={{ flex: "1 1 320px" }}>
                Cleared or held deal
                <select className={ui.select} name="deal" defaultValue="" required>
                  <option value="" disabled>Choose a deal…</option>
                  {waiting.map((deal) => (
                    <option key={deal.id} value={deal.id}>{deal.address} · {dealTypeLabel(deal.deal_type)} · {deal.status === "held" ? "Held" : "Cleared"}</option>
                  ))}
                </select>
              </label>
              <Submit variant="plain">Add to payroll</Submit>
            </ActionForm>
          ) : (
            <Empty>
              {addable.length ? "There are no cleared or held deals to add." : "Open a payroll first. Deals can be added until it is released."}
            </Empty>
          )}
        </Card>
      )}

      <Card title="Held folder" aside={<Badge tone={held.length ? "bad" : "ok"}>{held.length} held</Badge>}>
        {held.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Deal</th>
                  <th scope="col">Type</th>
                  <th scope="col">Reason</th>
                  <th scope="col" className={ui.num}>Payouts</th>
                </tr>
              </thead>
              <tbody>
                {held.map((deal) => (
                  <tr key={deal.id}>
                    <td><Link href={`/deals/${deal.id}`} className={ui.rowLink}>{deal.address}</Link></td>
                    <td>{dealTypeLabel(deal.deal_type)}</td>
                    <td>{deal.held_reason ?? "No reason recorded"}</td>
                    <td className={ui.num}>{money(payoutOf(deal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing is held.</Empty>
        )}
      </Card>

      <Card title="Deposit records">
        <div className={ui.form}>
          <Placeholder service="Document templates">
            &ldquo;Generate all deposit records&rdquo; will fill the brokerage&rsquo;s own deposit record template for every deal in a payroll at once and
            save each one by payroll date and address. Templates are not connected yet, so the button is switched off.
          </Placeholder>
          <div><button type="button" className={ui.btn} disabled>Generate all deposit records</button></div>
        </div>
      </Card>
    </div>
  );
}

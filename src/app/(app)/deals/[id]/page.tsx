import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, ButtonLink, Card, Empty, PageHeader, Placeholder, Stat, Tabs, ui } from "@/components/ui";
import { requireCap } from "@/lib/access";
import {
  DEAL_TYPES,
  FEE_KINDS, OVERRIDE_REASONS, checkLabel, checkTone, dealStatusLabel, dealStatusTone, dealTypeLabel, failsCheck, feeKindLabel,
  inBatches, isFrozen, overrideReasonLabel, paymentMethodLabel, targetPayroll, urgentEmail, waitingLabel, weekDay,
} from "@/lib/finance";
import { day, dayTime, money, pct, titleCase, todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addFee, editDeal, overrideLine, pushThrough, removeFee, saveLine, sendAgentEmail, setDealStatus, setWaiting, tickItem } from "../actions";
import { TickBox } from "./TickBox";

export const metadata: Metadata = { title: "Deal sheet" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ email?: string | string[] }> };

type Deal = {
  id: string; address: string; deal_type: string; gci: number; net: number; company_dollar: number; deposit_date: string | null;
  status: string; held_reason: string | null; waiting_on: string; payroll_id: string | null; pp_number: string | null;
  parties: unknown; office_id: string | null; created_at: string;
};
type Line = {
  id: string; agent_id: string; basis: string; share_pct: number; split_pct: number; rider_pct: number | null;
  check_status: string; check_reason: string | null; override_reason: string | null; override_note: string | null; payout: number;
};
type Fee = { id: string; kind: string; payee: string; amount: number };
type Item = { id: string; label: string; done: boolean; done_at: string | null; position: number };
type Allocation = { payment_id: string; amount: number };
type Payment = { id: string; method: string; amount: number; received_on: string; reference: string | null; explanation: string | null };
type Audit = { id: number; actor_label: string | null; action: string; entity: string; summary: string | null; detail: Record<string, unknown> | null; at: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITY_WORDS: Record<string, string> = { deals: "deal", deal_agents: "agent line", deal_fees: "fee", deal_checklist: "checklist item" };

function auditText(row: Audit) {
  if (row.summary) return row.summary;
  const what = ENTITY_WORDS[row.entity] ?? row.entity;
  if (row.action === "insert") return `Added ${what}${typeof row.detail?.label === "string" ? `: ${row.detail.label}` : ""}`;
  if (row.action === "delete") return `Removed ${what}`;
  const changed = Object.keys(row.detail ?? {}).map((key) => titleCase(key).toLowerCase());
  return `Changed ${what}${changed.length ? `: ${changed.join(", ")}` : ""}`;
}

export default async function DealSheetPage({ params, searchParams }: Props) {
  const access = await requireCap("deals.view");
  const ws = access.workspace.id;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const showEmail = (await searchParams).email === "preview";
  const supabase = await createClient();

  const { data: dealRow } = await supabase.from("deals")
    .select("id, address, deal_type, gci, net, company_dollar, deposit_date, status, held_reason, waiting_on, payroll_id, pp_number, parties, office_id, created_at")
    .eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!dealRow) notFound();
  const deal = dealRow as Deal;

  const [linesRes, feesRes, itemsRes, allocRes, settingsRes] = await Promise.all([
    supabase.from("deal_agents")
      .select("id, agent_id, basis, share_pct, split_pct, rider_pct, check_status, check_reason, override_reason, override_note, payout")
      .eq("deal_id", id).eq("workspace_id", ws),
    supabase.from("deal_fees").select("id, kind, payee, amount").eq("deal_id", id).eq("workspace_id", ws).order("kind"),
    supabase.from("deal_checklist").select("id, label, done, done_at, position").eq("deal_id", id).eq("workspace_id", ws).order("position"),
    supabase.from("payment_allocations").select("payment_id, amount").eq("deal_id", id).eq("workspace_id", ws),
    supabase.from("workspaces").select("payroll_weekdays").eq("id", ws).maybeSingle(),
  ]);
  const lines = (linesRes.data ?? []) as Line[];
  const fees = (feesRes.data ?? []) as Fee[];
  const items = (itemsRes.data ?? []) as Item[];
  const allocations = (allocRes.data ?? []) as Allocation[];

  const [agents, payments, officeRes, payrollRes] = await Promise.all([
    inBatches<{ id: string; full_name: string; email: string | null }>(lines.map((line) => line.agent_id), (batch) =>
      supabase.from("agents").select("id, full_name, email").eq("workspace_id", ws).in("id", batch)),
    inBatches<Payment>(allocations.map((a) => a.payment_id), (batch) =>
      supabase.from("payments").select("id, method, amount, received_on, reference, explanation").eq("workspace_id", ws).in("id", batch)),
    deal.office_id ? supabase.from("offices").select("name").eq("id", deal.office_id).eq("workspace_id", ws).maybeSingle() : null,
    deal.payroll_id ? supabase.from("payrolls").select("pay_date, status").eq("id", deal.payroll_id).eq("workspace_id", ws).maybeSingle() : null,
  ]);
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const nameOf = (line: Line) => agentById.get(line.agent_id)?.full_name ?? "Agent in another office";
  lines.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const office = (officeRes?.data as { name: string } | null)?.name ?? null;
  const payroll = (payrollRes?.data as { pay_date: string; status: string } | null) ?? null;

  let audit: Audit[] = [];
  if (access.caps.has("audit.view")) {
    const ids = [deal.id, ...lines.map((l) => l.id), ...fees.map((f) => f.id), ...items.map((i) => i.id)];
    audit = (await inBatches<Audit>(ids, (batch) =>
      supabase.from("audit_log").select("id, actor_label, action, entity, summary, detail, at")
        .eq("workspace_id", ws).in("entity", ["deals", "deal_agents", "deal_fees", "deal_checklist"]).in("entity_id", batch)
        .order("at", { ascending: false }).limit(200)))
      .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id).slice(0, 60);
  }

  const frozen = isFrozen(deal.status);
  const canEdit = access.caps.has("deals.edit") && !frozen;
  const canHold = access.caps.has("deals.hold") && !frozen;
  const canOverride = access.caps.has("override") && !frozen;
  const canApprove = access.caps.has("tiers.approve");
  const parties = Array.isArray(deal.parties)
    ? (deal.parties as { kind?: unknown; name?: unknown }[]).filter((p) => typeof p?.name === "string" && typeof p?.kind === "string") as { kind: string; name: string }[]
    : [];
  const feeTotal = fees.reduce((sum, fee) => sum + Number(fee.amount), 0);
  const allocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const missing = items.filter((item) => !item.done);
  const failing = lines.filter((line) => failsCheck(line.check_status));

  const target = targetPayroll((settingsRes.data as { payroll_weekdays: number[] } | null)?.payroll_weekdays, todayIso(access.workspace.timezone));
  const email = urgentEmail({
    agentFirstNames: lines.map((line) => agentById.get(line.agent_id)?.full_name.split(" ")[0]).filter((n): n is string => Boolean(n)),
    address: deal.address,
    missing: missing.map((item) => item.label),
    payDate: target?.payDate ?? null,
    deadline: target?.deadline ?? null,
    brokerage: access.workspace.name,
  });
  const recipients = lines.map((line) => agentById.get(line.agent_id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const here = `/deals/${deal.id}`;

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow="Deal sheet"
        title={deal.address}
        sub={[dealTypeLabel(deal.deal_type), deal.pp_number, office, deal.deposit_date ? `Deposit ${day(deal.deposit_date)}` : "No deposit date"].filter(Boolean).join(" · ")}
      >
        <Badge tone={dealStatusTone(deal.status)}>{dealStatusLabel(deal.status)}</Badge>
        <ButtonLink href="/deals">All deals</ButtonLink>
      </PageHeader>
      <Tabs items={[{ href: `/deals/${deal.id}`, label: "Deal sheet" }, { href: `/deals/${deal.id}/documents`, label: "Documents" }]} current={`/deals/${deal.id}`} />

      {frozen && (
        <Card>
          <p>
            <strong className={ui.strong}>This deal is read-only.</strong>{" "}
            {deal.status === "closed" ? "It was paid and closed" : "It is in a payroll"}
            {payroll ? ` (payroll of ${weekDay(payroll.pay_date)})` : ""}, so it can no longer be changed.
          </p>
        </Card>
      )}
      {deal.status === "held" && (
        <Card>
          <p><strong className={ui.strong}>Held.</strong> {deal.held_reason ?? "No reason recorded."}</p>
        </Card>
      )}

      {canEdit && (
        <Card title="Deal details">
          <details>
            <summary className={ui.linkBtn}>Edit address, GCI, type, deposit date or PP number</summary>
            <ActionForm action={editDeal} style={{ marginTop: 16 }}>
              <input type="hidden" name="id" value={deal.id} />
              <label className={ui.field}>
                Address
                <input className={ui.input} name="address" defaultValue={deal.address} required minLength={3} maxLength={200} />
              </label>
              <div className={ui.formRow}>
                <label className={ui.field}>
                  GCI ($)
                  <input className={ui.input} name="gci" defaultValue={Number(deal.gci).toFixed(2)} required inputMode="decimal" maxLength={16} />
                </label>
                <label className={ui.field}>
                  Type
                  <select className={ui.select} name="deal_type" defaultValue={deal.deal_type}>
                    {DEAL_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={ui.field}>
                  Deposit date
                  <input className={ui.input} name="deposit_date" type="date" defaultValue={deal.deposit_date ?? ""} />
                </label>
                <label className={ui.field}>
                  PP number
                  <input className={ui.input} name="pp_number" defaultValue={deal.pp_number ?? ""} maxLength={40} />
                </label>
              </div>
              <label className={ui.check}>
                <input type="checkbox" name="confirm_dual" />
                <span>If another deal already uses this address, save anyway: this is a separate deal (for example a dual).</span>
              </label>
              <p className={ui.help}>
                Payouts and the rider check are worked out again when you save. If this deal was already cleared and you
                change the GCI or type, it goes back to open and needs clearing again. Every change is recorded in the
                audit trail.
              </p>
              <Submit>Save details</Submit>
            </ActionForm>
          </details>
        </Card>
      )}

      <Card title="Money" aside={<span className={ui.soft}>Worked out by the database each time the deal is saved</span>}>
        <div className={ui.grid4}>
          <Stat label="GCI" value={money(deal.gci)} />
          <Stat label="Fees out" value={money(feeTotal)} note={fees.length ? `${fees.length} ${fees.length === 1 ? "line" : "lines"}` : "None"} />
          <Stat label="Net" value={money(deal.net)} note="GCI less all fees" />
          <Stat label="Company dollar" value={money(deal.company_dollar)} note="Net less every payout" />
        </div>
        {lines.length > 0 && (
          <div className={ui.tableWrap} style={{ marginTop: 22 }}>
            <table className={ui.table}>
              <caption className={ui.soft} style={{ textAlign: "left", paddingBottom: 10 }}>Payouts</caption>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col" className={ui.num}>Share of deal</th>
                  <th scope="col" className={ui.num}>Split</th>
                  <th scope="col" className={ui.num}>Payout</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>{nameOf(line)}</td>
                    <td className={ui.num}>{pct(line.share_pct)}</td>
                    <td className={ui.num}>{pct(line.split_pct)}</td>
                    <td className={`${ui.num} ${ui.strong}`}>{money(line.payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Agents and rider check"
        aside={failing.length ? <Badge tone="bad">{failing.length} to fix</Badge> : lines.length ? <Badge tone="ok">Nothing to fix</Badge> : undefined}
      >
        {lines.length ? (
          <ul className={ui.list}>
            {lines.map((line) => {
              const name = nameOf(line);
              const first = name.split(" ")[0];
              return (
                <li key={line.id}>
                  <div className={ui.inline} style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p className={ui.strong}>{name}</p>
                      <p className={ui.soft}>
                        Paid as {line.basis === "team" ? "team" : "individual"} · {pct(line.share_pct)} of the deal · entered split {pct(line.split_pct)} ·{" "}
                        {line.rider_pct === null ? "no signed rider" : `rider ${pct(line.rider_pct)}`} · payout {money(line.payout)}
                      </p>
                    </div>
                    <Badge tone={checkTone(line.check_status)}>{checkLabel(line.check_status)}</Badge>
                  </div>
                  <p style={{ marginTop: 8 }}>
                    <strong className={ui.strong}>{checkLabel(line.check_status)}.</strong>{" "}
                    {line.check_status === "correct"
                      ? `The split matches ${first}'s signed rider.`
                      : (line.check_reason ?? "")}
                  </p>
                  {line.check_status === "overridden" && (
                    <p className={ui.soft} style={{ marginTop: 4 }}>
                      Reason: {overrideReasonLabel(line.override_reason)}. Note: {line.override_note ?? "none"}
                    </p>
                  )}

                  {failsCheck(line.check_status) && !frozen && (
                    <div className={ui.inline} style={{ marginTop: 12, alignItems: "flex-start" }}>
                      {line.check_status === "needs_approval" && canApprove && (
                        <ButtonLink href="/riders" small>Approve the tier on Riders</ButtonLink>
                      )}
                      {canEdit && line.rider_pct !== null && (
                        <ActionForm action={pushThrough} className={ui.inline}>
                          <input type="hidden" name="line" value={line.id} />
                          <Submit small variant="plain">Push through at the current rider ({pct(line.rider_pct)})</Submit>
                        </ActionForm>
                      )}
                    </div>
                  )}

                  {canEdit && (
                    <details style={{ marginTop: 12 }}>
                      <summary className={ui.linkBtn}>Edit this line</summary>
                      <ActionForm action={saveLine} className={ui.inline} style={{ marginTop: 10 }}>
                        <input type="hidden" name="line" value={line.id} />
                        <label className={ui.field}>
                          Split for {first} (%)
                          <input className={ui.input} name="split" defaultValue={String(line.split_pct)} inputMode="decimal" maxLength={8} required />
                        </label>
                        <label className={ui.field}>
                          Paid as
                          <select className={ui.select} name="basis" defaultValue={line.basis}>
                            <option value="individual">Individual</option>
                            <option value="team">Team</option>
                          </select>
                        </label>
                        <Submit small variant="plain">Save and re-check</Submit>
                      </ActionForm>
                    </details>
                  )}

                  {canOverride && failsCheck(line.check_status) && (
                    <details style={{ marginTop: 12 }}>
                      <summary className={ui.linkBtn}>Override this check</summary>
                      <ActionForm action={overrideLine} style={{ marginTop: 10 }}>
                        <input type="hidden" name="line" value={line.id} />
                        <p className={ui.help}>
                          An override keeps {pct(line.split_pct)} against {line.rider_pct === null ? "no rider" : `a ${pct(line.rider_pct)} rider`}. It is logged with your name, the reason and the note.
                        </p>
                        <label className={ui.field}>
                          Reason
                          <select className={ui.select} name="reason" defaultValue="" required>
                            <option value="" disabled>Choose a reason…</option>
                            {OVERRIDE_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                          </select>
                        </label>
                        <label className={ui.field}>
                          Note (required, at least 10 characters)
                          <textarea className={ui.textarea} name="note" rows={3} minLength={10} maxLength={500} required />
                        </label>
                        <div><Submit small variant="danger">Confirm override</Submit></div>
                      </ActionForm>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No agents on this deal.</Empty>
        )}
      </Card>

      <div className={ui.grid2}>
        <Card title="Fees">
          {fees.length ? (
            <ul className={ui.list}>
              {fees.map((fee) => (
                <li key={fee.id} className={ui.inline} style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p className={ui.strong}>{fee.payee}</p>
                    <p className={ui.soft}>{feeKindLabel(fee.kind)} · {fee.kind === "referral" ? "shows on the deposit record" : "not on the deposit record"}</p>
                  </div>
                  <div className={ui.inline} style={{ alignItems: "center" }}>
                    <span className={ui.strong}>{money(fee.amount)}</span>
                    {canEdit && (
                      <ActionForm action={removeFee} className={ui.inline}>
                        <input type="hidden" name="fee" value={fee.id} />
                        <Submit variant="link" aria-label={`Remove fee to ${fee.payee}`}>Remove</Submit>
                      </ActionForm>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No referral or outside-brokerage fees.</Empty>
          )}
          {canEdit && (
            <details style={{ marginTop: 12 }}>
              <summary className={ui.linkBtn}>Add a fee</summary>
              <ActionForm action={addFee} resetOnSuccess style={{ marginTop: 10 }}>
                <input type="hidden" name="deal" value={deal.id} />
                <div className={ui.formRow}>
                  <label className={ui.field}>
                    Kind
                    <select className={ui.select} name="kind" defaultValue="referral">
                      {FEE_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                    </select>
                  </label>
                  <label className={ui.field}>Paid to<input className={ui.input} name="payee" maxLength={160} required /></label>
                  <label className={ui.field}>Amount ($)<input className={ui.input} name="amount" inputMode="decimal" maxLength={20} required /></label>
                </div>
                <div><Submit small variant="plain">Add fee</Submit></div>
              </ActionForm>
            </details>
          )}
        </Card>

        <Card title="Parties">
          {parties.length ? (
            <dl className={ui.kv}>
              {parties.map((party, index) => (
                <div key={index} style={{ display: "contents" }}>
                  <dt>{titleCase(party.kind)}</dt>
                  <dd>{party.name}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Empty>No parties recorded.</Empty>
          )}
        </Card>
      </div>

      <Card
        title="Dotloop checklist"
        aside={items.length ? <Badge tone={missing.length ? "warn" : "ok"}>{missing.length ? `${missing.length} missing` : "All in"}</Badge> : undefined}
      >
        <p className={ui.help} style={{ marginBottom: 8 }}>Tick each item after checking it in Dotloop.</p>
        {items.length ? (
          <ul className={ui.list}>
            {items.map((item) => (
              <li key={item.id} className={ui.inline} style={{ alignItems: "center", justifyContent: "space-between" }}>
                {canEdit ? (
                  <ActionForm action={tickItem} className={ui.inline}>
                    <input type="hidden" name="item" value={item.id} />
                    <input type="hidden" name="deal" value={deal.id} />
                    <TickBox label={item.label} checked={item.done} />
                  </ActionForm>
                ) : (
                  <span>{item.label}</span>
                )}
                <div className={ui.inline} style={{ alignItems: "center" }}>
                  {item.done ? (
                    <Badge tone="ok">Checked{item.done_at ? ` ${dayTime(item.done_at, access.workspace.timezone)}` : ""}</Badge>
                  ) : (
                    <>
                      <Badge tone="warn">Missing</Badge>
                      {canEdit && (
                        <Link href={`${here}?email=preview#agent-email`} className={`${ui.btn} ${ui.small}`} aria-label={`Send agent email about ${item.label}`}>
                          Send agent email
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No checklist on this deal.</Empty>
        )}
        <div className={ui.inline} style={{ marginTop: 14, alignItems: "center" }}>
          <span>Waiting on: <strong className={ui.strong}>{waitingLabel(deal.waiting_on)}</strong></span>
          {canEdit && deal.waiting_on === "agent" && (
            <ActionForm action={setWaiting} className={ui.inline}>
              <input type="hidden" name="deal" value={deal.id} />
              <input type="hidden" name="waiting_on" value="finance" />
              <Submit small variant="plain">The agent replied: back to finance</Submit>
            </ActionForm>
          )}
        </div>
      </Card>

      {showEmail && canEdit && (
        <Card title="Agent email preview" id="agent-email" aside={<Link href={here} className={ui.linkBtn}>Close preview</Link>}>
          {missing.length ? (
            <div className={ui.form}>
              <dl className={ui.kv}>
                <dt>To</dt>
                <dd>{recipients.length ? recipients.map((agent) => (agent.email ? `${agent.full_name} <${agent.email}>` : `${agent.full_name} (no email on file)`)).join(", ") : "No agent on this deal"}</dd>
                <dt>Subject</dt>
                <dd>{email.subject}</dd>
                <dt>Target payroll</dt>
                <dd>{target ? `${weekDay(target.payDate)}; documents due ${weekDay(target.deadline)}` : "No payroll days are set for this brokerage"}</dd>
              </dl>
              <pre style={{ margin: 0, padding: 16, borderRadius: 12, border: "1px solid var(--line-strong)", background: "rgba(255,255,255,0.3)", fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {email.body}
              </pre>
              <Placeholder service="Email (Resend)">
                This is the exact text that will be sent. Sending is not connected yet, so nothing leaves the app. The button below records the
                intent: the deal is marked as waiting on the agent and the change is written to the audit log.
              </Placeholder>
              <ActionForm action={sendAgentEmail}>
                <input type="hidden" name="deal" value={deal.id} />
                <div><Submit>Send agent email (record only)</Submit></div>
              </ActionForm>
            </div>
          ) : (
            <Empty>Nothing is missing on this deal, so there is no email to send.</Empty>
          )}
        </Card>
      )}

      <Card
        title="Payments"
        aside={access.caps.has("payments.manage") ? <ButtonLink href={`/payments?deal=${deal.id}#add`} small>Add payment</ButtonLink> : undefined}
      >
        {allocations.length ? (
          <>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Received</th>
                    <th scope="col">Method</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Explanation</th>
                    <th scope="col" className={ui.num}>Payment</th>
                    <th scope="col" className={ui.num}>To this deal</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((allocation) => {
                    const payment = paymentById.get(allocation.payment_id);
                    return (
                      <tr key={allocation.payment_id}>
                        <td>{day(payment?.received_on)}</td>
                        <td>{payment ? paymentMethodLabel(payment.method) : "–"}</td>
                        <td className={ui.mono}>{payment?.reference ?? "–"}</td>
                        <td>{payment?.explanation ?? "–"}</td>
                        <td className={ui.num}>{payment ? money(payment.amount) : "–"}</td>
                        <td className={`${ui.num} ${ui.strong}`}>{money(allocation.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={ui.soft} style={{ marginTop: 10 }}>{money(allocated)} received against a GCI of {money(deal.gci)}.</p>
          </>
        ) : (
          <Empty>No payment recorded for this deal yet.</Empty>
        )}
      </Card>

      {canHold && (
        <Card title="Status" aside={<Badge tone={dealStatusTone(deal.status)}>{dealStatusLabel(deal.status)}</Badge>}>
          <div className={ui.form}>
            <div className={ui.inline} style={{ alignItems: "flex-start" }}>
              {deal.status !== "cleared" && (
                <ActionForm action={setDealStatus}>
                  <input type="hidden" name="deal" value={deal.id} />
                  <input type="hidden" name="intent" value="clear" />
                  <div><Submit>Clear for payroll</Submit></div>
                </ActionForm>
              )}
              {deal.status !== "open" && (
                <ActionForm action={setDealStatus}>
                  <input type="hidden" name="deal" value={deal.id} />
                  <input type="hidden" name="intent" value="reopen" />
                  <div><Submit variant="plain">Reopen</Submit></div>
                </ActionForm>
              )}
            </div>
            {failing.length > 0 && deal.status !== "cleared" && (
              <p className={ui.help}>This deal cannot be cleared until every split is Correct or Overridden.</p>
            )}
            {deal.status !== "held" && (
              <ActionForm action={setDealStatus} className={ui.inline}>
                <input type="hidden" name="deal" value={deal.id} />
                <input type="hidden" name="intent" value="hold" />
                <label className={ui.field} style={{ flex: "1 1 320px" }}>
                  Reason for holding (required)
                  <input className={ui.input} name="reason" maxLength={300} required />
                </label>
                <Submit variant="danger">Hold</Submit>
              </ActionForm>
            )}
          </div>
        </Card>
      )}

      {access.caps.has("audit.view") && (
        <Card title="Audit trail">
          {audit.length ? (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">What</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{dayTime(row.at, access.workspace.timezone)}</td>
                      <td>{row.actor_label ?? "System"}</td>
                      <td>
                        {auditText(row)}
                        {row.action === "override" && row.detail && (
                          <div className={ui.soft}>
                            {overrideReasonLabel(typeof row.detail.reason === "string" ? row.detail.reason : null)}
                            {typeof row.detail.note === "string" ? `: ${row.detail.note}` : ""}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nothing recorded yet.</Empty>
          )}
        </Card>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, ButtonLink, Card, Empty, PageHeader, Placeholder, Tabs, ui, type Tone } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/access";
import { DropZone } from "@/components/DropZone";
import { BILLING_LABEL, MONTHLY_MINIMUM, PLANS, PLAN_PIECES, WORKSPACE_STATUSES, monthLabel, pieceUnlocked, planLabel, priceEstimate, type AuditRow } from "@/lib/admin-pages";
import { BRAND } from "@/lib/brand";
import { day, money, titleCase, todayIso } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { switchWorkspace } from "../../actions";
import { AuditTable } from "../../settings/audit/AuditTable";
import { addContract, fileMonth, inviteOwner, removeContract, setAccount, updateBrokerage } from "../actions";
import kinu from "../kinu.module.css";
import { PieceToggle } from "../PieceToggle";
import styles from "../../settings/settings.module.css";

export const metadata: Metadata = { title: "Brokerage" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_TONE: Record<string, Tone> = { active: "ok", paused: "warn", closed: "muted" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; check?: string }> };
type Month = { id: string; month: string; amount: number | null; invoice_no: string | null; invoice_path: string | null; proof_path: string | null; payment_ref: string | null; paid_on: string | null; note: string | null };
type Contract = { id: string; title: string; starts_on: string; ends_on: string; file_name: string; note: string | null };

type Member = {
  user_id: string; role: string; display_name: string | null; email: string | null; status: string;
  custom_role_id: string | null; can_override: boolean; can_release_payroll: boolean; created_at: string;
};

export default async function BrokeragePage({ params, searchParams }: Props) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = await searchParams;
  const tab = ["billing", "contracts", "people"].includes(query.tab ?? "") ? query.tab! : "overview";

  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, timezone, status, has_ops, has_finance, addons, created_at, plan_name, owner_seats, agent_seats, quoted_monthly")
    .eq("id", id)
    .maybeSingle();
  if (!ws) notFound();

  const [membersRes, invitesRes, rolesRes, auditRes, overviewRes, monthsRes, contractsRes, officesRes] = await Promise.all([
    supabase.from("workspace_members")
      .select("user_id, role, display_name, email, status, custom_role_id, can_override, can_release_payroll, created_at")
      .eq("workspace_id", id).order("created_at").limit(500),
    supabase.from("member_invites").select("id, email, role, created_at, accepted_at")
      .eq("workspace_id", id).is("accepted_at", null).order("created_at", { ascending: false }).limit(200),
    supabase.from("custom_roles").select("id, name").eq("workspace_id", id).limit(200),
    supabase.from("audit_log").select("id, actor_label, action, entity, entity_id, summary, detail, at")
      .eq("workspace_id", id).order("at", { ascending: false }).limit(25),
    supabase.rpc("platform_overview"),
    supabase.from("billing_months").select("id, month, amount, invoice_no, invoice_path, proof_path, payment_ref, paid_on, note").eq("workspace_id", id).order("month", { ascending: false }).limit(240),
    supabase.from("contracts").select("id, title, starts_on, ends_on, file_name, note").eq("workspace_id", id).order("starts_on", { ascending: false }).limit(100),
    supabase.from("offices").select("id", { count: "exact", head: true }).eq("workspace_id", id),
  ]);
  const months = (monthsRes.data ?? []) as Month[];
  const contracts = (contractsRes.data ?? []) as Contract[];
  const thisMonth = `${todayIso().slice(0, 7)}-01`;
  const current = months.find((month) => month.month === thisMonth);
  const billing = !current ? "none" : current.proof_path || current.paid_on ? "paid" : "invoiced";
  const here = `/kinu/${id}`;

  const members = (membersRes.data ?? []) as Member[];
  const invites = invitesRes.data ?? [];
  const customRoles = new Map((rolesRes.data ?? []).map((role) => [role.id as string, role.name as string]));
  const audit = (auditRes.data ?? []) as AuditRow[];
  const overview = (Array.isArray(overviewRes.data) ? overviewRes.data : []) as { id: string; agents: number; members: number }[];
  const agents = Number(overview.find((row) => row.id === id)?.agents ?? 0);
  const addons: string[] = ws.addons ?? [];
  const price = priceEstimate({ hasOps: ws.has_ops, hasFinance: ws.has_finance, addons }, agents);
  const active = members.filter((member) => member.status === "active");
  const owners = active.filter((member) => member.role === "owner_admin").length + invites.filter((invite) => invite.role === "owner_admin").length;
  const overSeats = ws.agent_seats !== null && agents > ws.agent_seats;
  const years = [...new Set(months.map((month) => month.month.slice(0, 4)))];

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow={`${BRAND} staff · Brokerage`} title={ws.name} sub={`Created ${day(ws.created_at)} · ${ws.timezone}`}>
        <ButtonLink href="/kinu">All brokerages</ButtonLink>
        <form action={switchWorkspace}>
          <input type="hidden" name="ws" value={ws.id} />
          <button type="submit" className={ui.btnPrimary}>Open this brokerage</button>
        </form>
      </PageHeader>

      <section className={kinu.file} aria-label="Account file">
        <div>
          <span className={kinu.no}>ID {ws.id.slice(0, 8).toUpperCase()} · since {day(ws.created_at)}</span>
          <h2>{ws.name}</h2>
          <div className={`${ui.inline} ${kinu.tags}`}>
            <Badge tone={STATUS_TONE[ws.status] ?? "plain"}>{titleCase(ws.status)}</Badge>
            <Badge tone={billing === "paid" ? "ok" : billing === "invoiced" ? "warn" : "muted"}>{BILLING_LABEL[billing]}</Badge>
          </div>
        </div>
        <dl className={kinu.facts}>
          <div><dt>Plan</dt><dd>{planLabel(ws.plan_name)}</dd></div>
          <div><dt>Monthly</dt><dd>{ws.quoted_monthly !== null ? money(Number(ws.quoted_monthly)) : `${money(price.total)} est.`}</dd></div>
          <div><dt>Agent seats</dt><dd>{agents}{ws.agent_seats !== null ? ` of ${ws.agent_seats}` : ""}{overSeats ? " · over" : ""}</dd></div>
          <div><dt>Owner / Admin seats</dt><dd>{owners} of {ws.owner_seats}</dd></div>
          <div><dt>Offices</dt><dd>{officesRes.count ?? 0}</dd></div>
          <div><dt>Contract to</dt><dd>{contracts[0] ? day(contracts[0].ends_on) : "None filed"}</dd></div>
        </dl>
      </section>

      <Tabs
        current={tab === "overview" ? here : `${here}?tab=${tab}`}
        items={[
          { href: here, label: "Plan and account" },
          { href: `${here}?tab=billing`, label: `Billing (${months.length})` },
          { href: `${here}?tab=contracts`, label: `Contracts (${contracts.length})` },
          { href: `${here}?tab=people`, label: `People (${active.length})` },
        ]}
      />

      {query.check && (
        <p className={ui.error} role="alert">
          The brokerage was created, but part of its file could not be saved ({query.check.replace(/[^a-z,]/g, "").split(",").join(", ")}). Add it below.
        </p>
      )}

      {tab === "overview" && (
        <>
      <Card title="Plan and seats" aside={<span className={ui.soft}>What this brokerage is contracted for</span>}>
        <ActionForm action={setAccount}>
          <input type="hidden" name="id" value={ws.id} />
          <div className={ui.formRow}>
            <label className={ui.field}>
              Plan
              <select className={ui.select} name="plan" defaultValue={ws.plan_name}>
                {PLANS.map((plan) => (
                  <option key={plan.key} value={plan.key}>{plan.label} · {plan.blurb}</option>
                ))}
              </select>
            </label>
            <label className={ui.field}>
              Quoted price per month (empty = list prices)
              <input className={ui.input} name="quote" inputMode="decimal" defaultValue={ws.quoted_monthly ?? ""} maxLength={12} />
            </label>
          </div>
          <div className={ui.formRow}>
            <label className={ui.field}>
              Agent seats (empty = no limit)
              <input className={ui.input} name="agent_seats" inputMode="numeric" defaultValue={ws.agent_seats ?? ""} maxLength={7} />
            </label>
            <label className={ui.field}>
              Owner / Admin seats
              <input className={ui.input} name="owner_seats" inputMode="numeric" defaultValue={ws.owner_seats} required maxLength={3} />
            </label>
          </div>
          <p className={ui.help}>
            Seats cover the whole brokerage across all its offices and teams. Agent seats are a count to bill against: going
            over is shown here and on the console, and never blocks the brokerage from onboarding. Owner / Admin seats are
            enforced: the brokerage cannot add another owner until you raise the number.
          </p>
          <div><Submit>Save plan and seats</Submit></div>
        </ActionForm>
      </Card>

      <Card title="Plan" aside={<span className={ui.soft}>{PLAN_PIECES.filter((piece) => pieceUnlocked(ws, piece.key)).length} of {PLAN_PIECES.length} unlocked</span>}>
        <ul className={ui.list}>
          {PLAN_PIECES.map((piece) => (
            <li key={piece.key}>
              <div className={ui.inline}>
                <span className={ui.strong}>{piece.label}</span>
                <span className={ui.soft}>{piece.kind === "product" ? "Product" : "Add-on"} · {money(piece.perAgent)} per agent a month</span>
                <PieceToggle brokerageId={ws.id} brokerageName={ws.name} piece={piece.key} label={piece.label} unlocked={pieceUnlocked(ws, piece.key)} />
              </div>
              <span className={ui.soft}>When locked: {piece.locks}</span>
            </li>
          ))}
        </ul>
        <p className={ui.help}>
          Locking takes effect for everyone in the brokerage at once and deletes nothing; unlocking brings everything back as it
          was. Products are enforced by the database for every role. Add-ons are gated by the app’s pages and navigation. Ops
          and Finance cannot both be locked: pause the brokerage instead.
        </p>
      </Card>

      <div className={ui.grid2}>
        <Card title="Name and status">
          <ActionForm action={updateBrokerage}>
            <input type="hidden" name="id" value={ws.id} />
            <div className={ui.formRow}>
              <label className={ui.field}>
                Name
                <input className={ui.input} name="name" defaultValue={ws.name} required minLength={2} maxLength={120} autoComplete="off" />
              </label>
              <label className={ui.field}>
                Status
                <select className={ui.select} name="status" defaultValue={ws.status}>
                  {WORKSPACE_STATUSES.map((status) => (
                    <option key={status} value={status}>{titleCase(status)}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className={ui.help}>
              Paused and closed brokerages cannot be used by their own people; staff can still open them. Nothing is deleted.
            </p>
            <div>
              <Submit>Save</Submit>
            </div>
          </ActionForm>
        </Card>

        <Card title="Monthly estimate">
          {price.lines.length ? (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Piece</th>
                    <th scope="col" className={ui.num}>Per agent</th>
                    <th scope="col" className={ui.num}>{agents} agents</th>
                  </tr>
                </thead>
                <tbody>
                  {price.lines.map((line) => (
                    <tr key={line.label}>
                      <th scope="row" className={styles.rowHead}>{line.label}</th>
                      <td className={ui.num}>{money(line.perAgent)}</td>
                      <td className={ui.num}>{money(line.monthly)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className={styles.rowHead}>Subtotal</th>
                    <td className={ui.num}>{money(price.perAgent)}</td>
                    <td className={ui.num}>{money(price.subtotal)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className={`${styles.rowHead} ${ui.strong}`}>Estimate per month</th>
                    <td />
                    <td className={`${ui.num} ${ui.strong}`}>{money(price.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No products are switched on, so there is nothing to price.</Empty>
          )}
          <p className={ui.help}>
            Worked out from the starting prices per agent per month and the {agents} agents on file.{" "}
            {price.minimumApplies
              ? `The subtotal is below the minimum of about ${money(MONTHLY_MINIMUM)} a month, so the minimum is shown.`
              : `The minimum is about ${money(MONTHLY_MINIMUM)} a month.`}{" "}
            Bundle pricing and the one-time setup fee are agreed by hand and are not included. This is an estimate, not an invoice.
          </p>
        </Card>
      </div>

        </>
      )}

      {tab === "billing" && (
        <>
          <Card title="File a month" aside={<span className={ui.soft}>Invoice sent, and the proof of payment that came in</span>}>
            <ActionForm action={fileMonth} resetOnSuccess>
              <input type="hidden" name="id" value={ws.id} />
              <div className={ui.formRow}>
                <label className={ui.field}>
                  Month
                  <input className={ui.input} name="month" type="month" defaultValue={thisMonth.slice(0, 7)} required />
                </label>
                <label className={ui.field}>
                  Invoice amount
                  <input className={ui.input} name="amount" inputMode="decimal" placeholder="$" maxLength={12} />
                </label>
                <label className={ui.field}>
                  Invoice number
                  <input className={ui.input} name="invoice_no" maxLength={60} autoComplete="off" />
                </label>
              </div>
              <DropZone name="invoice" label="Invoice sent to the client" />
              <DropZone name="proof" label="Proof of payment from Square" />
              <div className={ui.formRow}>
                <label className={ui.field}>
                  Square payment reference
                  <input className={ui.input} name="payment_ref" maxLength={80} autoComplete="off" />
                </label>
                <label className={ui.field}>
                  Paid on
                  <input className={ui.input} name="paid_on" type="date" />
                </label>
              </div>
              <label className={ui.field}>
                Note
                <input className={ui.input} name="note" maxLength={500} />
              </label>
              <p className={ui.help}>
                A new month needs its invoice and amount. To add the proof of payment later, choose the same month and drop
                only the proof: everything already filed for that month is kept.
              </p>
              <div><Submit busy="Filing…">File this month</Submit></div>
            </ActionForm>
          </Card>

          <Card title="Billing record" aside={<span className={ui.soft}>{months.filter((month) => month.proof_path || month.paid_on).length} of {months.length} paid</span>}>
            {months.length ? (
              years.map((year) => (
                <div key={year}>
                  <p className={kinu.year}>{year}</p>
                  <ul className={ui.list}>
                    {months.filter((month) => month.month.startsWith(year)).map((month) => {
                      const paid = Boolean(month.proof_path || month.paid_on);
                      return (
                        <li key={month.id}>
                          <div className={kinu.month}>
                            <span>
                              <span className={ui.strong}>{monthLabel(month.month)}</span>
                              {month.amount !== null && <span className={ui.soft}> · {money(Number(month.amount))}</span>}
                              {month.note && <><br /><span className={ui.soft}>{month.note}</span></>}
                            </span>
                            <span>
                              {month.invoice_path ? (
                                <a className={ui.rowLink} href={`${here}/files/${month.id}/invoice`} target="_blank" rel="noopener noreferrer">
                                  Invoice{month.invoice_no ? ` ${month.invoice_no}` : ""}<span className="sr-only"> for {monthLabel(month.month)} (opens in a new tab)</span>
                                </a>
                              ) : (
                                <span className={ui.soft}>No invoice filed</span>
                              )}
                            </span>
                            <span>
                              {month.proof_path ? (
                                <a className={ui.rowLink} href={`${here}/files/${month.id}/proof`} target="_blank" rel="noopener noreferrer">
                                  Proof of payment<span className="sr-only"> for {monthLabel(month.month)} (opens in a new tab)</span>
                                </a>
                              ) : (
                                <span className={ui.soft}>No proof yet</span>
                              )}
                              {(month.payment_ref || month.paid_on) && (
                                <><br /><span className={ui.soft}>{[month.payment_ref, month.paid_on && `paid ${day(month.paid_on)}`].filter(Boolean).join(" · ")}</span></>
                              )}
                            </span>
                            <Badge tone={paid ? "ok" : "warn"}>{paid ? "Paid" : "Awaiting payment"}</Badge>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            ) : (
              <Empty>Nothing filed yet. File the first invoice above.</Empty>
            )}
          </Card>

          <Card title="Charging from Kinu">
            <Placeholder service="Square or Stripe (billing)">
              Today you invoice and take payment in Square, then file both here. Connecting a billing service would create
              the invoice and file the proof by itself each month.
            </Placeholder>
          </Card>
        </>
      )}

      {tab === "contracts" && (
        <>
          <Card title="File a contract" aside={<span className={ui.soft}>Usually once a year</span>}>
            <ActionForm action={addContract} resetOnSuccess>
              <input type="hidden" name="id" value={ws.id} />
              <div className={ui.formRow}>
                <label className={ui.field}>
                  Title
                  <input className={ui.input} name="title" defaultValue="Service agreement" maxLength={120} />
                </label>
                <label className={ui.field}>
                  Starts
                  <input className={ui.input} name="starts_on" type="date" required />
                </label>
                <label className={ui.field}>
                  Ends
                  <input className={ui.input} name="ends_on" type="date" required />
                </label>
              </div>
              <DropZone name="contract" label="The signed contract" required />
              <label className={ui.field}>
                Note
                <input className={ui.input} name="note" maxLength={500} />
              </label>
              <div><Submit busy="Filing…">File contract</Submit></div>
            </ActionForm>
          </Card>
          <Card title="Contracts on file">
            {contracts.length ? (
              <ul className={ui.list}>
                {contracts.map((contract) => {
                  const live = contract.ends_on >= todayIso();
                  return (
                    <li key={contract.id}>
                      <div className={ui.inline} style={{ justifyContent: "space-between" }}>
                        <span>
                          <a className={ui.rowLink} href={`${here}/files/${contract.id}/contract`} target="_blank" rel="noopener noreferrer">
                            {contract.title}<span className="sr-only"> (opens in a new tab)</span>
                          </a>
                          <span className={ui.soft}> · {day(contract.starts_on)} to {day(contract.ends_on)}</span>
                          {contract.note && <><br /><span className={ui.soft}>{contract.note}</span></>}
                        </span>
                        <span className={ui.inline}>
                          <Badge tone={live ? "ok" : "muted"}>{live ? "In force" : "Ended"}</Badge>
                          <ActionForm action={removeContract} className={ui.inline}>
                            <input type="hidden" name="id" value={ws.id} />
                            <input type="hidden" name="contract" value={contract.id} />
                            <Submit small variant="link">Remove<span className="sr-only"> {contract.title}</span></Submit>
                          </ActionForm>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>No contract filed yet.</Empty>
            )}
          </Card>
        </>
      )}

      {tab === "people" && (
        <>
      <div className={ui.grid2}>
        <Card title="People" aside={<span className={ui.soft}>{active.length} active</span>}>
          {members.length ? (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.user_id}>
                      <th scope="row" className={styles.rowHead}>
                        <span className={ui.strong}>{member.display_name ?? member.email ?? "No name yet"}</span>
                        {member.display_name && member.email && <><br /><span className={ui.soft}>{member.email}</span></>}
                      </th>
                      <td>
                        {member.custom_role_id ? customRoles.get(member.custom_role_id) ?? "Custom role" : roleLabel(member.role)}
                        {(member.can_override || member.can_release_payroll) && (
                          <><br /><span className={ui.soft}>
                            {[member.can_override && "Override", member.can_release_payroll && "Release payroll"].filter(Boolean).join(" · ")}
                          </span></>
                        )}
                      </td>
                      <td><Badge tone={member.status === "active" ? "ok" : "muted"}>{titleCase(member.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nobody has access yet. Invite an owner to get this brokerage started.</Empty>
          )}
          <p className={ui.help}>To change roles or remove someone, open this brokerage and use Settings, then People and roles.</p>
        </Card>

        <div className={ui.stack}>
          <Card title="Invite an owner">
            <ActionForm action={inviteOwner} resetOnSuccess>
              <input type="hidden" name="id" value={ws.id} />
              <label className={ui.field}>
                Owner’s work email
                <input className={ui.input} name="email" type="email" required maxLength={254} autoComplete="off" />
              </label>
              <p className={ui.help}>
                They are added as Owner / Admin and use one of this brokerage’s {ws.owner_seats} Owner / Admin seat{ws.owner_seats === 1 ? "" : "s"}; raise the number under Plan and account to add more. Someone who already has a login joins straight away. For someone new, the
                invitation waits: open this brokerage and invite them again from Settings, People and roles, which also
                creates their login once the server key is in place.
              </p>
              <div>
                <Submit>Invite owner</Submit>
              </div>
            </ActionForm>
          </Card>

          <Card title="Pending invitations">
            {invites.length ? (
              <ul className={ui.list}>
                {invites.map((invite) => (
                  <li key={invite.id}>
                    <span className={ui.strong}>{invite.email}</span>
                    <br />
                    <span className={ui.soft}>{roleLabel(invite.role)} · invited {day(invite.created_at, ws.timezone)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No invitations are waiting.</Empty>
            )}
          </Card>
        </div>
      </div>

      <Card title="Recent activity" aside={<span className={ui.soft}>Last 25 entries</span>}>
        <AuditTable rows={audit} timeZone={ws.timezone} empty="Nothing has been recorded for this brokerage yet." />
      </Card>
        </>
      )}
    </div>
  );
}

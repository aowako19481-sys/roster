import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, ButtonLink, Card, Empty, PageHeader, Placeholder, Stat, ui, type Tone } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/access";
import { ADDONS, MONTHLY_MINIMUM, WORKSPACE_STATUSES, priceEstimate, type AuditRow } from "@/lib/admin-pages";
import { BRAND } from "@/lib/brand";
import { day, money, titleCase } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { switchWorkspace } from "../../actions";
import { AuditTable } from "../../settings/audit/AuditTable";
import { inviteOwner, updateBrokerage } from "../actions";

export const metadata: Metadata = { title: "Brokerage" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_TONE: Record<string, Tone> = { active: "ok", paused: "warn", closed: "muted" };

type Props = { params: Promise<{ id: string }> };

type Member = {
  user_id: string; role: string; display_name: string | null; email: string | null; status: string;
  custom_role_id: string | null; can_override: boolean; can_release_payroll: boolean; created_at: string;
};

export default async function BrokeragePage({ params }: Props) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, timezone, status, has_ops, has_finance, addons, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!ws) notFound();

  const [membersRes, invitesRes, rolesRes, auditRes, overviewRes] = await Promise.all([
    supabase.from("workspace_members")
      .select("user_id, role, display_name, email, status, custom_role_id, can_override, can_release_payroll, created_at")
      .eq("workspace_id", id).order("created_at").limit(500),
    supabase.from("member_invites").select("id, email, role, created_at, accepted_at")
      .eq("workspace_id", id).is("accepted_at", null).order("created_at", { ascending: false }).limit(200),
    supabase.from("custom_roles").select("id, name").eq("workspace_id", id).limit(200),
    supabase.from("audit_log").select("id, actor_label, action, entity, entity_id, summary, detail, at")
      .eq("workspace_id", id).order("at", { ascending: false }).limit(25),
    supabase.rpc("platform_overview"),
  ]);

  const members = (membersRes.data ?? []) as Member[];
  const invites = invitesRes.data ?? [];
  const customRoles = new Map((rolesRes.data ?? []).map((role) => [role.id as string, role.name as string]));
  const audit = (auditRes.data ?? []) as AuditRow[];
  const overview = (Array.isArray(overviewRes.data) ? overviewRes.data : []) as { id: string; agents: number; members: number }[];
  const agents = Number(overview.find((row) => row.id === id)?.agents ?? 0);
  const addons: string[] = ws.addons ?? [];
  const price = priceEstimate({ hasOps: ws.has_ops, hasFinance: ws.has_finance, addons }, agents);
  const active = members.filter((member) => member.status === "active");

  return (
    <div className={ui.stack}>
      <PageHeader eyebrow={`${BRAND} staff · Brokerage`} title={ws.name} sub={`Created ${day(ws.created_at)} · ${ws.timezone}`}>
        <ButtonLink href="/kinu">All brokerages</ButtonLink>
        <form action={switchWorkspace}>
          <input type="hidden" name="ws" value={ws.id} />
          <button type="submit" className={ui.btnPrimary}>Open this brokerage</button>
        </form>
      </PageHeader>

      <section className={`${ui.card} ${ui.pad} ${ui.grid4}`} aria-label="At a glance">
        <Stat label="Status" value={<Badge tone={STATUS_TONE[ws.status] ?? "plain"}>{titleCase(ws.status)}</Badge>} />
        <Stat label="People" value={active.length} note="with access" />
        <Stat label="Agents" value={agents} note="on file" />
        <Stat label="Estimate" value={money(price.total)} note="per month" />
      </section>

      <div className={ui.grid2}>
        <Card title="Plan and status">
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
            <div role="group" aria-labelledby="plan-products" className={ui.inline}>
              <span id="plan-products" className={ui.help}>Products</span>
              <label className={ui.check}><input type="checkbox" name="ops" defaultChecked={ws.has_ops} /> Ops</label>
              <label className={ui.check}><input type="checkbox" name="finance" defaultChecked={ws.has_finance} /> Finance</label>
            </div>
            <div role="group" aria-labelledby="plan-addons" className={ui.inline}>
              <span id="plan-addons" className={ui.help}>Add-ons</span>
              {ADDONS.map((addon) => (
                <label key={addon.key} className={ui.check}>
                  <input type="checkbox" name={`addon_${addon.key}`} defaultChecked={addons.includes(addon.key)} /> {addon.label}
                </label>
              ))}
            </div>
            <p className={ui.help}>
              Switching a product off hides its pages and blocks its actions for everyone in the brokerage at once. Nothing
              is deleted. Paused and closed brokerages cannot be used by their own people; staff can still open them.
            </p>
            <div>
              <Submit>Save plan</Submit>
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
                      <th scope="row">{line.label}</th>
                      <td className={ui.num}>{money(line.perAgent)}</td>
                      <td className={ui.num}>{money(line.monthly)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Subtotal</th>
                    <td className={ui.num}>{money(price.perAgent)}</td>
                    <td className={ui.num}>{money(price.subtotal)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className={ui.strong}>Estimate per month</th>
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

      <Card title="Billing">
        <Placeholder service="Stripe (billing)">
          Invoices, ACH Direct Debit and the customer portal will connect here. Until then nothing is charged from {BRAND}:
          the first clients pay by direct bank payment, and the estimate above is the figure to invoice by hand.
        </Placeholder>
      </Card>

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
                      <th scope="row">
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
                They are added as Owner / Admin. Someone who already has a login joins straight away. For someone new, the
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
    </div>
  );
}

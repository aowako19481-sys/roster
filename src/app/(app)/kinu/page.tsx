import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { Badge, Card, Empty, PageHeader, Stat, ui, type Tone } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/access";
import { ADDONS, TIMEZONES, addonLabel } from "@/lib/admin-pages";
import { BRAND } from "@/lib/brand";
import { day, titleCase } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { switchWorkspace } from "../actions";
import { createBrokerage } from "./actions";

export const metadata: Metadata = { title: "Console" };

type Row = {
  id: string;
  name: string;
  status: string;
  has_ops: boolean;
  has_finance: boolean;
  addons: string[] | null;
  created_at: string;
  members: number;
  agents: number;
  pending_invites: number;
};

const STATUS_TONE: Record<string, Tone> = { active: "ok", paused: "warn", closed: "muted" };

export default async function ConsolePage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_overview");
  const rows = (Array.isArray(data) ? data : []) as Row[];

  const total = (pick: (row: Row) => number) => rows.reduce((sum, row) => sum + Number(pick(row) ?? 0), 0);

  return (
    <div className={ui.stack}>
      <PageHeader
        eyebrow={`${BRAND} staff`}
        title="Console"
        sub="Every brokerage, what it has switched on, and who is in it. Only staff can see this page."
      />

      <section className={`${ui.card} ${ui.pad} ${ui.grid4}`} aria-label="Totals">
        <Stat label="Brokerages" value={rows.length} note={`${rows.filter((row) => row.status === "active").length} active`} />
        <Stat label="People" value={total((row) => row.members)} note="staff with access" />
        <Stat label="Agents" value={total((row) => row.agents)} note="across all brokerages" />
        <Stat label="Pending invitations" value={total((row) => row.pending_invites)} note="waiting for a first sign-in" />
      </section>

      <Card title="All brokerages">
        {error ? (
          <Empty>The list could not be loaded. Try again in a moment.</Empty>
        ) : rows.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Brokerage</th>
                  <th scope="col">Status</th>
                  <th scope="col">Products</th>
                  <th scope="col">Add-ons</th>
                  <th scope="col" className={ui.num}>People</th>
                  <th scope="col" className={ui.num}>Agents</th>
                  <th scope="col" className={ui.num}>Invites</th>
                  <th scope="col">Created</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <Link href={`/kinu/${row.id}`} className={ui.rowLink}>{row.name}</Link>
                    </th>
                    <td><Badge tone={STATUS_TONE[row.status] ?? "plain"}>{titleCase(row.status)}</Badge></td>
                    <td>
                      <span className={ui.inline}>
                        {row.has_ops && <Badge tone="dark">Ops</Badge>}
                        {row.has_finance && <Badge tone="dark">Finance</Badge>}
                        {!row.has_ops && !row.has_finance && <span className={ui.soft}>None</span>}
                      </span>
                    </td>
                    <td className={ui.soft}>{(row.addons ?? []).length ? (row.addons ?? []).map(addonLabel).join(" · ") : "None"}</td>
                    <td className={ui.num}>{row.members}</td>
                    <td className={ui.num}>{row.agents}</td>
                    <td className={ui.num}>{row.pending_invites}</td>
                    <td className={ui.soft}>{day(row.created_at)}</td>
                    <td>
                      <span className={ui.inline}>
                        <Link href={`/kinu/${row.id}`} className={`${ui.btn} ${ui.small}`}>
                          Manage<span className="sr-only"> {row.name}</span>
                        </Link>
                        <form action={switchWorkspace}>
                          <input type="hidden" name="ws" value={row.id} />
                          <button type="submit" className={`${ui.btnPrimary} ${ui.small}`}>
                            Open<span className="sr-only"> {row.name}</span>
                          </button>
                        </form>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No brokerages yet. Create the first one below.</Empty>
        )}
      </Card>

      <Card title="New brokerage">
        <ActionForm action={createBrokerage}>
          <div className={ui.formRow}>
            <label className={ui.field}>
              Brokerage name
              <input className={ui.input} name="name" required minLength={2} maxLength={120} autoComplete="off" />
            </label>
            <label className={ui.field}>
              Time zone
              <select className={ui.select} name="timezone" defaultValue="America/New_York">
                {TIMEZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>{zone.label}</option>
                ))}
              </select>
            </label>
            <label className={ui.field}>
              Owner’s email (optional)
              <input className={ui.input} name="owner_email" type="email" maxLength={254} autoComplete="off" />
            </label>
          </div>
          <div role="group" aria-labelledby="new-products" className={ui.inline}>
            <span id="new-products" className={ui.help}>Products</span>
            <label className={ui.check}><input type="checkbox" name="ops" defaultChecked /> Ops</label>
            <label className={ui.check}><input type="checkbox" name="finance" defaultChecked /> Finance</label>
          </div>
          <div role="group" aria-labelledby="new-addons" className={ui.inline}>
            <span id="new-addons" className={ui.help}>Add-ons</span>
            {ADDONS.map((addon) => (
              <label key={addon.key} className={ui.check}>
                <input type="checkbox" name={`addon_${addon.key}`} /> {addon.label}
              </label>
            ))}
          </div>
          <p className={ui.help}>
            A “Main office” is created with the brokerage. If you give an owner’s email, that person is invited as
            Owner / Admin: they join straight away if they already have a login, otherwise the invitation waits for
            their first sign-in.
          </p>
          <div>
            <Submit>Create brokerage</Submit>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

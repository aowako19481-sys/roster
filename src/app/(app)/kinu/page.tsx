import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, Empty, PageHeader, Stat, ui, type Tone } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/access";
import { ADDONS, BILLING_LABEL, WORKSPACE_STATUSES, addonLabel, planLabel, priceEstimate } from "@/lib/admin-pages";
import { BRAND } from "@/lib/brand";
import { day, money, titleCase } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { switchWorkspace } from "../actions";
import { FounderDashboard, type Pulse } from "./FounderDashboard";
import styles from "./kinu.module.css";

export const metadata: Metadata = { title: "Console" };

type Row = {
  id: string; account_no?: number; name: string; status: string; has_ops: boolean; has_finance: boolean; addons: string[] | null; created_at: string;
  plan_name: string; owner_seats: number; agent_seats: number | null; quoted_monthly: number | null; billing: string;
  agents: number; offices: number; members: number; owners: number; contract_ends: string | null;
};
type Found = { total: number; all: number; unpaid: number; rows: Row[] };

const STATUS_TONE: Record<string, Tone> = { active: "ok", paused: "warn", closed: "muted" };
const BILLING_TONE: Record<string, Tone> = { paid: "ok", invoiced: "warn", none: "muted" };
const PAGE_SIZE = 24;

type Props = { searchParams: Promise<{ q?: string; status?: string; billing?: string; page?: string }> };

export default async function ConsolePage({ searchParams }: Props) {
  const access = await requirePlatformAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);
  const status = (WORKSPACE_STATUSES as readonly string[]).includes(params.status ?? "") ? params.status! : "";
  const billing = ["paid", "invoiced", "none"].includes(params.billing ?? "") ? params.billing! : "";
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_brokerages", {
    search: q || null, only_status: status || null, only_billing: billing || null, page_no: page, page_size: PAGE_SIZE,
  });
  const found = (data ?? { total: 0, all: 0, unpaid: 0, rows: [] }) as Found;
  // The founder also gets the whole-business view above the list.
  const pulse = access.isFounder ? ((await supabase.rpc("platform_pulse")).data as Pulse | null) : null;
  const pages = Math.max(1, Math.ceil(found.total / PAGE_SIZE));
  const link = (to: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (billing) next.set("billing", billing);
    if (to > 1) next.set("page", String(to));
    const query = next.toString();
    return query ? `/kinu?${query}` : "/kinu";
  };

  return (
    <div className={ui.stack}>
      {pulse ? (
        <FounderDashboard pulse={pulse} firstName={access.displayName.split(" ")[0] ?? access.displayName} />
      ) : (
        <>
      <PageHeader eyebrow={`${BRAND} staff`} title="Console" sub="Every brokerage account. Nothing inside a brokerage is shown until you open it.">
        <ButtonLink href="/kinu/inbox">Website inbox</ButtonLink>
        <ButtonLink href="/kinu/new" primary>
          New brokerage
        </ButtonLink>
      </PageHeader>

      <section className={`${ui.card} ${ui.pad} ${ui.grid3}`} aria-label="Totals">
        <Stat label="Brokerages" value={found.all.toLocaleString("en-US")} note="accounts on file" />
        <Stat label="Matching this search" value={found.total.toLocaleString("en-US")} note={q || status || billing ? "filtered" : "showing all"} />
        <Stat label="Not yet paid this month" value={found.unpaid.toLocaleString("en-US")} note="active accounts in this search" />
      </section>

        </>
      )}

      <Card title="Find a brokerage">
        <form className={styles.filters} action="/kinu" method="get" role="search">
          <label className={styles.search}>
            Name or account number
            <input className={ui.input} type="search" name="q" defaultValue={q} placeholder="A brokerage name, or KN-100001" maxLength={80} />
          </label>
          <label>
            Status
            <select className={ui.select} name="status" defaultValue={status}>
              <option value="">Any status</option>
              {WORKSPACE_STATUSES.map((value) => (
                <option key={value} value={value}>{titleCase(value)}</option>
              ))}
            </select>
          </label>
          <label>
            This month’s billing
            <select className={ui.select} name="billing" defaultValue={billing}>
              <option value="">Any</option>
              <option value="paid">{BILLING_LABEL.paid}</option>
              <option value="invoiced">{BILLING_LABEL.invoiced}</option>
              <option value="none">{BILLING_LABEL.none}</option>
            </select>
          </label>
          <button type="submit" className={ui.btnPrimary}>Search</button>
          {(q || status || billing) && <ButtonLink href="/kinu">Clear</ButtonLink>}
        </form>
      </Card>

      {error ? (
        <Card title="Brokerages">
          <Empty>The console needs the latest setup file to be run in Supabase before it can list brokerages.</Empty>
        </Card>
      ) : found.rows.length ? (
        <>
          <div className={styles.grid}>
            {found.rows.map((row) => {
              const addons = row.addons ?? [];
              const estimate = priceEstimate({ hasOps: row.has_ops, hasFinance: row.has_finance, addons }, Number(row.agents));
              const overSeats = row.agent_seats !== null && Number(row.agents) > row.agent_seats;
              return (
                <article key={row.id} className={styles.id}>
                  <div className={styles.idHead}>
                    <div style={{ minWidth: 0 }}>
                      <span className={styles.no}>{row.account_no ? `KN-${row.account_no}` : `ID ${row.id.slice(0, 8).toUpperCase()}`} · since {day(row.created_at)}</span>
                      <h2 className={styles.idName}>
                        <Link href={`/kinu/${row.id}`}>{row.name}</Link>
                      </h2>
                    </div>
                    <Badge tone={STATUS_TONE[row.status] ?? "plain"}>{titleCase(row.status)}</Badge>
                  </div>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Plan</dt>
                      <dd>{planLabel(row.plan_name)}</dd>
                    </div>
                    <div>
                      <dt>Agent seats</dt>
                      <dd className={overSeats ? styles.over : undefined}>
                        {Number(row.agents).toLocaleString("en-US")}
                        {row.agent_seats !== null ? ` of ${row.agent_seats.toLocaleString("en-US")}` : ""}
                        {overSeats && <span className="sr-only"> (over the seats in the plan)</span>}
                      </dd>
                    </div>
                    <div>
                      <dt>Owner seats</dt>
                      <dd>{row.owners} of {row.owner_seats}</dd>
                    </div>
                    <div>
                      <dt>Offices</dt>
                      <dd>{row.offices}</dd>
                    </div>
                    <div>
                      <dt>Monthly</dt>
                      <dd>{row.quoted_monthly !== null ? money(Number(row.quoted_monthly)) : `${money(estimate.total)} est.`}</dd>
                    </div>
                    <div>
                      <dt>Contract to</dt>
                      <dd>{row.contract_ends ? day(row.contract_ends) : "None filed"}</dd>
                    </div>
                  </dl>
                  <div className={styles.chips} aria-label="What is switched on">
                    <span className={`${styles.chip} ${row.has_ops ? styles.chipOn : ""}`}>Ops{row.has_ops ? "" : " · locked"}</span>
                    <span className={`${styles.chip} ${row.has_finance ? styles.chipOn : ""}`}>Finance{row.has_finance ? "" : " · locked"}</span>
                    {ADDONS.filter((addon) => addons.includes(addon.key)).map((addon) => (
                      <span key={addon.key} className={`${styles.chip} ${styles.chipOn}`}>{addonLabel(addon.key)}</span>
                    ))}
                  </div>
                  <div className={styles.idFoot}>
                    <Badge tone={BILLING_TONE[row.billing] ?? "plain"}>{BILLING_LABEL[row.billing] ?? row.billing}</Badge>
                    <span className={ui.inline}>
                      <Link href={`/kinu/${row.id}`} className={`${ui.btn} ${ui.small}`}>
                        File<span className="sr-only"> for {row.name}</span>
                      </Link>
                      <form action={switchWorkspace}>
                        <input type="hidden" name="ws" value={row.id} />
                        <button type="submit" className={`${ui.btnPrimary} ${ui.small}`}>
                          Open<span className="sr-only"> {row.name}</span>
                        </button>
                      </form>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
          <nav className={styles.pager} aria-label="Pages">
            <span className={ui.soft}>
              Page {page} of {pages.toLocaleString("en-US")} · {found.total.toLocaleString("en-US")} brokerages
            </span>
            <span className={ui.inline}>
              {page > 1 && <ButtonLink href={link(page - 1)}>Previous</ButtonLink>}
              {page < pages && <ButtonLink href={link(page + 1)}>Next</ButtonLink>}
            </span>
          </nav>
        </>
      ) : (
        <Card title="Brokerages">
          <Empty>{q || status || billing ? "No brokerage matches that search." : "No brokerages yet. Create the first one with New brokerage."}</Empty>
        </Card>
      )}
    </div>
  );
}

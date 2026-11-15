import Link from "next/link";
import { ButtonLink, ui } from "@/components/ui";
import { monthLabel } from "@/lib/admin-pages";
import { day, money } from "@/lib/format";
import { CountUp, PaidChart } from "./FounderWidgets";
import styles from "./founder.module.css";

export type Pulse = {
  brokerages: number; active: number; paused: number; agents: number; seats: number; staff: number;
  quoted: number; unquoted: number; billed_now: number; paid_now: number; open_leads: number;
  months: { month: string; billed: number; paid: number; joined: number }[];
  awaiting: { id: string; name: string; account_no: number; month: string; amount: number | null }[];
  ending: { id: string; name: string; account_no: number; ends_on: string }[];
  newest: { id: string; name: string; account_no: number; created_at: string; plan_name: string }[];
};

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** The founder's view of the whole business. Totals only: nothing from inside a brokerage. */
export function FounderDashboard({ pulse, firstName }: { pulse: Pulse; firstName: string }) {
  const months = pulse.months ?? [];
  const points = months.map((entry) => ({
    label: monthLabel(entry.month).slice(0, 3),
    long: monthLabel(entry.month),
    paid: Number(entry.paid),
    billed: Number(entry.billed),
  }));
  const billed = Number(pulse.billed_now);
  const paid = Number(pulse.paid_now);
  const collected = billed > 0 ? Math.round((paid / billed) * 100) : 0;
  const joinedThisMonth = Number(months[months.length - 1]?.joined ?? 0);
  const needs = pulse.awaiting.length + pulse.ending.length + (pulse.open_leads ? 1 : 0);

  return (
    <>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Founder console · {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" }).format(new Date())}</p>
          <h1>{greeting()}, <span>{firstName}</span>.</h1>
          <p className={styles.quiet}>{needs ? `${needs} thing${needs === 1 ? "" : "s"} could use you today.` : "Nothing is waiting on you."}</p>
        </div>
        <div className={ui.inline}>
          <ButtonLink href="/kinu/inbox">Inbox{pulse.open_leads ? ` (${pulse.open_leads})` : ""}</ButtonLink>
          <ButtonLink href="/kinu/cabinet">Filing cabinet</ButtonLink>
          <ButtonLink href="/kinu/new" primary>New brokerage</ButtonLink>
        </div>
      </header>

      <section className={styles.tiles} aria-label="The business at a glance">
        <div className={styles.tile} style={{ ["--i" as string]: 0 }}>
          <span className={styles.eyebrow}>Brokerages</span>
          <span className={styles.value}><CountUp value={Number(pulse.brokerages)} /></span>
          <span className={styles.note}>{pulse.active} active{pulse.paused ? ` · ${pulse.paused} paused` : ""} · {joinedThisMonth} joined this month</span>
        </div>
        <div className={styles.tile} style={{ ["--i" as string]: 1 }}>
          <span className={styles.eyebrow}>Agents on Kinu</span>
          <span className={styles.value}><CountUp value={Number(pulse.agents)} /></span>
          <span className={styles.note}>{Number(pulse.seats).toLocaleString("en-US")} seats contracted · {pulse.staff} staff logins</span>
        </div>
        <div className={styles.tile} style={{ ["--i" as string]: 2 }}>
          <span className={styles.eyebrow}>Quoted per month</span>
          <span className={styles.value}><CountUp value={Number(pulse.quoted)} money /></span>
          <span className={styles.note}>{pulse.unquoted ? `${pulse.unquoted} active account${pulse.unquoted === 1 ? "" : "s"} with no quote yet` : "Every active account has a quote"}</span>
        </div>
        <div className={styles.tile} style={{ ["--i" as string]: 3 }}>
          <span className={styles.eyebrow}>Collected this month</span>
          <span className={styles.value}><CountUp value={paid} money /></span>
          <span className={styles.note}>{billed > 0 ? `${collected}% of ${money(billed)} invoiced` : "Nothing invoiced yet this month"}</span>
          <div className={styles.meter} role="img" aria-label={`${collected} percent of this month's invoices collected`}><i style={{ ["--w" as string]: `${collected}%` }} /></div>
        </div>
      </section>

      <section className={styles.split}>
        <div className={styles.panel} style={{ ["--i" as string]: 4 }}>
          <div className={styles.panelHead}>
            <h2>Payments received</h2>
            <span className={styles.quiet}>Last 12 months, from the proofs of payment you have filed</span>
          </div>
          <PaidChart points={points} />
          <details className={styles.table}>
            <summary>Show as a table</summary>
            <table>
              <thead><tr><th scope="col">Month</th><th scope="col">Invoiced</th><th scope="col">Received</th><th scope="col">New brokerages</th></tr></thead>
              <tbody>
                {months.map((entry) => (
                  <tr key={entry.month}><th scope="row">{monthLabel(entry.month)}</th><td>{money(Number(entry.billed))}</td><td>{money(Number(entry.paid))}</td><td>{entry.joined}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>

        <div className={styles.panel} style={{ ["--i" as string]: 5 }}>
          <div className={styles.panelHead}><h2>Needs you</h2><span className={styles.quiet}>{needs || "All clear"}</span></div>
          {pulse.open_leads > 0 && (
            <ul className={styles.needs}>
              <li><Link href="/kinu/inbox"><span>New messages from the website<small>Get started form</small></span><b>{pulse.open_leads}</b></Link></li>
            </ul>
          )}
          {pulse.awaiting.length > 0 && <p className={styles.group}>Invoiced, not yet paid</p>}
          <ul className={styles.needs}>
            {pulse.awaiting.map((row) => (
              <li key={`${row.id}-${row.month}`}>
                <Link href={`/kinu/${row.id}?tab=billing`}><span>{row.name}<small>KN-{row.account_no} · {monthLabel(row.month)}</small></span><b>{row.amount !== null ? money(Number(row.amount)) : ""}</b></Link>
              </li>
            ))}
          </ul>
          {pulse.ending.length > 0 && <p className={styles.group}>Contract ending within 60 days</p>}
          <ul className={styles.needs}>
            {pulse.ending.map((row) => (
              <li key={row.id}><Link href={`/kinu/${row.id}?tab=contracts`}><span>{row.name}<small>KN-{row.account_no}</small></span><b>{day(row.ends_on)}</b></Link></li>
            ))}
          </ul>
          {!needs && <p className={styles.quiet}>No unpaid invoices, no contracts about to end, no unanswered messages.</p>}
          {pulse.newest.length > 0 && <p className={styles.group}>Newest accounts</p>}
          <ul className={styles.needs}>
            {pulse.newest.slice(0, 4).map((row) => (
              <li key={row.id}><Link href={`/kinu/${row.id}`}><span>{row.name}<small>KN-{row.account_no}</small></span><b>{day(row.created_at)}</b></Link></li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CohortTable } from "@/components/dashboard/CohortTable";
import { HighRollers } from "@/components/dashboard/HighRollers";
import { LiveCounter } from "@/components/dashboard/LiveCounter";
import { NotificationsBell } from "@/components/dashboard/NotificationsBell";
import { getDashboardData, type Tone } from "@/lib/dashboard";
import { getMembership } from "@/lib/workspace";
import styles from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(now: Date, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function longDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("weekday")}, ${pick("day")} ${pick("month")}`;
}

function toneClass(tone: Tone) {
  return styles[tone] ?? "";
}

export default async function DashboardPage() {
  const membership = await getMembership();
  if (!membership) return null; // The layout shows the "no brokerage" message.

  const now = new Date();
  const tz = membership.timezone;
  const data = await getDashboardData(membership.workspaceId, tz);
  const firstName = membership.displayName.split(" ")[0] ?? membership.displayName;
  const lastRead = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(now);

  const [lead, ...otherApprovals] = data.approvals;
  const peak = data.timeline ? Math.max(...data.timeline.counts) : 0;

  const quick = [
    { href: "/invite", label: "Invite agents", meta: "new batch" },
    { href: "/riders", label: "Tier approvals", meta: `${membership.waitingApprovals} waiting` },
    { href: "/welcome-email", label: "Welcome email", meta: "preview" },
    { href: "/agent-onboarding", label: "Agent’s onboarding view", meta: "test it" },
    { href: "/reports", label: "Year-end 1099s", meta: String(now.getFullYear()) },
  ];

  const notes = [
    ...data.approvals.slice(0, 1).map((a) => ({
      id: `a-${a.id}`,
      title: `${a.name} ${a.reason}`,
      meta: "Rider change waiting for approval",
      href: "/riders",
    })),
    ...data.flags.map((f) => ({
      id: `f-${f.id}`,
      title: `${f.tag} · ${f.name}`,
      meta: "Needs a human check",
      href: "/files",
    })),
  ].slice(0, 4);

  return (
    <>
      <section className={styles.hero} aria-label="Today">
        <div className={`${styles.heroText} ${styles.r} ${styles.d1}`}>
          <p className={`brandLabel ${styles.eyebrow}`}>
            {longDate(now, tz)} · {data.cohortLabel}
          </p>
          <h1 className={styles.h1}>
            {greeting(now, tz)},
            <br />
            {firstName}
          </h1>
          <div className={styles.actions}>
            <Link href="/invite" className={`${styles.cta} press`}>
              Invite agents
              <span className={styles.ctaIcon} aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </Link>
            <Link href="/files" className={`${styles.pill} press`}>
              Files
            </Link>
            <NotificationsBell notes={notes} />
          </div>
        </div>
        <div className={`${styles.r} ${styles.d2}`}>
          <LiveCounter batches={data.batches} sent={data.totalSent} ready={data.totalReady} lastRead={lastRead} />
        </div>
      </section>

      <section aria-label={`${data.cohortLabel} progress`} className={`${styles.card} ${styles.stats} ${styles.r} ${styles.d3}`}>
        {data.stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <div className={styles.statMain}>
              <span className={styles.label}>{stat.label}</span>
              <span className={`display ${styles.statValue}`}>
                {stat.value}
                {stat.of !== null && (
                  <span className={styles.faint}>
                    <span className="sr-only"> of </span>
                    <span aria-hidden="true">/</span>
                    {stat.of}
                  </span>
                )}
              </span>
            </div>
            <span className={`${styles.statNote} ${toneClass(stat.noteTone)}`}>{stat.note}</span>
          </div>
        ))}
      </section>

      <div className={styles.bento}>
        <div className={`${styles.span12} ${styles.r} ${styles.d4}`}>
          <HighRollers rollers={data.rollers} />
        </div>
        <section className={`${styles.card} ${styles.pad} ${styles.tierCard} ${styles.span4} ${styles.r} ${styles.d4}`} aria-labelledby="tier-title">
          <div className={styles.cardHead}>
            <h2 id="tier-title" className={styles.h2}>
              Tier clearance
            </h2>
            <Link href="/riders" className={styles.more}>
              All approvals <span aria-hidden="true">→</span>
            </Link>
          </div>
          {lead ? (
            <>
              <div className={styles.tierLead}>
                <span className={styles.tierWho}>
                  {lead.name} {lead.reason}
                </span>
                <span className={`display ${styles.tierMove}`}>
                  <span className={styles.faint}>
                    {lead.fromPct}% <span aria-hidden="true">→</span>
                    <span className="sr-only">to</span>
                  </span>{" "}
                  {lead.toPct}%
                </span>
              </div>
              <div className={styles.tierButtons}>
                <button type="button" className={styles.approve} disabled aria-describedby="approve-note">
                  Approve
                </button>
                <Link href="/riders" className={`${styles.ghost} press`}>
                  View rider
                </Link>
              </div>
              <p id="approve-note" className={styles.tierNote}>
                Approving switches on in the next build step, with roles and the audit log.
              </p>
              {otherApprovals.slice(0, 1).map((other) => (
                <Link key={other.id} href={other.kind === "team" ? "/teams" : "/riders"} className={`${styles.lrow} ${styles.tierOther}`}>
                  <span>
                    {other.name}{" "}
                    <span className={styles.mute}>
                      · {other.fromPct}% <span aria-hidden="true">→</span>
                      <span className="sr-only">to</span> {other.toPct}%
                    </span>
                  </span>
                  <span className={styles.open}>Open</span>
                </Link>
              ))}
            </>
          ) : (
            <p className={styles.emptyNote}>Nothing is waiting for approval.</p>
          )}
        </section>
        <section className={`${styles.card} ${styles.pad} ${styles.chartCard} ${styles.span4} ${styles.r} ${styles.d5}`} aria-labelledby="chart-title">
          <div className={styles.cardHead}>
            <h2 id="chart-title" className={styles.h2}>
              Ready, every five minutes
            </h2>
            {data.timeline && <span className={styles.label}>Invited {data.timeline.invitedAt}</span>}
          </div>
          {data.timeline ? (
            <>
              <div role="img" aria-label={data.timeline.summary} className={styles.bars}>
                {data.timeline.counts.map((value, index) => (
                  <div
                    key={index}
                    className={`${styles.bar} ${value === peak ? styles.barPeak : ""}`}
                    style={{ height: `${peak ? (value / peak) * 100 : 0}%`, animationDelay: `${300 + index * 35}ms` }}
                  />
                ))}
              </div>
              <div className={styles.axis} aria-hidden="true">
                {data.timeline.axis.map((tick) => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.emptyNote}>No invites have gone out yet.</p>
          )}
        </section>

        <section className={`${styles.card} ${styles.pad} ${styles.flagCard} ${styles.span4} ${styles.r} ${styles.d5}`} aria-labelledby="flags-title">
          <div className={styles.cardHead}>
            <h2 id="flags-title" className={styles.h2}>
              Needs a human
            </h2>
            <span className={styles.label}>
              {data.flags.length} of {data.cohortSize}
            </span>
          </div>
          {data.flags.length ? (
            <ul className={styles.flagList}>
              {data.flags.map((flag) => (
                <li key={flag.id}>
                  <Link href="/files" className={`${styles.lrow} ${styles.flag}`}>
                    <span className={styles.flagTop}>
                      <span>{flag.name}</span>
                      <span className={styles.red}>{flag.tag}</span>
                    </span>
                    <span className={styles.flagDetail}>{flag.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyNote}>Nothing needs a person right now.</p>
          )}
        </section>
      </div>

      <div className={`${styles.r} ${styles.d6}`}>
        <CohortTable title={data.cohortLabel} rows={data.rows} />
      </div>

      <nav aria-labelledby="jump-title" className={`${styles.jump} ${styles.r} ${styles.d6}`}>
        <h2 id="jump-title" className={styles.h2}>
          Quick actions
        </h2>
        <ul className={styles.jumpList}>
          {quick.map((item) => (
            <li key={item.label}>
              <Link href={item.href} className={`${styles.card} ${styles.jumpLink}`}>
                <span className={`brandLabel ${styles.jumpMeta}`}>{item.meta}</span>
                <span className={`display ${styles.jumpLabel}`}>{item.label}</span>
                <span className={styles.jumpArrow} aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

type Tile = { href: string; label: string; icon: string };

const CORE: Tile[] = [
  { href: "/", label: "Home", icon: "M3 11 12 4l9 7v9h-6v-6H9v6H3z" },
  {
    href: "/agents",
    label: "Agents",
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  },
  { href: "/teams", label: "Teams", icon: "M12 3v5M5 13v-2h14v2M12 8v3M3 13h4v5H3zM10 13h4v5h-4zM17 13h4v5h-4z" },
  {
    href: "/riders",
    label: "Riders",
    icon: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",
  },
  {
    href: "/files",
    label: "Files",
    icon: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  },
  { href: "/reports", label: "Reports", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

const ADDONS: Tile[] = [
  { href: "/retention", label: "Retention", icon: "M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M12 7v5l3 3" },
  { href: "/payouts", label: "Payouts", icon: "M3 6h18v12H3zM3 10h18M7 15h3" },
  {
    href: "/exit-kit",
    label: "Exit kit",
    icon: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h11",
  },
];

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavTile({ tile, pathname, dashed }: { tile: Tile; pathname: string; dashed?: boolean }) {
  const current = isCurrent(pathname, tile.href);
  return (
    <li>
      <Link
        href={tile.href}
        aria-current={current ? "page" : undefined}
        className={`${styles.tile} ${dashed ? styles.tileDashed : ""} ${current ? styles.tileOn : ""}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d={tile.icon} />
        </svg>
        {tile.label}
      </Link>
    </li>
  );
}

export function Sidebar({
  displayName,
  initials,
  waitingApprovals,
  signOut,
}: {
  displayName: string;
  initials: string;
  waitingApprovals: number;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  const quick = [
    { href: "/invite", label: "Invite agents", meta: "+", metaLabel: "" },
    {
      href: "/riders",
      label: "Tier approvals",
      meta: String(waitingApprovals),
      metaLabel: `${waitingApprovals} waiting`,
    },
    { href: "/welcome-email", label: "Welcome email", meta: "view", metaLabel: "" },
    { href: "/agent-onboarding", label: "Agent’s onboarding view", meta: "test", metaLabel: "" },
    { href: "/reports", label: "Year-end 1099s", meta: String(year), metaLabel: "" },
  ];

  return (
    <nav aria-label="Main" className={styles.nav}>
      <div className={styles.top}>
        <Link href="/" className={styles.wordmark}>
          ROSTER
        </Link>
        <span className={styles.product}>Ops</span>
      </div>

      <form action="/agents" method="get" role="search" className={styles.search}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <label htmlFor="sidebar-search" className="sr-only">
          Search agents, licence numbers and teams
        </label>
        <input id="sidebar-search" type="search" name="q" placeholder="Agent, licence #, team" maxLength={80} autoComplete="off" />
      </form>

      <div className={styles.group}>
        <span className={styles.groupLabel} id="nav-onboarding">
          Onboarding
        </span>
        <ul className={styles.grid} aria-labelledby="nav-onboarding">
          {CORE.map((tile) => (
            <NavTile key={tile.href} tile={tile} pathname={pathname} />
          ))}
        </ul>
      </div>

      <div className={styles.group}>
        <span className={`${styles.groupLabel} ${styles.groupLabelSplit}`}>
          <span id="nav-addons">Add-ons</span>
          <span className={styles.unlocked}>unlocked for testing</span>
        </span>
        <ul className={styles.grid} aria-labelledby="nav-addons">
          {ADDONS.map((tile) => (
            <NavTile key={tile.href} tile={tile} pathname={pathname} dashed />
          ))}
        </ul>
      </div>

      <div className={styles.quick}>
        <span className={styles.quickLabel} id="nav-quick">
          Quick actions
        </span>
        <ul className={styles.quickList} aria-labelledby="nav-quick">
          {quick.map((item) => (
            <li key={item.label}>
              <Link href={item.href} className={styles.quickLink}>
                <span>{item.label}</span>
                <span className={styles.quickMeta} aria-label={item.metaLabel || undefined}>
                  {item.meta}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <form action={signOut} className={styles.account}>
        <span className={styles.avatar} aria-hidden="true">
          {initials}
        </span>
        <span className={styles.accountText}>
          <span className={styles.accountName}>{displayName}</span>
          <button type="submit" className={styles.signOut}>
            Sign out
          </button>
        </span>
      </form>
    </nav>
  );
}

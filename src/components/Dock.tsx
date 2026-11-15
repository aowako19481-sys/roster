"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Dock.module.css";

type Item = { href: string; label: string; icon: string };

const CORE: Item[] = [
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

// Add-ons: unlocked for testing until pricing tiers are set.
const ADDONS: Item[] = [
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

function DockLink({ item, pathname }: { item: Item; pathname: string }) {
  const current = isCurrent(pathname, item.href);
  return (
    <li>
      <Link href={item.href} aria-current={current ? "page" : undefined} className={`${styles.item} ${current ? styles.on : ""}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d={item.icon} />
        </svg>
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

/** Main navigation: a glass rail with its own column at the side of every page. */
export function Dock() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={styles.dock}>
      <ul className={styles.list}>
        {CORE.map((item) => (
          <DockLink key={item.href} item={item} pathname={pathname} />
        ))}
        <li className={styles.divider} role="presentation">
          <span className="sr-only">Add-ons, unlocked for testing</span>
        </li>
        {ADDONS.map((item) => (
          <DockLink key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}

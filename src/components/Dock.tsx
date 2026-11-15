"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Dock.module.css";

export type NavItem = { href: string; label: string; icon: string; locked?: boolean };
export type NavGroups = { ops: NavItem[]; finance: NavItem[]; addons: NavItem[]; admin: NavItem[] };

const FINANCE_PATHS = ["/finance", "/deals", "/payments", "/payroll", "/calculator", "/statements", "/payouts", "/templates"];
const LOCK = "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z";

function under(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Item({ item, pathname }: { item: NavItem; pathname: string }) {
  const current = under(pathname, item.href);
  return (
    <li>
      <Link
        href={item.locked ? `/locked?page=${encodeURIComponent(item.label)}` : item.href}
        aria-current={current ? "page" : undefined}
        className={`${styles.item} ${current ? styles.on : ""} ${item.locked ? styles.locked : ""}`}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d={item.locked ? LOCK : item.icon} />
        </svg>
        <span>{item.label}</span>
        {item.locked && <span className="sr-only"> (not in your plan)</span>}
      </Link>
    </li>
  );
}

/** Main navigation: a glass rail with its own column at the side of every page. */
export function Dock({ groups }: { groups: NavGroups }) {
  const pathname = usePathname();
  const inFinance = FINANCE_PATHS.some((path) => under(pathname, path));
  const showSwitch = groups.ops.length > 0 && groups.finance.length > 0;
  const main = inFinance ? groups.finance : groups.ops.length ? groups.ops : groups.finance;

  return (
    <nav aria-label="Main" className={styles.dock} data-tour="nav">
      {showSwitch && (
        <div className={styles.switch} role="group" aria-label="Product">
          <Link href="/" className={!inFinance ? styles.switchOn : styles.switchOff} aria-current={!inFinance ? "true" : undefined}>
            Ops
          </Link>
          <Link href={groups.finance[0]?.locked ? "/locked?page=Finance" : "/finance"} className={inFinance ? styles.switchOn : styles.switchOff} aria-current={inFinance ? "true" : undefined}>
            Finance
          </Link>
        </div>
      )}
      <ul className={styles.list}>
        <li className={`brandLabel ${styles.heading}`} role="presentation">
          {inFinance ? "Finance" : "Onboarding"}
        </li>
        {main.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
        {groups.addons.length > 0 && (
          <li className={`brandLabel ${styles.heading} ${styles.headingGap}`} role="presentation">
            Add-ons
          </li>
        )}
        {groups.addons.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
        {groups.admin.length > 0 && (
          <li className={`brandLabel ${styles.heading} ${styles.headingGap}`} role="presentation">
            Brokerage
          </li>
        )}
        {groups.admin.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}
